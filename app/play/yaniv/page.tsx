"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { BrandHeader } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { useAnimationSpeed } from "@/components/game/animation-preferences-control";
import { useCardDeck } from "@/components/game/card-deck-control";
import { TableDisplaySettings } from "@/components/game/table-display-settings";
import { EndGameScreen } from "@/components/game/end-game-screen";
import { CardHand } from "@/components/game/card-hand";
import {
  deal,
  apply,
  activePlayer,
  canCallYaniv,
  yanivCardValue,
  describeSelection,
  getDiscardTopGroup,
  canAddToSelection,
  getFinalStandings,
  type YanivGameState,
  type YanivPlayer,
  type YanivSettings,
  type YanivAction,
} from "@/lib/games/yaniv";
import { YanivBot } from "@/lib/bots/yaniv-bot";
import { playBotTurns } from "@/lib/games/bot-turns";
import { getYanivHandReadout } from "@/lib/games/yaniv-readout";
import { toShellCard } from "@/lib/games/shell-types";
import { ContextTooltip } from "./context-tooltip";
import { useYanivFeedback } from "./feedback";
import { PlayerRing, useYanivTableFormFactor } from "./player-ring";
import { RoundEndOverlay } from "./round-end";
import { SelectionSummary, suitSymbol } from "./selection-summary";
import { useYanivSettings, YanivSettingsScreen } from "./settings";
import { formatQuickDrawTime, getTurnClockKey, TurnCountdown } from "./turn-clock";

const PLAYER_ID = "player-1";
const QUICK_DRAW_MS = 2000;
const bot = new YanivBot();
const botFor = (playerId: string) => (playerId === PLAYER_ID ? undefined : bot);
const yanivRules = { apply, activePlayer };

function buildPlayerDefs(numBots: number) {
  const defs: { id: string; name: string; isBot: boolean }[] = [
    { id: PLAYER_ID, name: "You", isBot: false },
  ];
  for (let i = 1; i <= numBots; i++) {
    defs.push({ id: `bot-${i}`, name: `Bot ${i}`, isBot: true });
  }
  return defs;
}



function getNextActiveIdx(players: YanivPlayer[], currentIdx: number): number {
  const N = players.length;
  for (let step = 1; step < N; step++) {
    const idx = (currentIdx + step) % N;
    if (!players[idx].eliminated) return idx;
  }
  return -1;
}


