"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { BrandHeader } from "@/components/brand-logo";
import PartySocket from "partysocket";
import { GameShell } from "@/components/game/shell";
import { EndGameScreen } from "@/components/game/end-game-screen";
import { Button } from "@/components/ui/button";
import { blackjackToShell, type BlackjackSession } from "@/lib/games/blackjack-to-shell";
import { handValue, isBlackjack } from "@/lib/games/blackjack";
import type { PublicGameState, ServerMessage } from "@/lib/games/types";

function resultHeadline(state: PublicGameState): { headline: string; subline?: string } {
  switch (state.status) {
    case "player_bust":
      return { headline: "Dealer Wins", subline: "You busted" };
    case "dealer_bust":
      return { headline: "You Win!", subline: "Dealer busted" };
    case "player_win":
      return {
        headline: "You Win!",
        subline: isBlackjack(state.playerHand.cards) ? "Blackjack!" : undefined,
      };
    case "dealer_win":
      return { headline: "Dealer Wins" };
    case "push":
      return { headline: "Push — Tie" };
    default:
      return { headline: "Game Over" };
  }
}

const SESSION_KEY = "blackjack:session";

function loadSession(): BlackjackSession {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw) as BlackjackSession;
  } catch {}
  return { wins: 0, losses: 0, pushes: 0 };
}

export default function GamePage() {
  const { id: gameId } = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<PublicGameState | null>(null);
  const [session, setSession] = useState<BlackjackSession>(() => loadSession());
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const prevTurnRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "localhost:1999";
    const socket = new PartySocket({ host, room: gameId });

    socket.onmessage = (evt) => {
      const msg: ServerMessage = JSON.parse(evt.data);
      if (msg.type === "STATE_UPDATE") setState(msg.state);
    };

    return () => socket.close();
  }, [gameId]);

  useEffect(() => {
    fetch(`/api/games/${gameId}/action`)
      .then((r) => r.json())
      .then((d) => { if (d.state) setState(d.state); })
      .catch(() => setError("Failed to load game"));
  }, [gameId]);

  // Update session score when a game completes
  useEffect(() => {
    if (!state) return;
    const wasOver = prevTurnRef.current === "over";
    const nowOver = state.turn === "over";
    if (nowOver && !wasOver) {
      setSession((s) => {
        const next = {
          wins: s.wins + (state.result === "player_win" ? 1 : 0),
          losses: s.losses + (state.result === "dealer_win" ? 1 : 0),
          pushes: s.pushes + (state.result === "push" ? 1 : 0),
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
        return next;
      });
    }
    prevTurnRef.current = state.turn;
  }, [state]);

  const sendAction = useCallback(
    async (type: "HIT" | "STAND") => {
      if (!state || acting) return;
      setActing(true);
      try {
        const res = await fetch(`/api/games/${gameId}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, playerId: state.playerHand.playerId }),
        });
        if (!res.ok) throw new Error("Action failed");
        const data = await res.json();
        setState(data.state);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed");
      } finally {
        setActing(false);
      }
    },
    [state, acting, gameId]
  );

  const playAgain = useCallback(async () => {
    try {
      const res = await fetch("/api/games", { method: "POST" });
      if (!res.ok) throw new Error("Failed to create game");
      const { gameId: newId } = await res.json();
      router.push(`/games/${newId}`);
    } catch {
      setError("Failed to start new game");
    }
  }, [router]);

  const shellState = blackjackToShell(state, "You", session);
  const isPlayerTurn = state?.turn === "player";
  const isOver = state?.turn === "over";

  const playerValue = state ? handValue(state.playerHand.cards) : null;
  const dealerVisible = state ? state.dealerHand.filter((c) => !c.hidden) : [];
  const dealerValue = dealerVisible.length ? handValue(dealerVisible) : null;

  const actionArea = (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {playerValue !== null && (
          <span>
            Your hand:{" "}
            <span className="font-semibold text-foreground">{playerValue}</span>
          </span>
        )}
        {dealerValue !== null && (
          <span>
            Dealer showing:{" "}
            <span className="font-semibold text-foreground">{dealerValue}</span>
          </span>
        )}
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button
          onClick={() => sendAction("HIT")}
          disabled={!isPlayerTurn || acting || isOver}
          className="flex-1 sm:flex-none"
        >
          Hit
        </Button>
        <Button
          onClick={() => sendAction("STAND")}
          disabled={!isPlayerTurn || acting || isOver}
          variant="outline"
          className="flex-1 sm:flex-none"
        >
          Stand
        </Button>
      </div>
    </div>
  );

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-900 text-white">
        <p>{error ?? "Loading game…"}</p>
      </div>
    );
  }

  const endScreen = isOver ? resultHeadline(state) : null;

  return (
    <div className="flex flex-col min-h-screen bg-zinc-900">
      <BrandHeader title="Blackjack" tone="red" backLabel="Back" />
      <div className="flex-1 flex items-stretch p-4 md:p-8">
        <div className="flex-1 max-w-2xl mx-auto">
          <GameShell state={shellState} gameType="blackjack" actionArea={actionArea} />
        </div>
      </div>

      {endScreen && (
        <EndGameScreen
          headline={endScreen.headline}
          subline={endScreen.subline}
          sessionRows={[
            { label: "Wins", value: session.wins },
            { label: "Losses", value: session.losses },
            { label: "Pushes", value: session.pushes },
          ]}
          onPlayAgain={playAgain}
          onChangeGame={() => {
            sessionStorage.removeItem(SESSION_KEY);
            router.push("/");
          }}
        />
      )}
    </div>
  );
}
