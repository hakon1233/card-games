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
        className="group flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-6 text-left shadow-sm transition-all duration-150 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
      >
        <span className="text-4xl" aria-hidden="true">
          {emoji}
        </span>
        <div>
          <h2 className="text-lg font-semibold text-card-foreground transition-colors group-hover:text-primary">
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