export default function YanivPage() {
  const router = useRouter();
  const formFactor = useYanivTableFormFactor();
  const [gameState, setGameState] = useState<YanivGameState | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [roundsWon, setRoundsWon] = useState(0);
  const [roundsLost, setRoundsLost] = useState(0);

  const gameStateRef = useRef<YanivGameState | null>(null);
  const turnClockGenerationRef = useRef(0);

  const {
    settings,
    loaded: settingsLoaded,
    change: changeSettings,
    save: saveSettings,
  } = useYanivSettings();
  const { lowTimeSound, idlePulses, nextUpPreview } = settings;
  const [qdTimeLeft, setQdTimeLeft] = useState<number | null>(null);
  const [animationSpeed, setAnimationSpeed] = useAnimationSpeed();
  const [cardDeck, setCardDeck] = useCardDeck();
  const feedback = useYanivFeedback(gameState, animationSpeed, nextUpPreview);
  const { actionBadges, scoreFeedback, roundOverlayReady, reshuffled, turnPreview, resetGame } = feedback;

  const qdWindowKey = gameState?.quickDrawWindow
    ? `${gameState.quickDrawWindow.discarderId}:${gameState.discardPile.length}`
    : null;

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  function dispatch(state: YanivGameState, triggerAction?: YanivAction, previousState?: YanivGameState) {
    // BUG-GAM-76: invalidate this clock synchronously. React cleans up effects
    // after the state transition, so an expiring interval can otherwise tick
    // once more and apply its 0s result to the next human turn.
    turnClockGenerationRef.current += 1;
    if (triggerAction) {
      feedback.onMove(triggerAction, previousState ?? state, state);
    }

    const s = playBotTurns(yanivRules, state, botFor, feedback.onMove);
    setGameState(s);
    setSelected([]);
    if (s.status === "round_over" || s.status === "game_over") {
      const result = s.roundResult;
      if (result) {
        const playerWon = result.callerId === PLAYER_ID && !result.assaf;
        if (playerWon) setRoundsWon((n) => n + 1);
        else setRoundsLost((n) => n + 1);
      }
    }
  }

  useEffect(() => {
    if (gameState || typeof window === "undefined") return;
    const qaGameId = new URLSearchParams(window.location.search).get("qaGameId");
    if (!qaGameId) return;

    let cancelled = false;
    fetch(`/api/yaniv/${qaGameId}/action`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`QA fixture load failed: ${res.status}`))))
      .then(({ state }) => {
        if (cancelled) return;
        setGameState(state);
        setSelected([]);
        setRoundsWon(0);
        setRoundsLost(0);
        resetGame();
      })
      .catch((error) => console.error(error));

    return () => {
      cancelled = true;
    };
  }, [gameState, resetGame]);

  useEffect(() => {
    if (!qdWindowKey) {
      queueMicrotask(() => setQdTimeLeft(null));
      return;
    }
    queueMicrotask(() => setQdTimeLeft(QUICK_DRAW_MS));
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, QUICK_DRAW_MS - elapsed);
      setQdTimeLeft(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        const s = gameStateRef.current;
        if (s?.quickDrawWindow) {
          dispatch(apply(s, { type: "QUICK_DRAW_EXPIRE" }), { type: "QUICK_DRAW_EXPIRE" }, s);
        }
      }
    }, 50);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qdWindowKey]);

  useEffect(() => {
    if (!gameState?.quickDrawWindow) return;
    const win = gameState.quickDrawWindow;
    if (win.discarderId !== PLAYER_ID) return;
    const stealingBot = gameState.players.find(
      (p) => p.isBot && bot.shouldQuickDraw(gameState, p.id),
    );
    if (!stealingBot) return;
    const botId = stealingBot.id;
    const delay = 300 + Math.random() * 1300;
    const timeout = setTimeout(() => {
      const s = gameStateRef.current;
      if (!s?.quickDrawWindow) return;
      const action = { type: "QUICK_DRAW_STEAL" as const, playerId: botId };
      dispatch(apply(s, action), action, s);
    }, delay);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qdWindowKey]);

  // ── Per-turn countdown clock ───────────────────────────────────────────────
  // Runs only while the human is the active player (bots resolve synchronously,
  // so they never "sit" on a turn). Resets whenever the active turn changes.
  const turnKey = getTurnClockKey(gameState, PLAYER_ID);

  const autoPlayTurnTimeout = useCallback(() => {
    const s = gameStateRef.current;
    if (!s || s.status !== "in_progress" || s.quickDrawWindow) return;
    if (s.players[s.currentPlayerIndex]?.id !== PLAYER_ID) return;
    const human = s.players.find((p) => p.id === PLAYER_ID);
    if (!human || human.hand.length === 0) return;
    // Safe default: drop the single highest-value card and draw from the deck.
    let hi = 0;
    for (let i = 1; i < human.hand.length; i++) {
      if (yanivCardValue(human.hand[i].rank) > yanivCardValue(human.hand[hi].rank)) hi = i;
    }
    const action = {
      type: "DISCARD_AND_DRAW" as const,
      playerId: PLAYER_ID,
      discardIndices: [hi],
      drawFromDiscard: false,
    };
    dispatch(apply(s, action), action, s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The per-turn countdown interval, low-time cue, and auto-play-on-expiry now
  // live in <TurnCountdown> (rendered below) so a 10Hz tick no longer re-renders
  // this whole component — see CAR-182. `turnKey`/`autoPlayTurnTimeout` are
  // forwarded to it unchanged.

  const startGame = useCallback(() => {
    const { yanivThreshold, scoreLimit, quickDraw, numBots } = settings;
    const rules: YanivSettings = { yanivThreshold, scoreLimit, quickDraw };
    saveSettings();
    const initial = deal(`game-${Date.now()}`, buildPlayerDefs(numBots), rules);
    setGameState(playBotTurns(yanivRules, initial, botFor));
    setSelected([]);
    setRoundsWon(0);
    setRoundsLost(0);
    resetGame();
  }, [settings, saveSettings, resetGame]);

  function callYaniv() {
    if (!gameState) return;
    const action = { type: "CALL_YANIV" as const, playerId: PLAYER_ID };
    dispatch(apply(gameState, action), action, gameState);
  }

  function discardAndDraw(drawFromDiscard: boolean, drawDiscardIndex?: number) {
    if (!gameState || selected.length === 0) return;
    const action = {
      type: "DISCARD_AND_DRAW" as const,
      playerId: PLAYER_ID,
      discardIndices: selected,
      drawFromDiscard,
      drawDiscardIndex,
    };
    dispatch(apply(gameState, action), action, gameState);
  }

  function stealFromDiscard() {
    if (!gameState?.quickDrawWindow) return;
    const action = { type: "QUICK_DRAW_STEAL" as const, playerId: PLAYER_ID };
    dispatch(apply(gameState, action), action, gameState);
  }

  function nextRound() {
    if (!gameState) return;
    const s = playBotTurns(yanivRules, apply(gameState, { type: "NEXT_ROUND", playerId: PLAYER_ID }), botFor);
    setGameState(s);
    setSelected([]);
    feedback.resetRound();
  }

  function toggleCard(idx: number) {
    setSelected((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx],
    );
  }

  // ── Settings screen ──────────────────────────────────────────────────────
  if (!gameState) {
    return (
      <YanivSettingsScreen
        settings={settings}
        onChange={changeSettings}
        canStart={settingsLoaded}
        onStart={startGame}
        animationSpeed={animationSpeed}
        onAnimationSpeedChange={setAnimationSpeed}
        cardDeck={cardDeck}
        onCardDeckChange={setCardDeck}
      />
    );
  }

  // ── Game screen ──────────────────────────────────────────────────────────
  const player = gameState.players.find((p) => p.id === PLAYER_ID)!;
  const isMyTurn =
    gameState.status === "in_progress" &&
    !gameState.quickDrawWindow &&
    gameState.players[gameState.currentPlayerIndex]?.id === PLAYER_ID;
  const handReadout = getYanivHandReadout(player.hand, gameState.settings.yanivThreshold);
  const playerTotal = handReadout.total;
  const canYaniv = isMyTurn && canCallYaniv(player.hand, gameState.settings.yanivThreshold);
  const selectedCards = selected.map((i) => player.hand[i]).filter(Boolean);
  const selection = describeSelection(selectedCards);
  const canDiscard = isMyTurn && selection.valid;
  const topGroup = getDiscardTopGroup(gameState);
  const isRoundOver = gameState.status === "round_over";
  const isGameOver = gameState.status === "game_over";
  const finalStandings = isGameOver ? getFinalStandings(gameState) : [];
  const winnerName = finalStandings.find((row) => row.isWinner)?.name;
  const qdWindow = gameState.quickDrawWindow;
  const qdActive = !!qdWindow;
  const qdPlayerCanSteal =
    qdActive &&
    !!qdWindow &&
    gameState.players.find((p) => p.id === qdWindow.discarderId)?.isBot === true;
  const qdTimerLabel = formatQuickDrawTime(qdTimeLeft ?? QUICK_DRAW_MS);
  const qdProgress = Math.max(0, Math.min(1, (qdTimeLeft ?? QUICK_DRAW_MS) / QUICK_DRAW_MS));

  const cardDisabled = player.hand.map((card, i) => {
    if (!isMyTurn) return true;
    if (selected.includes(i)) return false;
    return !canAddToSelection(selectedCards, card);
  });

  const nextPlayerIdx = getNextActiveIdx(gameState.players, gameState.currentPlayerIndex);
  const turnTimerActive = turnKey !== null;

  return (
    <div className="dark flex flex-col min-h-screen bg-[var(--pip-table)] text-foreground">
      {reshuffled && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground px-5 py-2 rounded-full shadow-xl font-medium text-sm pointer-events-none">
          Reshuffled!
        </div>
      )}
      {turnPreview && (
        <div
          key={turnPreview.key}
          className="fixed top-32 left-1/2 z-50 -translate-x-1/2 rounded-full border border-primary/40 bg-card/95 px-4 py-2 text-sm font-semibold text-card-foreground shadow-xl pointer-events-none"
          role="status"
          aria-live="polite"
        >
          <span className="text-muted-foreground">Next up:</span>{" "}
          <span className="text-primary">{turnPreview.name}</span>
        </div>
      )}
      <BrandHeader title="Yaniv" tone="red" backLabel="Back" />

      <div className="yaniv-table-shell flex-1 flex flex-col p-3 md:p-5 gap-3 mx-auto w-full pip-table-surface pip-table-rail rounded-3xl">
        {!isRoundOver && !isGameOver && (
          <TableDisplaySettings
            animationSpeed={animationSpeed}
            onAnimationSpeedChange={setAnimationSpeed}
            cardDeck={cardDeck}
            onCardDeckChange={setCardDeck}
          />
        )}

        {/* Circular player ring. Wrapped in <TurnCountdown> so the per-turn
            10Hz tick re-renders only the countdown ring + seconds readout via
            context, never PlayerRing itself (CAR-182). */}
        <TurnCountdown
          turnKey={turnKey}
          lowTimeSound={lowTimeSound}
          turnClockGenerationRef={turnClockGenerationRef}
          onExpire={autoPlayTurnTimeout}
        >
          <PlayerRing
            players={gameState.players}
            humanId={PLAYER_ID}
            currentPlayerIndex={gameState.currentPlayerIndex}
            nextPlayerIndex={nextPlayerIdx}
            turnTimerActive={turnTimerActive}
            idlePulses={idlePulses}
            actionBadges={actionBadges}
            scoreFeedback={scoreFeedback}
            qdActive={qdActive}
            qdWindow={qdWindow}
            qdProgress={qdProgress}
            qdTimeLeft={qdTimeLeft ?? 0}
            qdPlayerCanSteal={qdPlayerCanSteal}
            deckCount={gameState.deck.length}
            discardTopGroup={topGroup}
            canDrawFromDiscard={canDiscard}
            onPickDiscardCard={(idx) => discardAndDraw(true, idx)}
            onSteal={stealFromDiscard}
          />
        </TurnCountdown>

        <div className="yaniv-bottom-zone flex flex-col gap-2">
        {/* Human player hand */}
        <div className="pip-seat-panel rounded-xl p-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="text-foreground text-sm font-medium">
              {player.name}
              {isMyTurn && <span className="ml-2 text-primary text-xs">— your turn</span>}
            </span>
            <div className="flex flex-wrap items-center justify-end gap-2 text-xs tabular-nums">
              <span className="text-muted-foreground">Score: {player.score}</span>
              <ContextTooltip
                text={`Your hand total is ${handReadout.total}. You can call Yaniv at ${handReadout.threshold} or less.`}
                className="rounded-md"
              >
                <span
                  className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/15 px-2 py-1 font-medium text-foreground"
                  aria-label={`Hand total ${handReadout.total}. Yaniv threshold ${handReadout.threshold}. ${
                    handReadout.withinThreshold
                      ? "You can call Yaniv on your turn."
                      : `${handReadout.distanceToThreshold} points over the Yaniv threshold.`
                  }`}
                >
                  <span>Hand {handReadout.total}</span>
                  <span className="text-muted-foreground">/</span>
                  <span
                    className={
                      handReadout.withinThreshold ? "text-emerald-300" : "text-amber-300"
                    }
                  >
                    {handReadout.withinThreshold
                      ? "Yaniv ready"
                      : `${handReadout.distanceToThreshold} over Yaniv`}
                  </span>
                </span>
              </ContextTooltip>
            </div>
          </div>
          <CardHand
            cards={player.hand.map((card) => toShellCard(card))}
            gameType="yaniv"
            formFactor={formFactor}
            selectedIndices={selected}
            disabledIndices={cardDisabled.map((isDisabled, i) => (isDisabled ? i : -1)).filter((i) => i >= 0)}
            onCardClick={(_, i) => toggleCard(i)}
            cardClassName={(_, i) => {
              const isSelected = selected.includes(i);
              const isDisabled = cardDisabled[i];
              return isDisabled
                ? "opacity-35 cursor-not-allowed"
                : isSelected
                  ? "-translate-y-4 card-selected-glow cursor-pointer"
                  : isMyTurn
                    ? "hover:-translate-y-1 cursor-pointer"
                    : "cursor-default";
            }}
          />
        </div>

        {/* Action buttons */}
        {isMyTurn && (
          <div className="flex flex-col gap-2">
            {canYaniv && (
              <ContextTooltip
                text="End the round now. If another player has an equal or lower hand, you take the Assaf penalty."
                className="w-full"
              >
                <Button
                  onClick={callYaniv}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold"
                >
                  Call Yaniv! (hand = {playerTotal})
                </Button>
              </ContextTooltip>
            )}
            {selected.length > 0 && (
              <SelectionSummary cards={selectedCards} selection={selection} />
            )}
            <div className="flex gap-2">
              <ContextTooltip
                text="Discard your selected legal set, then draw one unknown card from the deck."
                className="flex-1 min-w-0"
              >
                <Button
                  onClick={() => discardAndDraw(false)}
                  disabled={!canDiscard}
                  className="w-full whitespace-normal text-center leading-tight py-2"
                  variant="default"
                >
                  Discard &amp; Draw from Deck
                </Button>
              </ContextTooltip>
              <ContextTooltip
                text="Discard your selected legal set, then take one visible card from the top discard group."
                className="flex-1 min-w-0"
              >
                <Button
                  onClick={() => discardAndDraw(true)}
                  disabled={!canDiscard || topGroup.length === 0}
                  className="w-full"
                  variant="outline"
                >
                  Discard &amp; Take{" "}
                  {topGroup.length > 0
                    ? `${topGroup[topGroup.length - 1].rank}${suitSymbol(topGroup[topGroup.length - 1].suit)}`
                    : "pile"}
                </Button>
              </ContextTooltip>
            </div>
            {selected.length === 0 && !canYaniv && (
              <p className="text-muted-foreground text-xs text-center">
                Tap a card (or cards) to select, then discard
              </p>
            )}
          </div>
        )}

        {qdActive && (
          <div className="flex items-center justify-center gap-2 text-sm font-medium text-amber-400">
            <span className="animate-pulse">
              {qdPlayerCanSteal
                ? "Steal the discard? Click the highlighted card!"
                : "Quick-draw window — bot may steal…"}
            </span>
            <span
              className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-300"
              role="timer"
              aria-live="polite"
            >
              {qdTimerLabel}
            </span>
          </div>
        )}
        {!isMyTurn && !qdActive && gameState.status === "in_progress" && (
          <p className="text-muted-foreground text-sm text-center">Bot is thinking…</p>
        )}
        </div>
      </div>

      {isRoundOver && gameState.roundResult && roundOverlayReady && (
        <RoundEndOverlay
          state={gameState}
          playerId={PLAYER_ID}
          onNextRound={nextRound}
          onChangeGame={() => router.push("/")}
        />
      )}

      {isGameOver && (
        <EndGameScreen
          headline={gameState.winnerId === PLAYER_ID ? "You Win!" : "Game Complete"}
          subline={
            gameState.winnerId === PLAYER_ID
              ? "You outlasted the table."
              : `${winnerName ?? "The winner"} outlasted the table.`
          }
          winnerName={winnerName}
          standings={finalStandings.map((row) => ({
            rank: row.rank,
            name: row.name,
            score: row.score,
            eliminated: row.eliminated,
            isWinner: row.isWinner,
          }))}
          sessionRows={[
            { label: "Rounds Won", value: roundsWon },
            { label: "Rounds Lost", value: roundsLost },
          ]}
          onPlayAgain={startGame}
          onChangeGame={() => router.push("/")}
        />
      )}
    </div>
  );
}
