"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EndGameScreen } from "@/components/game/end-game-screen";
import { PlayingCard } from "@/components/game/card";
import {
  dealGame,
  applyAction,
  canCallYaniv,
  handTotal,
  yanivCardValue,
  isValidDiscard,
  getDiscardTopGroup,
  canAddToSelection,
  DEFAULT_YANIV_SETTINGS,
  type YanivGameState,
  type YanivPlayer,
  type YanivSettings,
  type YanivAction,
  type YanivQuickDrawWindow,
} from "@/lib/games/yaniv";
import { YanivBot } from "@/lib/bots/yaniv-bot";
import type { ShellCard } from "@/lib/games/shell-types";

const PLAYER_ID = "player-1";
const SETTINGS_KEY = "yaniv-settings";
const QUICK_DRAW_MS = 2000;
const bot = new YanivBot();

type ActionBadge = { text: string; variant: "drew" | "yaniv" | "stolen"; key: number };

function buildPlayerDefs(numBots: number) {
  const defs: { id: string; name: string; isBot: boolean }[] = [
    { id: PLAYER_ID, name: "You", isBot: false },
  ];
  for (let i = 1; i <= numBots; i++) {
    defs.push({ id: `bot-${i}`, name: `Bot ${i}`, isBot: true });
  }
  return defs;
}

function loadSettings(): YanivSettings & { numBots: number } {
  if (typeof window === "undefined") return { ...DEFAULT_YANIV_SETTINGS, numBots: 1 };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_YANIV_SETTINGS, numBots: 1, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return { ...DEFAULT_YANIV_SETTINGS, numBots: 1 };
}

function saveSettings(s: YanivSettings & { numBots: number }) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

function toShellCard(card: { suit: string; rank: string }, faceUp = true): ShellCard {
  return { suit: card.suit as ShellCard["suit"], rank: card.rank as ShellCard["rank"], faceUp };
}

function actionBadgeInfo(
  action: YanivAction,
): { playerId: string; text: string; variant: ActionBadge["variant"] } | null {
  if (action.type === "CALL_YANIV") return { playerId: action.playerId, text: "YANIV!", variant: "yaniv" };
  if (action.type === "QUICK_DRAW_STEAL") return { playerId: action.playerId, text: "Stolen!", variant: "stolen" };
  if (action.type === "DISCARD_AND_DRAW") {
    return {
      playerId: action.playerId,
      text: action.drawFromDiscard ? "Drew pile" : "Drew",
      variant: "drew",
    };
  }
  return null;
}

function getNextActiveIdx(players: YanivPlayer[], currentIdx: number): number {
  const N = players.length;
  for (let step = 1; step < N; step++) {
    const idx = (currentIdx + step) % N;
    if (!players[idx].eliminated) return idx;
  }
  return -1;
}

function runBotLoop(state: YanivGameState): YanivGameState {
  let s = state;
  let guard = 0;
  while (
    s.status === "in_progress" &&
    !s.quickDrawWindow &&
    s.players[s.currentPlayerIndex]?.isBot &&
    guard < 20
  ) {
    s = applyAction(s, bot.getNextMove(s, s.players[s.currentPlayerIndex].id));
    guard++;
  }
  return s;
}

