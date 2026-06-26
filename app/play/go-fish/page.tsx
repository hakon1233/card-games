"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandHeader } from "@/components/brand-logo";
import { EndGameScreen, type StandingRow } from "@/components/game/end-game-screen";
import { PlayingCard } from "@/components/game/card";
import { Button } from "@/components/ui/button";
import { RANKS } from "@/lib/games/deck-utils";
import {
  dealGoFish,
  applyAsk,
  type GoFishGameState,
  type GoFishPlayer,
  type GoFishEvent,
} from "@/lib/games/go-fish";
import { GoFishBot } from "@/lib/bots/go-fish-bot";
import type { Rank } from "@/lib/games/types";

const HUMAN_ID = "you";

const PLAYER_DEFS = [
  { id: HUMAN_ID, name: "You", isBot: false },
  { id: "bot-marlin", name: "Marlin", isBot: true },
  { id: "bot-pearl", name: "Pearl", isBot: true },
];

// Pacing for bot turns so a human can follow the table chatter (GAM-99).
const BOT_TURN_DELAY_MS = 950;
const SKIP_DELAY_MS = 700;

const bot = new GoFishBot();

interface RankGroup {
  rank: Rank;
  count: number;
}

/** Distinct ranks the human holds, in canonical rank order, with counts. */
function groupHandByRank(player: GoFishPlayer | undefined): RankGroup[] {
  if (!player) return [];
  const counts = new Map<Rank, number>();
  for (const card of player.hand) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  return RANKS.filter((r) => counts.has(r)).map((rank) => ({
    rank,
    count: counts.get(rank)!,
  }));
}

function playerName(state: GoFishGameState, id: string): string {
  return state.players.find((p) => p.id === id)?.name ?? "Someone";
}

/** Human-readable summary of the most recent ask, from the human's vantage. */
function describeEvent(state: GoFishGameState, event: GoFishEvent | null): string {
  if (!event) return "";
  const askerIsYou = event.askingPlayerId === HUMAN_ID;
  const targetIsYou = event.targetPlayerId === HUMAN_ID;
  const asker = askerIsYou ? "You" : playerName(state, event.askingPlayerId);
  const target = targetIsYou ? "you" : playerName(state, event.targetPlayerId);
  const rank = event.rank;

  switch (event.outcome) {
    case "gave_cards": {
      const n = event.transferCount;
      const cards = `${n} ${rank}${n > 1 ? "s" : ""}`;
      return askerIsYou
        ? `You asked ${target} for ${rank}s — got ${cards}! Go again.`
        : `${asker} asked ${target} for ${rank}s — handed over ${cards}.`;
    }
    case "go_fish":
      return askerIsYou
        ? `You asked ${target} for ${rank}s — Go Fish! You drew a card.`
        : `${asker} asked ${target} for ${rank}s — Go Fish.`;
    case "go_fish_lucky":
      return askerIsYou
        ? `You asked ${target} for ${rank}s — Go Fish… lucky! You fished a ${rank}. Go again.`
        : `${asker} asked ${target} for ${rank}s — Go Fish, but fished a ${rank}. Goes again.`;
    default:
      return "";
  }
}

function nextIndex(state: GoFishGameState): number {
  return (state.currentPlayerIndex + 1) % state.players.length;
}

function buildStandings(state: GoFishGameState): StandingRow[] {
  return [...state.players]
    .map((p) => ({ p, books: p.books.length }))
    .sort((a, b) => b.books - a.books)
    .map(({ p, books }, i) => ({
      rank: i + 1,
      name: p.id === HUMAN_ID ? "You" : p.name,
      score: books,
      isWinner: state.winners.includes(p.id),
    }));
}

