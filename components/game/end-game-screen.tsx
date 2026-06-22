"use client";

import { Button } from "@/components/ui/button";
import { House, RotateCcw, Trophy } from "lucide-react";

export interface SessionRow {
  label: string;
  value: string | number;
}

export interface StandingRow {
  rank: number;
  name: string;
  score: number;
  eliminated?: boolean;
  isWinner?: boolean;
}

interface EndGameScreenProps {
  headline: string;
  subline?: string;
  sessionRows: SessionRow[];
  /** Optional per-entry final scores (e.g. one row per player), shown as a list. */
  finalScoreRows?: SessionRow[];
  winnerName?: string;
  standings?: StandingRow[];
  onPlayAgain: () => void;
  onChangeGame: () => void;
}

export function EndGameScreen({
  headline,
  subline,
  sessionRows,
  finalScoreRows,
  winnerName,
  standings,
  onPlayAgain,
  onChangeGame,
}: EndGameScreenProps) {
  const hasStandings = !!standings?.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--pip-tin-red),var(--pip-gold),var(--pip-tin-red))]" />
        <div className="flex flex-col items-center gap-5 p-5 sm:p-6">
          <div className="relative flex size-16 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--pip-gold)_55%,transparent)] bg-[color-mix(in_oklab,var(--pip-gold)_18%,var(--card))] shadow-lg shadow-black/20">
            <Trophy className="size-8 text-[var(--pip-gold)]" aria-hidden="true" />
          </div>

          <div className="text-center">
            {winnerName && (
              <p className="pip-eyebrow text-[10px] leading-none text-[var(--pip-gold)]">
                Winner
              </p>
            )}
            <p className="mt-1 text-3xl font-bold text-card-foreground">{headline}</p>
            {winnerName && (
              <p className="mt-1 text-base font-semibold text-foreground">
                {winnerName}
              </p>
            )}
          {subline && (
            <p className="mt-1 text-sm text-muted-foreground">{subline}</p>
          )}
        </div>

        {hasStandings && (
          <div className="w-full">
            <p className="mb-2 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Final Standings
            </p>
            <div className="flex flex-col gap-1.5">
              {standings.map((row) => (
                <div
                  key={`${row.rank}-${row.name}`}
                  className={`grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                    row.isWinner
                      ? "border-[color-mix(in_oklab,var(--pip-gold)_62%,transparent)] bg-[color-mix(in_oklab,var(--pip-gold)_16%,transparent)]"
                      : "border-border bg-background/35"
                  }`}
                >
                  <span className="tabular-nums text-muted-foreground">#{row.rank}</span>
                  <span className="min-w-0 truncate font-semibold text-foreground">
                    {row.name}
                    {row.eliminated && (
                      <span className="ml-2 text-xs font-medium text-muted-foreground">
                        out
                      </span>
                    )}
                  </span>
                  <span className="font-bold tabular-nums text-foreground">
                    {row.score}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!hasStandings && sessionRows.length > 0 && (
          <div className="w-full">
            <p className="mb-2 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
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
            className="h-11 w-full gap-2 font-semibold"
          >
            <RotateCcw data-icon="inline-start" aria-hidden="true" />
            Rematch
          </Button>
          <Button
            onClick={onChangeGame}
            variant="ghost"
            className="h-10 w-full gap-2 text-muted-foreground hover:text-foreground"
          >
            <House data-icon="inline-start" aria-hidden="true" />
            Change Game
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
}
