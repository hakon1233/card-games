"use client";

import { Button } from "@/components/ui/button";

export interface SessionRow {
  label: string;
  value: string | number;
}

interface EndGameScreenProps {
  headline: string;
  subline?: string;
  sessionRows: SessionRow[];
  /** Optional per-entry final scores (e.g. one row per player), shown as a list. */
  finalScoreRows?: SessionRow[];
  onPlayAgain: () => void;
  onChangeGame: () => void;
}

export function EndGameScreen({
  headline,
  subline,
  sessionRows,
  finalScoreRows,
  onPlayAgain,
  onChangeGame,
}: EndGameScreenProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-card border border-border p-6 shadow-2xl flex flex-col items-center gap-5">
        <div className="text-center">
          <p className="text-3xl font-bold text-card-foreground">{headline}</p>
          {subline && (
            <p className="mt-1 text-sm text-muted-foreground">{subline}</p>
          )}
        </div>

        {sessionRows.length > 0 && (
          <div className="w-full">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 text-center">
              Session
            </p>
            <div className="flex justify-center gap-6">
              {sessionRows.map((row) => (
                <div key={row.label} className="flex flex-col items-center gap-0.5">
                  <span className="text-2xl font-bold tabular-nums text-foreground">
                    {row.value}
                  </span>
                  <span className="text-xs text-muted-foreground">{row.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {finalScoreRows && finalScoreRows.length > 0 && (
          <div className="w-full">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 text-center">
              Final Scores
            </p>
            <div className="flex flex-col gap-1">
              {finalScoreRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-foreground">{row.label}</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 w-full">
          <Button
            onClick={onPlayAgain}
            className="w-full h-11 font-semibold"
          >
            Play Again
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