export default function YanivPage() {
  const router = useRouter();
  const [gameState, setGameState] = useState<YanivGameState | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [roundsWon, setRoundsWon] = useState(0);
  const [roundsLost, setRoundsLost] = useState(0);
  const [reshuffled, setReshuffled] = useState(false);
  const [actionBadges, setActionBadges] = useState<Record<string, ActionBadge>>({});

  const prevDeckLengthRef = useRef<number | null>(null);
  const gameStateRef = useRef<YanivGameState | null>(null);
  gameStateRef.current = gameState;
  const badgeKeyRef = useRef(0);
  const badgeTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [numBots, setNumBots] = useState(1);
  const [yanivThreshold, setYanivThreshold] = useState(DEFAULT_YANIV_SETTINGS.yanivThreshold);
  const [scoreLimit, setScoreLimit] = useState(DEFAULT_YANIV_SETTINGS.scoreLimit);
  const [quickDraw, setQuickDraw] = useState(DEFAULT_YANIV_SETTINGS.quickDraw);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [qdTimeLeft, setQdTimeLeft] = useState<number | null>(null);

  const qdDiscarderKey = gameState?.quickDrawWindow?.discarderId ?? null;

  function showBadge(playerId: string, text: string, variant: ActionBadge["variant"]) {
    const key = ++badgeKeyRef.current;
    setActionBadges((prev) => ({ ...prev, [playerId]: { text, variant, key } }));
    clearTimeout(badgeTimersRef.current[playerId]);
    badgeTimersRef.current[playerId] = setTimeout(() => {
      setActionBadges((prev) => {
        const n = { ...prev };
        delete n[playerId];
        return n;
      });
    }, 2000);
  }

  function dispatch(state: YanivGameState, triggerAction?: YanivAction) {
    if (triggerAction) {
      const info = actionBadgeInfo(triggerAction);
      if (info) showBadge(info.playerId, info.text, info.variant);
    }

    let s = state;
    let guard = 0;
    while (
      s.status === "in_progress" &&
      !s.quickDrawWindow &&
      s.players[s.currentPlayerIndex]?.isBot &&
      guard < 20
    ) {
      const botId = s.players[s.currentPlayerIndex].id;
      const action = bot.getNextMove(s, botId);
      const info = actionBadgeInfo(action);
      if (info) showBadge(info.playerId, info.text, info.variant);
      s = applyAction(s, action);
      guard++;
    }

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
    const saved = loadSettings();
    setNumBots(saved.numBots);
    setYanivThreshold(saved.yanivThreshold);
    setScoreLimit(saved.scoreLimit);
    setQuickDraw(saved.quickDraw);
    setSettingsLoaded(true);
  }, []);

  useEffect(() => {
    if (!gameState) return;
    const curr = gameState.deck.length;
    const prev = prevDeckLengthRef.current;
    prevDeckLengthRef.current = curr;
    if (prev !== null && prev === 0 && curr > 0) {
      setReshuffled(true);
      const timer = setTimeout(() => setReshuffled(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [gameState]);

  useEffect(() => {
    if (!qdDiscarderKey) {
      setQdTimeLeft(null);
      return;
    }
    setQdTimeLeft(QUICK_DRAW_MS);
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, QUICK_DRAW_MS - elapsed);
      setQdTimeLeft(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        const s = gameStateRef.current;
        if (s?.quickDrawWindow) {
          dispatch(applyAction(s, { type: "QUICK_DRAW_EXPIRE" }));
        }
      }
    }, 50);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qdDiscarderKey]);

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
      dispatch(applyAction(s, action), action);
    }, delay);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qdDiscarderKey]);

  const startGame = useCallback(() => {
    const settings: YanivSettings = { yanivThreshold, scoreLimit, quickDraw };
    saveSettings({ ...settings, numBots });
    const initial = dealGame(`game-${Date.now()}`, buildPlayerDefs(numBots), settings);
    setGameState(runBotLoop(initial));
    setSelected([]);
    setRoundsWon(0);
    setRoundsLost(0);
    setActionBadges({});
  }, [numBots, yanivThreshold, scoreLimit, quickDraw]);

  function callYaniv() {
    if (!gameState) return;
    const action = { type: "CALL_YANIV" as const, playerId: PLAYER_ID };
    dispatch(applyAction(gameState, action), action);
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
    dispatch(applyAction(gameState, action), action);
  }

  function stealFromDiscard() {
    if (!gameState?.quickDrawWindow) return;
    const action = { type: "QUICK_DRAW_STEAL" as const, playerId: PLAYER_ID };
    dispatch(applyAction(gameState, action), action);
  }

  function nextRound() {
    if (!gameState) return;
    const s = runBotLoop(applyAction(gameState, { type: "NEXT_ROUND", playerId: PLAYER_ID }));
    setGameState(s);
    setSelected([]);
    setActionBadges({});
  }

  function toggleCard(idx: number) {
    setSelected((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx],
    );
  }

  // ── Settings screen ──────────────────────────────────────────────────────
  if (!gameState) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <header className="flex items-center justify-between px-4 py-3 md:px-8 border-b border-border">
          <h1 className="text-foreground font-semibold text-lg">Yaniv</h1>
          <a href="/" className="text-sm text-muted-foreground hover:text-foreground">← Back</a>
        </header>
        <div className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-sm flex flex-col gap-6">
            <h2 className="text-foreground text-xl font-semibold text-center">Game Settings</h2>

            <SettingRow label="Number of Bots">
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setNumBots(n)}
                    className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${
                      numBots === n
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </SettingRow>

            <SettingRow label="Yaniv Call Threshold">
              <div className="flex gap-2">
                {[5, 6, 7, 8, 9, 10].map((n) => (
                  <button
                    key={n}
                    onClick={() => setYanivThreshold(n)}
                    className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${
                      yanivThreshold === n
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-muted-foreground text-xs mt-1">Maximum hand total to call Yaniv</p>
            </SettingRow>

            <SettingRow label="Elimination Score">
              <div className="flex gap-2">
                {[100, 150, 200, 300].map((n) => (
                  <button
                    key={n}
                    onClick={() => setScoreLimit(n)}
                    className={`px-3 h-9 rounded-lg text-sm font-semibold transition-colors ${
                      scoreLimit === n
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-muted-foreground text-xs mt-1">Score at which a player is eliminated</p>
            </SettingRow>

            <SettingRow label="Quick Draw">
              <button
                onClick={() => setQuickDraw((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  quickDraw ? "bg-primary" : "bg-input"
                }`}
                role="switch"
                aria-checked={quickDraw}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    quickDraw ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
              <p className="text-muted-foreground text-xs mt-1">2-second window to pick up discarded cards</p>
            </SettingRow>

            <Button
              onClick={startGame}
              disabled={!settingsLoaded}
              size="lg"
              className="w-full h-12 text-base font-bold mt-2"
            >
              Start Game
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Game screen ──────────────────────────────────────────────────────────
  const player = gameState.players.find((p) => p.id === PLAYER_ID)!;
  const isMyTurn =
    gameState.status === "in_progress" &&
    !gameState.quickDrawWindow &&
    gameState.players[gameState.currentPlayerIndex]?.id === PLAYER_ID;
  const playerTotal = handTotal(player.hand);
  const canYaniv = isMyTurn && canCallYaniv(player.hand, gameState.settings.yanivThreshold);
  const selectedCards = selected.map((i) => player.hand[i]).filter(Boolean);
  const canDiscard = isMyTurn && isValidDiscard(selectedCards);
  const topGroup = getDiscardTopGroup(gameState);
  const isRoundOver = gameState.status === "round_over";
  const isGameOver = gameState.status === "game_over";
  const qdWindow = gameState.quickDrawWindow;
  const qdActive = !!qdWindow;
  const qdPlayerCanSteal =
    qdActive &&
    !!qdWindow &&
    gameState.players.find((p) => p.id === qdWindow.discarderId)?.isBot === true;
  const qdProgress = qdTimeLeft !== null ? qdTimeLeft / QUICK_DRAW_MS : 0;

  const cardDisabled = player.hand.map((card, i) => {
    if (!isMyTurn) return true;
    if (selected.includes(i)) return false;
    return !canAddToSelection(selectedCards, card);
  });

  const nextPlayerIdx = getNextActiveIdx(gameState.players, gameState.currentPlayerIndex);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {reshuffled && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground px-5 py-2 rounded-full shadow-xl font-medium text-sm pointer-events-none">
          Reshuffled!
        </div>
      )}
      <header className="flex items-center justify-between px-4 py-3 md:px-8 border-b border-border">
        <h1 className="text-foreground font-semibold text-lg">Yaniv</h1>
        <a href="/" className="text-sm text-muted-foreground hover:text-foreground">← Back</a>
      </header>

      <div className="flex-1 flex flex-col p-3 md:p-5 gap-3 max-w-2xl mx-auto w-full">
        {/* Circular player ring */}
        <PlayerRing
          players={gameState.players}
          humanId={PLAYER_ID}
          currentPlayerIndex={gameState.currentPlayerIndex}
          nextPlayerIndex={nextPlayerIdx}
          actionBadges={actionBadges}
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

        {/* Human player hand */}
        <div className="bg-muted/40 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-foreground text-sm font-medium">
              {player.name}
              {isMyTurn && <span className="ml-2 text-primary text-xs">— your turn</span>}
            </span>
            <div className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
              <span>Score: {player.score}</span>
              <span>Hand: {playerTotal}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {player.hand.map((card, i) => {
              const isSelected = selected.includes(i);
              const isDisabled = cardDisabled[i];
              return (
                <button
                  key={`${card.suit}-${card.rank}-${i}`}
                  onClick={() => !isDisabled && toggleCard(i)}
                  disabled={isDisabled}
                  className={`rounded-lg transition-all outline-none ${
                    isDisabled
                      ? "opacity-35 cursor-not-allowed"
                      : isSelected
                      ? "-translate-y-3 ring-2 ring-primary cursor-pointer"
                      : isMyTurn
                      ? "hover:-translate-y-1 cursor-pointer"
                      : "cursor-default"
                  }`}
                  aria-pressed={isSelected}
                >
                  <PlayingCard card={toShellCard(card)} size="md" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Action buttons */}
        {isMyTurn && (
          <div className="flex flex-col gap-2">
            {canYaniv && (
              <Button
                onClick={callYaniv}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold"
              >
                Call Yaniv! (hand = {playerTotal})
              </Button>
            )}
            {selected.length > 0 && (
              <div className="text-muted-foreground text-xs text-center">
                Selected: {selectedCards.map((c) => `${c.rank}${suitSymbol(c.suit)}`).join(", ")}
                {" "}({selectedCards.reduce((s, c) => s + yanivCardValue(c.rank), 0)} pts)
                {!isValidDiscard(selectedCards) && (
                  <span className="text-destructive ml-1">— not a valid combo</span>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                onClick={() => discardAndDraw(false)}
                disabled={!canDiscard}
                className="flex-1"
                variant="default"
              >
                Discard &amp; Draw from Deck
              </Button>
              <Button
                onClick={() => discardAndDraw(true)}
                disabled={!canDiscard || topGroup.length === 0}
                className="flex-1"
                variant="outline"
              >
                Discard &amp; Take{" "}
                {topGroup.length > 0
                  ? `${topGroup[topGroup.length - 1].rank}${suitSymbol(topGroup[topGroup.length - 1].suit)}`
                  : "pile"}
              </Button>
            </div>
            {selected.length === 0 && !canYaniv && (
              <p className="text-muted-foreground text-xs text-center">
                Tap a card (or cards) to select, then discard
              </p>
            )}
          </div>
        )}

        {qdActive && (
          <p className="text-center text-sm font-medium text-amber-400 animate-pulse">
            {qdPlayerCanSteal
              ? "Steal the discard? Click the highlighted card!"
              : "Quick-draw window — bot may steal…"}
          </p>
        )}
        {!isMyTurn && !qdActive && gameState.status === "in_progress" && (
          <p className="text-muted-foreground text-sm text-center">Bot is thinking…</p>
        )}
      </div>

      {isRoundOver && gameState.roundResult && (
        <RoundEndOverlay
          state={gameState}
          playerId={PLAYER_ID}
          onNextRound={nextRound}
          onChangeGame={() => router.push("/")}
        />
      )}

      {isGameOver && (
        <EndGameScreen
          headline={gameState.winnerId === PLAYER_ID ? "You Win!" : "Bot Wins"}
          subline={
            gameState.winnerId === PLAYER_ID
              ? "You outlasted the bot!"
              : "Better luck next time."
          }
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

// ── PlayerRing ────────────────────────────────────────────────────────────

interface PlayerRingProps {
  players: YanivPlayer[];
  humanId: string;
  currentPlayerIndex: number;
  nextPlayerIndex: number;
  actionBadges: Record<string, ActionBadge>;
  qdActive: boolean;
  qdWindow: YanivQuickDrawWindow | null;
  qdProgress: number;
  qdTimeLeft: number;
  qdPlayerCanSteal: boolean;
  deckCount: number;
  discardTopGroup: { suit: string; rank: string }[];
  canDrawFromDiscard: boolean;
  onPickDiscardCard: (idx: number) => void;
  onSteal: () => void;
}

function PlayerRing({
  players,
  humanId,
  currentPlayerIndex,
  nextPlayerIndex,
  actionBadges,
  qdActive,
  qdWindow,
  qdProgress,
  qdTimeLeft,
  qdPlayerCanSteal,
  deckCount,
  discardTopGroup,
  canDrawFromDiscard,
  onPickDiscardCard,
  onSteal,
}: PlayerRingProps) {
  const N = players.length;
  const humanIdx = players.findIndex((p) => p.id === humanId);

  // Compute seat positions as percentages of container.
  // Human fixed at bottom (angle = π/2 in screen coords = down).
  // Each subsequent player offset clockwise.
  const RING_R_PCT = 38; // radius as % of container
  const seats = players.map((player, i) => {
    const offset = (i - humanIdx + N) % N;
    const angle = Math.PI / 2 + offset * ((2 * Math.PI) / N);
    const xPct = 50 + RING_R_PCT * Math.cos(angle);
    const yPct = 50 + RING_R_PCT * Math.sin(angle);
    const isActive = i === currentPlayerIndex;
    const isNext = i === nextPlayerIndex && !isActive;
    return { player, xPct, yPct, isActive, isNext, angle };
  });

  // Small clockwise arc indicator: from ~350° to ~50° (short arc at top-right)
  // In SVG viewBox 0 0 100 100, center (50,50), radius 38
  const arcR = RING_R_PCT;
  const arcStart = { x: 50 + arcR * Math.cos(-0.3), y: 50 + arcR * Math.sin(-0.3) };
  const arcEnd = { x: 50 + arcR * Math.cos(0.6), y: 50 + arcR * Math.sin(0.6) };

  return (
    <div className="relative w-full" style={{ maxWidth: 500, margin: "0 auto", aspectRatio: "1 / 1" }}>
      {/* SVG ring guide */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <marker
            id="ring-arrow"
            markerWidth="3"
            markerHeight="3"
            refX="2.5"
            refY="1.5"
            orient="auto"
          >
            <path d="M0,0 L0,3 L3,1.5 z" fill="currentColor" opacity="0.25" />
          </marker>
        </defs>
        {/* Dashed ring */}
        <circle
          cx="50"
          cy="50"
          r={arcR}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.4"
          strokeDasharray="2 2"
          opacity="0.15"
        />
        {/* Clockwise direction arc with arrowhead */}
        <path
          d={`M ${arcStart.x.toFixed(2)},${arcStart.y.toFixed(2)} A ${arcR},${arcR} 0 0,1 ${arcEnd.x.toFixed(2)},${arcEnd.y.toFixed(2)}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.6"
          opacity="0.25"
          markerEnd="url(#ring-arrow)"
        />
      </svg>

      {/* Player seat nodes */}
      {seats.map(({ player, xPct, yPct, isActive, isNext }) => (
        <PlayerSeatNode
          key={player.id}
          player={player}
          isHuman={player.id === humanId}
          isActive={isActive}
          isNext={isNext}
          badge={actionBadges[player.id]}
          style={{
            position: "absolute",
            left: `calc(${xPct}% - 36px)`,
            top: `calc(${yPct}% - 40px)`,
          }}
        />
      ))}

      {/* Center: deck + discard */}
      <div
        className="absolute flex flex-col items-center gap-2"
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
        }}
      >
        <div className="flex items-center gap-4">
          {/* Deck */}
          <div className="flex items-center justify-center">
            <DeckVisual count={deckCount} />
          </div>

          {/* Discard / quick-draw */}
          <div className="flex flex-col items-center gap-1">
            {qdActive && qdWindow ? (
              <QuickDrawPile
                cards={qdWindow.cards}
                progress={qdProgress}
                timeLeftMs={qdTimeLeft}
                canSteal={qdPlayerCanSteal}
                onSteal={onSteal}
              />
            ) : (
              <DiscardPileGroup
                group={discardTopGroup}
                canDraw={canDrawFromDiscard}
                onPickCard={onPickDiscardCard}
              />
            )}
            <span className="text-muted-foreground text-[10px]">
              {qdActive ? "quick draw!" : canDrawFromDiscard && discardTopGroup.length > 0 ? "← draw" : "discard"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PlayerSeatNode ────────────────────────────────────────────────────────

function PlayerSeatNode({
  player,
  isHuman,
  isActive,
  isNext,
  badge,
  style,
}: {
  player: YanivPlayer;
  isHuman: boolean;
  isActive: boolean;
  isNext: boolean;
  badge?: ActionBadge;
  style?: React.CSSProperties;
}) {
  const initials = player.name.slice(0, 2).toUpperCase();

  return (
    <div
      className="flex flex-col items-center gap-0.5 select-none"
      style={{ width: 72, ...style }}
    >
      {/* Avatar */}
      <div className="relative">
        <div
          className={`
            w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
            transition-all duration-300
            ${
              isActive
                ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
                : isNext
                ? "bg-muted text-foreground ring-1 ring-primary/40"
                : player.eliminated
                ? "bg-muted/30 text-muted-foreground/40"
                : "bg-muted text-muted-foreground"
            }
          `}
          style={
            isActive
              ? { animation: "seat-glow-pulse 1.5s ease-in-out infinite" }
              : undefined
          }
        >
          {initials}
        </div>

        {/* Action badge */}
        {badge && (
          <div
            key={badge.key}
            className="absolute pointer-events-none"
            style={{
              bottom: "calc(100% + 2px)",
              left: "50%",
              animation: "badge-slide-up 2s ease-out forwards",
            }}
          >
            <span
              className={`
                text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap
                ${
                  badge.variant === "yaniv"
                    ? "bg-amber-500 text-white"
                    : badge.variant === "stolen"
                    ? "bg-destructive text-white"
                    : "bg-primary/90 text-primary-foreground"
                }
              `}
            >
              {badge.text}
            </span>
          </div>
        )}
      </div>

      {/* Name */}
      <span
        className={`text-[10px] font-medium text-center leading-tight max-w-[72px] truncate ${
          isActive ? "text-primary" : player.eliminated ? "text-muted-foreground/40 line-through" : "text-foreground"
        }`}
      >
        {player.name}
      </span>

      {/* Status label */}
      {isActive && (
        <span className="text-[9px] text-primary font-semibold">↑ turn</span>
      )}
      {!isActive && isNext && (
        <span className="text-[9px] text-muted-foreground">next</span>
      )}
      {!isActive && !isNext && isHuman && (
        <span className="text-[9px] text-muted-foreground/60">you</span>
      )}

      {/* Score + card count */}
      <div
        className={`flex gap-1 text-[9px] tabular-nums ${
          player.eliminated ? "text-muted-foreground/40" : "text-muted-foreground"
        }`}
      >
        <span>{player.score}pt</span>
        <span>·</span>
        <span>{player.hand.length}🃏</span>
      </div>
    </div>
  );
}

// ── QuickDrawPile ─────────────────────────────────────────────────────────

function QuickDrawPile({
  cards,
  progress,
  timeLeftMs,
  canSteal,
  onSteal,
}: {
  cards: { suit: string; rank: string }[];
  progress: number;
  timeLeftMs: number;
  canSteal: boolean;
  onSteal: () => void;
}) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <div className="relative flex items-center gap-1">
      {cards.map((card, i) => (
        <div
          key={i}
          className={`rounded-lg ring-2 ring-amber-400 shadow-lg shadow-amber-400/30 ${
            canSteal ? "animate-pulse cursor-pointer" : ""
          }`}
          onClick={canSteal ? onSteal : undefined}
          role={canSteal ? "button" : undefined}
          aria-label={canSteal ? "Steal from discard pile" : undefined}
        >
          <PlayingCard card={toShellCard(card)} size="sm" />
        </div>
      ))}
      <svg
        width={radius * 2 + 8}
        height={radius * 2 + 8}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%) rotate(-90deg)",
          pointerEvents: "none",
        }}
      >
        <circle
          cx={radius + 4}
          cy={radius + 4}
          r={radius}
          fill="none"
          stroke="rgba(251,191,36,0.2)"
          strokeWidth="3"
        />
        <circle
          cx={radius + 4}
          cy={radius + 4}
          r={radius}
          fill="none"
          stroke="rgb(251,191,36)"
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.05s linear" }}
        />
      </svg>
      <span
        className="absolute text-[10px] font-bold text-amber-300 tabular-nums pointer-events-none"
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
      >
        {(timeLeftMs / 1000).toFixed(1)}
      </span>
      {canSteal && (
        <button
          onClick={onSteal}
          className="absolute inset-0 rounded-lg hover:bg-amber-400/10 transition-colors"
          aria-label="Steal discarded cards"
        />
      )}
    </div>
  );
}

// ── DiscardPileGroup ──────────────────────────────────────────────────────

function DiscardPileGroup({
  group,
  canDraw,
  onPickCard,
}: {
  group: { suit: string; rank: string }[];
  canDraw: boolean;
  onPickCard: (idx: number) => void;
}) {
  if (group.length === 0) {
    return (
      <div className="w-10 h-14 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground/50 text-[9px]">
        empty
      </div>
    );
  }
  return (
    <div className="flex gap-0.5">
      {group.map((card, i) => (
        <button
          key={i}
          onClick={() => canDraw && onPickCard(i)}
          disabled={!canDraw}
          className={`rounded-lg transition-all outline-none ${
            canDraw
              ? "hover:-translate-y-1 cursor-pointer ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              : "cursor-default"
          }`}
          aria-label={canDraw ? `Draw ${card.rank} of ${card.suit}` : undefined}
        >
          <PlayingCard
            card={{ suit: card.suit as ShellCard["suit"], rank: card.rank as ShellCard["rank"], faceUp: true }}
            size="sm"
          />
        </button>
      ))}
    </div>
  );
}

// ── DeckVisual ────────────────────────────────────────────────────────────

function DeckVisual({ count }: { count: number }) {
  if (count === 0) {
    return (
      <div
        className="w-14 h-16 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground/50 text-[9px]"
        aria-label="empty draw deck"
      >
        empty
      </div>
    );
  }
  const layers = Math.min(count, 5);
  const topIndex = layers - 1;

  return (
    <div
      className="relative w-16 h-16"
      aria-label={`draw deck with ${count} card${count === 1 ? "" : "s"} remaining`}
      role="img"
    >
      {Array.from({ length: layers }, (_, i) => {
        const isTop = i === topIndex;
        const depth = topIndex - i;
        return (
          <div
            key={i}
            className="absolute rounded-lg border border-emerald-100/25 bg-[#1a6b3c] shadow-md"
            style={{
              width: 40,
              height: 56,
              top: 4 + depth * 2,
              left: 12 - depth * 3,
              zIndex: i,
              transform: `rotate(${depth * -2}deg)`,
            }}
          >
            {isTop && (
              <div className="w-full h-full flex items-center justify-center rounded-lg">
                <div className="w-[80%] h-[80%] rounded border border-white/30" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── SettingRow ────────────────────────────────────────────────────────────

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-foreground text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

// ── RoundEndOverlay ───────────────────────────────────────────────────────

function RoundEndOverlay({
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
  const callerName = state.players.find((p) => p.id === result.callerId)?.name ?? "Someone";
  const callerIsPlayer = result.callerId === playerId;

  let headline: string;
  if (result.assaf) {
    headline = callerIsPlayer ? "Assaf! You got penalty points" : `Assaf! ${callerName} got +30`;
  } else {
    headline = callerIsPlayer ? "Yaniv! You win this round" : `${callerName} called Yaniv`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-card border border-border p-6 shadow-2xl flex flex-col gap-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-card-foreground">{headline}</p>
          <p className="text-sm text-muted-foreground mt-1">Round {state.round} complete</p>
        </div>

        <div className="space-y-2">
          {state.players.filter((p) => !p.eliminated).map((p) => (
            <div key={p.id} className="flex items-start gap-3">
              <div className="w-14 text-sm text-muted-foreground shrink-0">{p.name}</div>
              <div className="flex flex-wrap gap-1">
                {p.hand.map((c, i) => (
                  <PlayingCard key={i} card={toShellCard(c)} size="sm" />
                ))}
              </div>
              <div className="ml-auto text-sm font-semibold tabular-nums text-foreground shrink-0">
                {result.handTotals[p.id] ?? 0} pts
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 text-center">
            Scores after round {state.round}
          </p>
          <div className="flex justify-center gap-8">
            {state.players.map((p) => (
              <div key={p.id} className="flex flex-col items-center">
                <span className="text-2xl font-bold tabular-nums text-foreground">{p.score}</span>
                <span className="text-xs text-muted-foreground">{p.name}</span>
                {p.eliminated && <span className="text-xs text-destructive">eliminated</span>}
              </div>
            ))}
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

// ── Helpers ───────────────────────────────────────────────────────────────

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

function suitSymbol(suit: string): string {
  return SUIT_SYMBOLS[suit] ?? suit;
}
