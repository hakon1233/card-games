"use client";

import { useEffect, useRef, useState } from "react";
import PartySocket from "partysocket";

const GAME_LABELS: Record<string, string> = {
  crazy_eights: "Crazy Eights",
  go_fish: "Go Fish",
};

type LobbyPlayer = { userId: string; displayName: string; connected: boolean };

type LobbyState = {
  phase: "lobby";
  hostId: string;
  gameType: "crazy_eights" | "go_fish";
  players: LobbyPlayer[];
};

type ServerMessage =
  | { type: "LOBBY_STATE"; state: LobbyState }
  | { type: "CE_STATE" }
  | { type: "GF_STATE" }
  | { type: "ERROR"; message: string };

interface Props {
  code: string;
  userId: string;
  displayName: string;
  hostId: string;
  partyHost: string;
}

export function LobbyClient({ code, userId, displayName, hostId, partyHost }: Props) {
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    const socket = new PartySocket({ host: partyHost, room: code });
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "JOIN", userId, displayName }));
    });

    socket.addEventListener("message", (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string) as ServerMessage;
      if (msg.type === "LOBBY_STATE") {
        setLobby(msg.state);
      } else if (msg.type === "CE_STATE" || msg.type === "GF_STATE") {
        setGameStarted(true);
      } else if (msg.type === "ERROR") {
        setError(msg.message);
      }
    });

    return () => {
      socket.close();
    };
  }, [code, userId, displayName, partyHost]);

  function handleStart() {
    socketRef.current?.send(JSON.stringify({ type: "START" }));
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/join/${code}`;
    navigator.clipboard.writeText(url).catch(() => {});
  }

  if (gameStarted) {
    return (
      <div className="text-center">
        <p className="text-lg font-semibold text-foreground">Game starting…</p>
        <p className="text-sm text-muted-foreground mt-1">
          Full game UI coming soon — the room and state are live.
        </p>
      </div>
    );
  }

  const isHost = userId === hostId;
  const connectedCount = lobby?.players.filter((p) => p.connected).length ?? 0;
  const canStart = isHost && connectedCount >= 2;
  const gameLabel = lobby ? GAME_LABELS[lobby.gameType] ?? lobby.gameType : "";

  return (
    <div className="w-full max-w-md">
      <div className="mb-6 text-center">
        <p className="text-4xl mb-3">🃏</p>
        <h1 className="text-2xl font-bold text-foreground">{gameLabel} — Lobby</h1>
        <p className="text-sm text-muted-foreground mt-1">Room code: <span className="font-mono font-medium">{code}</span></p>
      </div>

      <div className="mb-4 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">
          Players ({connectedCount}/{lobby?.players.length ?? 0})
        </h2>
        {lobby ? (
          <ul className="flex flex-col gap-2">
            {lobby.players.map((player) => (
              <li key={player.userId} className="flex items-center gap-2">
                <span
                  className={[
                    "h-2 w-2 rounded-full flex-shrink-0",
                    player.connected ? "bg-green-500" : "bg-muted",
                  ].join(" ")}
                />
                <span className="text-sm text-foreground">{player.displayName}</span>
                {player.userId === lobby.hostId && (
                  <span className="ml-auto text-xs text-muted-foreground">host</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Connecting…</p>
        )}
      </div>

      {error && (
        <p className="mb-4 text-sm text-destructive text-center">{error}</p>
      )}

      <div className="flex flex-col gap-3">
        <button
          onClick={handleCopyLink}
          className="w-full inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm hover:bg-accent"
        >
          Copy invite link
        </button>

        {isHost && (
          <button
            onClick={handleStart}
            disabled={!canStart}
            className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {canStart ? "Start Game" : `Waiting for players (need 2+)`}
          </button>
        )}

        {!isHost && (
          <p className="text-center text-sm text-muted-foreground">
            Waiting for the host to start…
          </p>
        )}
      </div>
    </div>
  );
}
