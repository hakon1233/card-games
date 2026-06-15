"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";

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
    <main className="min-h-screen flex flex-col items-center justify-center bg-[var(--pip-tin-red)] text-[var(--pip-cream)] gap-8 px-4">
      <BrandLogo variant="dark" imageClassName="h-24 max-w-[300px] sm:h-28 sm:max-w-[360px]" />
      <p className="pip-eyebrow text-center text-xs text-[var(--pip-gold-light)]">Blackjack table</p>
      <p className="text-lg text-[var(--pip-cream)]/80">Play against the dealer</p>
      <Button
        size="lg"
        onClick={handlePlay}
        disabled={loading}
        className="h-12 px-10 bg-[var(--pip-gold-light)] text-[var(--pip-ink)] hover:bg-[var(--pip-gold)] font-bold"
      >
        {loading ? "Dealing..." : "Play Blackjack"}
      </Button>
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </main>
  );
}
