"use client";

import type { SeatScore } from "@/lib/games/shell-types";

interface ScoreDisplayProps {
  scores: SeatScore[];
}

export function ScoreDisplay({ scores }: ScoreDisplayProps) {
  if (scores.length === 0) return null;

  return (
    <div className="flex items-center gap-4 text-sm">
      {scores.map((s) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{s.label}:</span>
          <span className="font-semibold tabular-nums">{s.value}</span>
        </div>
      ))}
    </div>
  );
}