export default function GoFishPage() {
  const router = useRouter();
  const [state, setState] = useState<GoFishGameState | null>(null);
  const [selectedRank, setSelectedRank] = useState<Rank | null>(null);
  const [session, setSession] = useState({ wins: 0, losses: 0 });
  const recordedRef = useRef<string | null>(null);
  const botTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startGame = useCallback(() => {
    setSelectedRank(null);
    recordedRef.current = null;
    setState(dealGoFish(`go-fish-${Date.now()}`, PLAYER_DEFS));
  }, []);

  const human = state?.players.find((p) => p.id === HUMAN_ID);
  const current = state ? state.players[state.currentPlayerIndex] : undefined;
  const isHumanTurn = state?.status === "in_progress" && current?.id === HUMAN_ID;
  const isOver = state?.status === "over";
  const rankGroups = useMemo(() => groupHandByRank(human), [human]);

  // Drive bot turns (and skip any empty-handed player) off the current state.
  // Each applyAsk produces a fresh state object, so this effect re-runs and
  // schedules the next step until it is the human's turn or the game is over.
  useEffect(() => {
    if (!state || state.status !== "in_progress") return;
    const active = state.players[state.currentPlayerIndex];

    // A player with no cards can't ask (the engine has no draw-to-refill move).
    // Skip their turn — deck depletion still ends the game. Matches the engine
    // test loop's manual advance for empty hands.
    if (active.hand.length === 0) {
      botTimer.current = setTimeout(() => {
        setState((s) =>
          s ? { ...s, currentPlayerIndex: nextIndex(s), lastEvent: null } : s,
        );
      }, SKIP_DELAY_MS);
      return () => {
        if (botTimer.current) clearTimeout(botTimer.current);
      };
    }

    if (active.id === HUMAN_ID) return; // wait for the human to act

    botTimer.current = setTimeout(() => {
      setState((s) => {
        if (!s || s.status !== "in_progress") return s;
        const mover = s.players[s.currentPlayerIndex];
        if (mover.id === HUMAN_ID || mover.hand.length === 0) return s;
        return applyAsk(s, bot.getNextMove(s, mover.id));
      });
    }, BOT_TURN_DELAY_MS);

    return () => {
      if (botTimer.current) clearTimeout(botTimer.current);
    };
  }, [state]);

  // Record the session result exactly once when a game ends.
  useEffect(() => {
    if (!state || state.status !== "over") return;
    if (recordedRef.current === state.gameId) return;
    recordedRef.current = state.gameId;
    const youWon = state.winners.includes(HUMAN_ID);
    setSession((s) => ({
      wins: s.wins + (youWon ? 1 : 0),
      losses: s.losses + (youWon ? 0 : 1),
    }));
  }, [state]);

  const ask = useCallback(
    (targetId: string) => {
      if (!state || !selectedRank || !isHumanTurn) return;
      const next = applyAsk(state, {
        type: "ASK",
        playerId: HUMAN_ID,
        targetPlayerId: targetId,
        rank: selectedRank,
      });
      setSelectedRank(null);
      setState(next);
    },
    [state, selectedRank, isHumanTurn],
  );

  // ── Start screen ──────────────────────────────────────────────────────────
  if (!state) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <BrandHeader title="Go Fish" backLabel="Back" />
        <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
          <div className="max-w-sm">
            <p className="pip-eyebrow text-xs">Pip Playing &amp; Card Co.</p>
            <h1 className="mt-3 font-heading text-3xl font-bold text-foreground">
              Go Fish
            </h1>
            <p className="mt-3 text-muted-foreground">
              Ask Marlin or Pearl for a rank you already hold. Collect all four
              of a kind to land a book. Most books when the pond runs dry wins.
            </p>
          </div>
          <Button onClick={startGame} size="lg" className="h-11 px-8 text-base">
            Deal cards
          </Button>
        </main>
      </div>
    );
  }

  const opponents = state.players.filter((p) => p.id !== HUMAN_ID);
  const statusLine = describeEvent(state, state.lastEvent);
  const winnerName = state.winners.includes(HUMAN_ID)
    ? "You"
    : playerName(state, state.winners[0] ?? "");
  const headline = state.winners.includes(HUMAN_ID)
    ? state.winners.length > 1
      ? "You tied!"
      : "You win!"
    : `${winnerName} wins`;

  // Dedicated screen-reader status. Unlike the visible table-status (which keeps
  // echoing the last bot event for sighted players), this region must always
  // reflect turn state so assistive tech announces "your turn" when control
  // returns to the human — mirrors the Crazy Eights pattern (GAM-117). On the
  // human's turn we lead with the turn cue, then append the prior bot event for
  // context; otherwise we surface the bot event / dealing / end-of-game state.
  const liveStatus = isOver
    ? headline
    : isHumanTurn
      ? statusLine
        ? `Your turn — pick a rank to ask for. ${statusLine}`
        : "Your turn — pick a rank to ask for."
      : statusLine || "Dealing…";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <BrandHeader title="Go Fish" backLabel="Back" />

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
        {/* Opponents */}
        <section className="grid grid-cols-2 gap-3" aria-label="Opponents">
          {opponents.map((opp) => {
            const isActive =
              state.status === "in_progress" &&
              state.players[state.currentPlayerIndex].id === opp.id;
            return (
              <div
                key={opp.id}
                className={`rounded-xl border p-3 transition-colors ${
                  isActive
                    ? "border-[color-mix(in_oklab,var(--pip-gold)_62%,transparent)] bg-[color-mix(in_oklab,var(--pip-gold)_14%,var(--card))]"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-heading font-bold text-foreground">
                    {opp.name}
                  </span>
                  {isActive && (
                    <span className="pip-eyebrow shrink-0 text-[10px] text-[var(--pip-gold-dark)]">
                      Asking
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {opp.hand.length} card{opp.hand.length === 1 ? "" : "s"}
                  </span>
                  <span>
                    {opp.books.length} book{opp.books.length === 1 ? "" : "s"}
                  </span>
                </div>
                {opp.books.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1" aria-hidden="true">
                    {opp.books.map((r) => (
                      <span
                        key={r}
                        className="rounded bg-[color-mix(in_oklab,var(--pip-gold)_22%,var(--card))] px-1.5 py-0.5 text-[0.7rem] font-bold text-foreground"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {/* Screen-reader turn announcer — always reflects turn state so a
            keyboard/SR player hears a cue when control returns to them (GAM-117). */}
        <p className="sr-only" role="status" aria-live="polite">
          {liveStatus}
        </p>

        {/* Table status (visible; not a live region so SR isn't double-announced) */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <p className="min-w-0 text-sm text-foreground">
            {statusLine ||
              (isHumanTurn ? "Your turn — pick a rank to ask for." : "Dealing…")}
          </p>
          <span className="shrink-0 text-xs text-muted-foreground">
            Pond: {state.deck.length}
          </span>
        </div>

        {/* Your books */}
        {human && human.books.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="pip-eyebrow text-[10px] text-[var(--pip-gold-dark)]">
              Your books
            </span>
            {human.books.map((r) => (
              <span
                key={r}
                className="rounded-md border border-[color-mix(in_oklab,var(--pip-gold)_55%,transparent)] bg-[color-mix(in_oklab,var(--pip-gold)_18%,var(--card))] px-2 py-0.5 text-sm font-bold text-foreground"
              >
                {r}
              </span>
            ))}
          </div>
        )}

        {/* Your hand */}
        <section aria-label="Your hand" className="mt-auto">
          <div className="mb-2 flex items-center justify-between">
            <span className="pip-eyebrow text-[10px]">Your hand</span>
            <span className="text-xs text-muted-foreground">
              {human?.hand.length ?? 0} cards
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {rankGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You&apos;re out of cards — your turn will pass.
              </p>
            ) : (
              rankGroups.map((g) => {
                const selected = selectedRank === g.rank;
                const card = human!.hand.find((c) => c.rank === g.rank)!;
                return (
                  <button
                    key={g.rank}
                    type="button"
                    onClick={() => isHumanTurn && setSelectedRank(g.rank)}
                    disabled={!isHumanTurn}
                    aria-pressed={selected}
                    aria-label={`Ask for ${g.rank}s — you hold ${g.count}`}
                    className={`relative rounded-lg transition-transform disabled:cursor-default ${
                      selected ? "-translate-y-2" : "enabled:hover:-translate-y-1"
                    } ${
                      selected ? "card-selected-glow" : ""
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
                  >
                    <PlayingCard card={{ ...card, faceUp: true }} size="md" />
                    {g.count > 1 && (
                      <span
                        className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-[var(--pip-tin-red)] text-[0.7rem] font-bold text-[var(--pip-cream)] shadow"
                        aria-hidden="true"
                      >
                        {g.count}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </section>
      </main>

      {/* Action bar */}
      <div className="sticky bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
          <p className="text-center text-xs text-muted-foreground">
            {isHumanTurn
              ? selectedRank
                ? `Ask who for ${selectedRank}s?`
                : "Tap one of your cards to choose a rank."
              : `Waiting for ${current?.name ?? "the table"}…`}
          </p>
          <div className="flex gap-2">
            {opponents.map((opp) => (
              <Button
                key={opp.id}
                onClick={() => ask(opp.id)}
                disabled={!isHumanTurn || !selectedRank || opp.hand.length === 0}
                variant={selectedRank ? "default" : "outline"}
                className="h-11 flex-1"
              >
                Ask {opp.name}
                {selectedRank ? ` for ${selectedRank}s` : ""}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {isOver && (
        <EndGameScreen
          headline={headline}
          subline={`${winnerName} landed the most books.`}
          winnerName={winnerName}
          standings={buildStandings(state)}
          sessionRows={[
            { label: "Wins", value: session.wins },
            { label: "Losses", value: session.losses },
          ]}
          onPlayAgain={startGame}
          onChangeGame={() => router.push("/")}
        />
      )}
    </div>
  );
}
