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
  discardPileTop,
  DEFAULT_YANIV_SETTINGS,
  type YanivGameState,
  type YanivPlayer,
  type YanivSettings,
} from "@/lib/games/yaniv";
import { YanivBot } from "@/lib/bots/yaniv-bot";
import type { ShellCard } from "@/lib/games/shell-types";

const PLAYER_ID = "player-1";
const SETTINGS_KEY = "yaniv-settings";
const bot = new YanivBot();

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

function runBotTurns(state: YanivGameState): YanivGameState {
  let s = state;
  let guard = 0;
  while (
    s.status === "in_progress" &&
    s.players[s.currentPlayerIndex]?.isBot &&
    guard < 20
  ) {
    const botId = s.players[s.currentPlayerIndex].id;
    s = applyAction(s, bot.getNextMove(s, botId));
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
  const prevDeckLengthRef = useRef<number | null>(null);

  const [numBots, setNumBots] = useState(1);
  const [yanivThreshold, setYanivThreshold] = useState(DEFAULT_YANIV_SETTINGS.yanivThreshold);
  const [scoreLimit, setScoreLimit] = useState(DEFAULT_YANIV_SETTINGS.scoreLimit);
  const [quickDraw, setQuickDraw] = useState(DEFAULT_YANIV_SETTINGS.quickDraw);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

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

  const startGame = useCallback(() => {
    const settings: YanivSettings = { yanivThreshold, scoreLimit, quickDraw };
    saveSettings({ ...settings, numBots });
    const state = runBotTurns(
      dealGame(`game-${Date.now()}`, buildPlayerDefs(numBots), settings),
    );
    setGameState(state);
    setSelected([]);
    setRoundsWon(0);
    setRoundsLost(0);
  }, [numBots, yanivThreshold, scoreLimit, quickDraw]);

  function dispatch(state: YanivGameState) {
    const next = runBotTurns(state);
    setGameState(next);
    setSelected([]);
    if (next.status === "round_over" || next.status === "game_over") {
      const result = next.roundResult;
      if (result) {
        const playerWon = result.callerId === PLAYER_ID && !result.assaf;
        if (playerWon) setRoundsWon((n) => n + 1);
        else setRoundsLost((n) => n + 1);
      }
    }
  }

  function toggleCard(idx: number) {
    setSelected((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx],
    );
  }

  function callYaniv() {
    if (!gameState) return;
    dispatch(applyAction(gameState, { type: "CALL_YANIV", playerId: PLAYER_ID }));
  }

  function discardAndDraw(drawFromDiscard: boolean) {
    if (!gameState || selected.length === 0) return;
    dispatch(
      applyAction(gameState, {
        type: "DISCARD_AND_DRAW",
        playerId: PLAYER_ID,
        discardIndices: selected,
        drawFromDiscard,
      }),
    );
  }

  function nextRound() {
    if (!gameState) return;
    const next = applyAction(gameState, { type: "NEXT_ROUND", playerId: PLAYER_ID });
    const withBots = runBotTurns(next);
    setGameState(withBots);
    setSelected([]);
  }

  if (!gameState) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-900">
        <header className="flex items-center justify-between px-4 py-3 md:px-8 border-b border-white/10">
          <h1 className="text-white font-semibold text-lg">Yaniv</h1>
          <a href="/" className="text-sm text-white/60 hover:text-white">← Back</a>
        </header>
        <div className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-sm flex flex-col gap-6">
            <h2 className="text-white text-xl font-semibold text-center">Game Settings</h2>

            {/* Number of bots */}
            <SettingRow label="Number of Bots">
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setNumBots(n)}
                    className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${
                      numBots === n
                        ? "bg-emerald-500 text-white"
                        : "bg-white/10 text-white/70 hover:bg-white/20"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </SettingRow>

            {/* Yaniv threshold */}
            <SettingRow label="Yaniv Call Threshold">
              <div className="flex gap-2">
                {[5, 6, 7, 8, 9, 10].map((n) => (
                  <button
                    key={n}
                    onClick={() => setYanivThreshold(n)}
                    className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${
                      yanivThreshold === n
                        ? "bg-emerald-500 text-white"
                        : "bg-white/10 text-white/70 hover:bg-white/20"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-white/40 text-xs mt-1">Maximum hand total to call Yaniv</p>
            </SettingRow>

            {/* Score limit */}
            <SettingRow label="Elimination Score">
              <div className="flex gap-2">
                {[100, 150, 200, 300].map((n) => (
                  <button
                    key={n}
                    onClick={() => setScoreLimit(n)}
                    className={`px-3 h-9 rounded-lg text-sm font-semibold transition-colors ${
                      scoreLimit === n
                        ? "bg-emerald-500 text-white"
                        : "bg-white/10 text-white/70 hover:bg-white/20"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-white/40 text-xs mt-1">Score at which a player is eliminated</p>
            </SettingRow>

            {/* Quick draw */}
            <SettingRow label="Quick Draw">
              <button
                onClick={() => setQuickDraw((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  quickDraw ? "bg-emerald-500" : "bg-white/20"
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
              <p className="text-white/40 text-xs mt-1">2-second window to pick up discarded cards</p>
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

  const player = gameState.players.find((p) => p.id === PLAYER_ID)!;
  const bots = gameState.players.filter((p) => p.isBot);
  const isMyTurn =
    gameState.status === "in_progress" &&
    gameState.players[gameState.currentPlayerIndex]?.id === PLAYER_ID;
  const playerTotal = handTotal(player.hand);
  const canYaniv = isMyTurn && canCallYaniv(player.hand, gameState.settings.yanivThreshold);
  const selectedCards = selected.map((i) => player.hand[i]).filter(Boolean);
  const canDiscard = isMyTurn && isValidDiscard(selectedCards);
  const topCard = discardPileTop(gameState);
  const isRoundOver = gameState.status === "round_over";
  const isGameOver = gameState.status === "game_over";

  return (
    <div className="flex flex-col min-h-screen bg-zinc-900">
      <header className="flex items-center justify-between px-4 py-3 md:px-8 border-b border-white/10">
        <h1 className="text-white font-semibold text-lg">Yaniv</h1>
        <a href="/" className="text-sm text-white/60 hover:text-white">← Back</a>
      </header>

      <div className="flex-1 flex flex-col p-4 md:p-6 gap-4 max-w-2xl mx-auto w-full">
        {/* Bot hands */}
        {bots.map((b) => (
          <BotSeat key={b.id} player={b} isActive={gameState.players[gameState.currentPlayerIndex]?.id === b.id} />
        ))}

        {/* Discard pile */}
        <div className="flex items-center gap-4 justify-center py-2">
          <div className="text-white/60 text-sm">Discard pile:</div>
          {topCard ? (
            <PlayingCard card={toShellCard(topCard)} size="md" />
          ) : (
            <div className="w-14 h-20 rounded-lg border border-white/20 flex items-center justify-center text-white/30 text-xs">
              empty
            </div>
          )}
          <div className="text-white/40 text-xs">{gameState.deck.length} in deck</div>
        </div>

        {/* Player hand */}
        <div className="bg-white/5 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white text-sm font-medium">
              {player.name}
              {isMyTurn && <span className="ml-2 text-emerald-400 text-xs">— your turn</span>}
            </span>
            <div className="flex items-center gap-3 text-xs tabular-nums text-white/60">
              <span>Score: {player.score}</span>
              <span>Hand: {playerTotal}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {player.hand.map((card, i) => (
              <button
                key={`${card.suit}-${card.rank}-${i}`}
                onClick={() => isMyTurn && toggleCard(i)}
                className={`rounded-lg transition-transform outline-none ${
                  selected.includes(i)
                    ? "-translate-y-3 ring-2 ring-emerald-400"
                    : isMyTurn
                    ? "hover:-translate-y-1 cursor-pointer"
                    : "cursor-default"
                }`}
                aria-pressed={selected.includes(i)}
              >
                <PlayingCard card={toShellCard(card)} size="md" />
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        {isMyTurn && (
          <div className="flex flex-col gap-2">
            {canYaniv && (
              <Button onClick={callYaniv} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold">
                Call Yaniv! (hand = {playerTotal})
              </Button>
            )}
            {selected.length > 0 && (
              <div className="text-white/60 text-xs text-center">
                Selected: {selectedCards.map((c) => `${c.rank}${suitSymbol(c.suit)}`).join(", ")}
                {" "}({selectedCards.reduce((s, c) => s + yanivCardValue(c.rank), 0)} pts)
                {!isValidDiscard(selectedCards) && (
                  <span className="text-red-400 ml-1">— not a valid combo</span>
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
                Discard & Draw from Deck
              </Button>
              <Button
                onClick={() => discardAndDraw(true)}
                disabled={!canDiscard || !topCard}
                className="flex-1"
                variant="outline"
              >
                Discard & Take {topCard ? `${topCard.rank}${suitSymbol(topCard.suit)}` : "pile"}
              </Button>
            </div>
            {selected.length === 0 && !canYaniv && (
              <p className="text-white/40 text-xs text-center">
                Tap a card (or cards) to select, then discard
              </p>
            )}
          </div>
        )}

        {!isMyTurn && gameState.status === "in_progress" && (
          <p className="text-white/40 text-sm text-center">Bot is thinking…</p>
        )}
      </div>

      {/* Round over overlay */}
      {isRoundOver && gameState.roundResult && (
        <RoundEndOverlay
          state={gameState}
          playerId={PLAYER_ID}
          onNextRound={nextRound}
          onChangeGame={() => router.push("/")}
        />
      )}

      {/* Game over overlay */}
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

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-white/80 text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

function BotSeat({ player, isActive }: { player: YanivPlayer; isActive: boolean }) {
  return (
    <div
      className={`rounded-xl p-3 transition-colors ${
        isActive ? "bg-emerald-900/40 ring-2 ring-emerald-500/50" : "bg-white/5"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-white text-sm font-medium">{player.name}</span>
        {isActive && <span className="text-emerald-400 text-xs">thinking…</span>}
        <div className="flex items-center gap-3 text-xs tabular-nums text-white/50 ml-auto">
          <span>Score: {player.score}</span>
          <span>Hand: —</span>
        </div>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {player.hand.map((_, i) => (
          <PlayingCard key={i} card={{ suit: "spades", rank: "A", faceUp: false }} size="sm" />
        ))}
      </div>
    </div>
  );
}

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

        {/* All hands */}
        <div className="space-y-2">
          {state.players.filter((p) => !p.eliminated).map((p) => (
            <div key={p.id} className="flex items-start gap-3">
              <div className="w-14 text-sm text-muted-foreground shrink-0">
                {p.name}
              </div>
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

        {/* Updated scores */}
        <div className="border-t border-border pt-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 text-center">
            Scores after round {state.round}
          </p>
          <div className="flex justify-center gap-8">
            {state.players.map((p) => (
              <div key={p.id} className="flex flex-col items-center">
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {p.score}
                </span>
                <span className="text-xs text-muted-foreground">{p.name}</span>
                {p.eliminated && (
                  <span className="text-xs text-red-400">eliminated</span>
                )}
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

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

function suitSymbol(suit: string): string {
  return SUIT_SYMBOLS[suit] ?? suit;
}
