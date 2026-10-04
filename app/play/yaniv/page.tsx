"use client";

import { useRouter } from "next/navigation";
import { BrandHeader } from "@/components/brand-logo";
import { useAnimationSpeed } from "@/components/game/animation-preferences-control";
import { useCardDeck } from "@/components/game/card-deck-control";
import { TableDisplaySettings } from "@/components/game/table-display-settings";
import { EndGameScreen } from "@/components/game/end-game-screen";
import { describeSelection, getDiscardTopGroup, getFinalStandings } from "@/lib/games/yaniv";
import { PlayerRing } from "./player-ring";
import { RoundEndOverlay } from "./round-end";
import { HandPanel } from "./hand-panel";
import { useYanivSettings, YanivSettingsScreen } from "./settings";
import { PLAYER_ID, QUICK_DRAW_MS, useYanivSession } from "./session";
import { formatQuickDrawTime, TurnCountdown } from "./turn-clock";

export default function YanivPage() {
  const router = useRouter();
  const {
    settings,
    loaded: settingsLoaded,
    change: changeSettings,
    save: saveSettings,
  } = useYanivSettings();
  const { lowTimeSound, idlePulses, nextUpPreview } = settings;
  const [animationSpeed, setAnimationSpeed] = useAnimationSpeed();
  const [cardDeck, setCardDeck] = useCardDeck();
  const session = useYanivSession(animationSpeed, nextUpPreview);
  const { gameState, selected, qdTimeLeft, turnKey } = session;
  const { actionBadges, scoreFeedback, roundOverlayReady, reshuffled, turnPreview } = session.feedback;

  function startGame() {
    saveSettings();
    session.start(settings);
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
          turnClockGenerationRef={session.turnClockGenerationRef}
          onExpire={session.autoPlayTurnTimeout}
        >
          <PlayerRing
            players={gameState.players}
            humanId={PLAYER_ID}
            currentPlayerIndex={gameState.currentPlayerIndex}
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
            onPickDiscardCard={(idx) => session.discardAndDraw(true, idx)}
            onSteal={session.stealFromDiscard}
          />
        </TurnCountdown>

        <div className="yaniv-bottom-zone flex flex-col gap-2">
        <HandPanel
          player={player}
          threshold={gameState.settings.yanivThreshold}
          isMyTurn={isMyTurn}
          selected={selected}
          selectedCards={selectedCards}
          selection={selection}
          canDiscard={canDiscard}
          topGroup={topGroup}
          onToggleCard={session.toggleCard}
          onCallYaniv={session.callYaniv}
          onDiscardAndDraw={session.discardAndDraw}
        />

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
          onNextRound={session.nextRound}
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
            { label: "Rounds Won", value: session.roundsWon },
            { label: "Rounds Lost", value: session.roundsLost },
          ]}
          onPlayAgain={startGame}
          onChangeGame={() => router.push("/")}
        />
      )}
    </div>
  );
}
