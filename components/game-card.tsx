"use client";

import { useState } from "react";
import { ModeSelector } from "@/components/mode-selector";

interface GameCardProps {
  slug: string;
  name: string;
  tagline: string;
  emoji: string;
}

export function GameCard({ slug, name, tagline, emoji }: GameCardProps) {
  const [selectorOpen, setSelectorOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setSelectorOpen(true)}
        className="group flex flex-col items-start gap-4 rounded-lg border border-border bg-card p-6 text-left shadow-sm transition-all duration-150 hover:border-[var(--pip-gold)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
      >
        <span className="text-4xl" aria-hidden="true">
          {emoji}
        </span>
        <div>
          <h2 className="font-heading text-xl font-bold text-card-foreground transition-colors group-hover:text-primary">
            {name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{tagline}</p>
        </div>
      </button>
      <ModeSelector
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        gameSlug={slug}
        gameName={name}
      />
    </>
  );
}
