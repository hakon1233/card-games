"use client";

// The Crazy Eights settings screen you see before a game: how many bots, animation speed and
// card colours.

import { BrandHeader } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { AnimationPreferencesControl } from "@/components/game/animation-preferences-control";
import { CardDeckControl } from "@/components/game/card-deck-control";
import type { AnimationSpeed } from "@/lib/animation-preferences";
import type { CardDeck } from "@/lib/card-deck-preferences";

export function CrazyEightsSettingsScreen({
  numBots,
  onNumBotsChange,
  animationSpeed,
  onAnimationSpeedChange,
  cardDeck,
  onCardDeckChange,
  onStart,
}: {
  numBots: number;
  onNumBotsChange: (n: number) => void;
  animationSpeed: AnimationSpeed;
  onAnimationSpeedChange: (speed: AnimationSpeed) => void;
  cardDeck: CardDeck;
  onCardDeckChange: (deck: CardDeck) => void;
  onStart: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <BrandHeader title="Crazy Eights" backLabel="Back" />
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="flex w-full max-w-sm flex-col gap-6 rounded-lg border border-border bg-card/70 p-5 shadow-sm">
          <div className="text-center">
            <p className="pip-eyebrow text-xs">Crazy Eights table</p>
            <h2 className="mt-2 font-heading text-2xl font-bold text-foreground">
              Game Settings
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Match the suit or rank of the top card. Eights are wild — play one to
              choose the suit. First to empty their hand wins.
            </p>
          </div>

          <SettingRow label="Number of Bots">
            <div className="flex gap-2">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onNumBotsChange(n)}
                  aria-pressed={numBots === n}
                  className={`h-9 w-9 rounded-lg text-sm font-semibold transition-colors ${
                    numBots === n
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </SettingRow>

          <SettingRow label="Animation Speed">
            <AnimationPreferencesControl value={animationSpeed} onChange={onAnimationSpeedChange} />
          </SettingRow>

          <SettingRow label="Card Colors">
            <CardDeckControl value={cardDeck} onChange={onCardDeckChange} />
            <p className="mt-1 text-xs text-muted-foreground">
              Four-color gives each suit its own color. Suit symbols always show too.
            </p>
          </SettingRow>

          <Button onClick={onStart} size="lg" className="mt-2 h-12 w-full text-base font-bold">
            Start Game
          </Button>
        </div>
      </div>
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </div>
  );
}
