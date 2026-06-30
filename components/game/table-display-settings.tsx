"use client";

import { Settings2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import {
  AnimationPreferencesControl,
} from "@/components/game/animation-preferences-control";
import { CardDeckControl } from "@/components/game/card-deck-control";
import type { AnimationSpeed } from "@/lib/animation-preferences";
import type { CardDeck } from "@/lib/card-deck-preferences";

/**
 * In-game overflow affordance for display-only preferences.
 *
 * Animation Speed and Card Colors also live in the pre-game Settings screen;
 * pinning them permanently on the play surface wasted prime table space (worst
 * at 375px) and floated, brightly lit, over the round-end / game-over overlays.
 * Collapsing them behind a single gear keeps them reachable mid-game without
 * competing with the table. Callers hide this entirely while an end-of-round /
 * game-over overlay is open so no settings chrome survives the dim backdrop.
 */
export function TableDisplaySettings({
  animationSpeed,
  onAnimationSpeedChange,
  cardDeck,
  onCardDeckChange,
}: {
  animationSpeed: AnimationSpeed;
  onAnimationSpeedChange: (speed: AnimationSpeed) => void;
  cardDeck: CardDeck;
  onCardDeckChange: (deck: CardDeck) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="ml-auto relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label="Display settings"
        title="Display settings"
      >
        <Settings2 className="h-4 w-4" aria-hidden />
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Display settings"
          className="absolute right-0 top-full z-50 mt-2 w-64 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-2xl"
        >
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Animation speed</span>
            <AnimationPreferencesControl
              value={animationSpeed}
              onChange={onAnimationSpeedChange}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Card colors</span>
            <CardDeckControl value={cardDeck} onChange={onCardDeckChange} />
          </div>
        </div>
      )}
    </div>
  );
}
