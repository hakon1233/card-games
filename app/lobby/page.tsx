"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function LobbyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePlay() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/games", { method: "POST" });
      if (!res.ok) throw new Error("Failed to create game");
      const { gameId } = await res.json();
      router.push(`/games/${gameId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-green-900 text-white gap-8">
      <h1 className="text-5xl font-bold tracking-tight">Card Games</h1>
      <p className="text-green-200 text-lg">Play Blackjack against the dealer</p>
      <Button
        size="lg"
        onClick={handlePlay}
        disabled={loading}
        className="text-xl px-10 py-6 bg-yellow-500 hover:bg-yellow-400 text-black font-bold"
      >
        {loading ? "Dealing..." : "Play Blackjack"}
      </Button>
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </main>
  );
}
