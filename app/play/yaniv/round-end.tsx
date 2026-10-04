"use client";

// The round-end overlay: who called Yaniv and every player's hand and scores.

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { PlayingCard } from "@/components/game/card";
import { toShellCard } from "@/lib/games/shell-types";
import type { YanivGameState, YanivPlayer } from "@/lib/games/yaniv";
import { getYanivScoreboardRows, type YanivScoreboardRow } from "@/lib/games/yaniv-scoreboard";

// ── RoundEndOverlay ───────────────────────────────────────────────────────

export function RoundEndOverlay({
  state,
  playerId,
  onNextRound,
  onChangeGame,
}: {
  state: YanivGameState;
  playerId: string;
  onNextRound: () => void;
  onChangeGame: () => void;
}) {
  const result = state.roundResult!;
  const scoreboardRows = getYanivScoreboardRows(state);
  const callerName = state.players.find((p) => p.id === result.callerId)?.name ?? "Someone";
  const callerIsPlayer = result.callerId === playerId;
  const callerDelta = result.scoreDeltas[result.callerId] ?? 0;
  const callerDeltaLabel = callerDelta >= 0 ? `+${callerDelta}` : String(callerDelta);

  let headline: string;
  if (result.assaf) {
    headline = callerIsPlayer ? `Assaf! You got ${callerDeltaLabel}` : `Assaf! ${callerName} got ${callerDeltaLabel}`;
  } else {
    headline = callerIsPlayer ? "Yaniv! You win this round" : `${callerName} called Yaniv`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-card border border-border p-5 shadow-2xl flex flex-col gap-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-card-foreground">{headline}</p>
          <p className="text-sm text-muted-foreground mt-1">Round {state.round} complete</p>
        </div>

        <div className="overflow-hidden rounded-xl border border-border/80">
          <div className="grid grid-cols-[minmax(0,1.2fr)_4.2rem_4rem_4.5rem] items-center gap-2 bg-muted/50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Player</span>
            <span className="text-right">Hand</span>
            <span className="text-right">Round</span>
            <span className="text-right">Total</span>
          </div>
          <div className="divide-y divide-border/70">
            {scoreboardRows.map((row) => {
              const player = state.players.find((p) => p.id === row.id);
              if (!player) return null;

              return <RoundScoreboardRow key={row.id} row={row} player={player} />;
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button onClick={onNextRound} className="w-full h-11 font-semibold">
            Next Round
          </Button>
          <Button
            onClick={onChangeGame}
            variant="ghost"
            className="w-full h-10 text-muted-foreground hover:text-foreground"
          >
            Change Game
          </Button>
        </div>
      </div>
    </div>
  );
}

function RoundScoreboardRow({
  row,
  player,
}: {
  row: YanivScoreboardRow;
  player: YanivPlayer;
}) {
  const thresholdClasses = {
    safe: "text-foreground",
    warning: "text-amber-300",
    busted: "text-destructive",
  }[row.thresholdState];

  const statusLabel =
    row.thresholdState === "busted"
      ? "busted"
      : row.thresholdState === "warning"
        ? "near bust"
        : null;

  // Stabilize converted-card identity so PlayingCard's memo bails out when the
  // scoreboard re-renders on clock ticks while the hand itself is unchanged.
  const handCards = useMemo(() => player.hand.map((card) => toShellCard(card)), [player.hand]);

  return (
    <div
      className={`grid grid-cols-[minmax(0,1.2fr)_4.2rem_4rem_4.5rem] items-center gap-2 px-3 py-2.5 ${
        row.thresholdState === "warning"
          ? "bg-amber-400/10"
          : row.thresholdState === "busted"
            ? "bg-destructive/10"
            : "bg-card"
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-card-foreground">{row.name}</span>
          {statusLabel && (
            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${thresholdClasses}`}>
              {statusLabel}
            </span>
          )}
        </div>
        {row.save && (
          <div className="mt-1">
            <span
              className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300"
              title={`Save rule: landing on ${row.save.from} is halved to ${row.save.to}`}
            >
              Saved {row.save.from} → {row.save.to}
            </span>
          </div>
        )}
        <div className="mt-1 flex min-h-8 flex-wrap gap-1">
          {handCards.map((card, i) => (
            <PlayingCard key={i} card={card} size="sm" />
          ))}
        </div>
      </div>
      <span className="text-right text-sm font-semibold tabular-nums text-muted-foreground">
        {row.handTotal}
      </span>
      <span
        className={`text-right text-sm font-bold tabular-nums ${
          row.roundDelta > 0
            ? "text-amber-300"
            : row.roundDelta < 0
              ? "text-emerald-300"
              : "text-muted-foreground"
        }`}
        style={{ animation: "score-delta-pop 700ms ease-out both" }}
        aria-label={
          row.save
            ? `Round change ${row.roundDelta}, after save rule halved ${row.save.from} to ${row.save.to}`
            : undefined
        }
      >
        {row.roundDelta > 0 ? `+${row.roundDelta}` : row.roundDelta}
      </span>
      <span className={`text-right text-xl font-bold tabular-nums ${thresholdClasses}`}>
        {row.cumulativeScore}
      </span>
    </div>
  );
}
