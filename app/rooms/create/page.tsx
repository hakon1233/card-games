"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const GAMES = [
  { type: "crazy_eights" as const, name: "Crazy Eights", emoji: "🎴", desc: "Match the card or change the suit" },
  { type: "go_fish" as const, name: "Go Fish", emoji: "🐟", desc: "Collect the most sets to win" },
];

export default function CreateRoomPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<"crazy_eights" | "go_fish" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameType: selected }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to create room");
      }
      const { code } = (await res.json()) as { code: string };
      router.push(`/rooms/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">Create a Room</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick a game and invite your friends
          </p>
        </div>

        <div className="flex flex-col gap-3 mb-6">
          {GAMES.map((game) => (
            <button
              key={game.type}
              onClick={() => setSelected(game.type)}
              className={[
                "flex items-center gap-4 rounded-lg border p-4 text-left transition-colors",
                selected === game.type
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-card hover:bg-accent",
              ].join(" ")}
            >
              <span className="text-3xl">{game.emoji}</span>
              <div>
                <p className="font-semibold text-foreground">{game.name}</p>
                <p className="text-sm text-muted-foreground">{game.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {error && (
          <p className="mb-4 text-sm text-destructive text-center">{error}</p>
        )}

        <button
          onClick={handleCreate}
          disabled={!selected || loading}
          className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Creating…" : "Create Room"}
        </button>
      </div>
    </main>
  );
}
