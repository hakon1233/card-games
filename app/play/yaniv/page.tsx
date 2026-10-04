"use client";

import { useRouter } from "next/navigation";
import { BrandHeader } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { useAnimationSpeed } from "@/components/game/animation-preferences-control";
import { useCardDeck } from "@/components/game/card-deck-control";
import { TableDisplaySettings } from "@/components/game/table-display-settings";
import { EndGameScreen } from "@/components/game/end-game-screen";
import { CardHand } from "@/components/game/card-hand";
import {
  canCallYaniv,
  describeSelection,
  getDiscardTopGroup,
  canAddToSelection,
  getFinalStandings,
  type YanivPlayer,
} from "@/lib/games/yaniv";
import { getYanivHandReadout } from "@/lib/games/yaniv-readout";
import { toShellCard } from "@/lib/games/shell-types";
import { ContextTooltip } from "./context-tooltip";
import { PlayerRing, useYanivTableFormFactor } from "./player-ring";
import { RoundEndOverlay } from "./round-end";
import { SelectionSummary, suitSymbol } from "./selection-summary";
import { useYanivSettings, YanivSettingsScreen } from "./settings";
import { PLAYER_ID, QUICK_DRAW_MS, useYanivSession } from "./session";
import { formatQuickDrawTime, TurnCountdown } from "./turn-clock";

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
  const {
    settings,
    loaded: settingsLoaded,
    change: changeSettings,
    save: saveSettings,
  } = useYanivSettings();
  const { lowTimeSound, idlePulses, nextUpPreview } = settings;
  const [animationSpeed, setAnimationSpeed] = useAnimationSpeed();
  const [cardDeck, setCardDeck] = useCardDeck();
  const {
    gameState,
    selected,
    roundsWon,
    roundsLost,
    qdTimeLeft,
    feedback,
    turnKey,
    turnClockGenerationRef,
    autoPlayTurnTimeout,
    start,
    callYaniv,
    discardAndDraw,
    stealFromDiscard,
    nextRound,
    toggleCard,
  } = useYanivSession(animationSpeed, nextUpPreview);
  const { actionBadges, scoreFeedback, roundOverlayReady, reshuffled, turnPreview } = feedback;

  function startGame() {
    saveSettings();
    start(settings);
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
