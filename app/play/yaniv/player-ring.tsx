"use client";

// The seats around the Yaniv table, with the draw and discard piles in the middle.

import { useEffect, useMemo, useState } from "react";
import type { Card } from "@/lib/games/types";
import type { YanivPlayer, YanivQuickDrawWindow } from "@/lib/games/yaniv";
import { getYanivRingLayout, type YanivTableFormFactor } from "@/lib/games/yaniv-layout";
import { ContextTooltip } from "./context-tooltip";
import type { ActionBadge, ScoreFeedback } from "./feedback";
import { DeckVisual, DiscardPileGroup, QuickDrawPile } from "./piles";
import { LiveTurnCountdownRing, LiveTurnSeconds } from "./turn-clock";


export function useYanivTableFormFactor(): YanivTableFormFactor {
  const [formFactor, setFormFactor] = useState<YanivTableFormFactor>("standard");

  useEffect(() => {
    const update = () => {
      if (window.matchMedia("(orientation: portrait) and (max-width: 720px)").matches) {
        setFormFactor("portrait");
      } else if (window.matchMedia("(min-width: 720px) and (min-aspect-ratio: 4/3)").matches) {
        setFormFactor("widescreen");
      } else {
        setFormFactor("standard");
      }
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return formFactor;
}

interface PlayerRingProps {
  players: YanivPlayer[];
  humanId: string;
  currentPlayerIndex: number;
  turnTimerActive: boolean;
  idlePulses: boolean;
  actionBadges: Record<string, ActionBadge>;
  scoreFeedback: Record<string, ScoreFeedback>;
  qdActive: boolean;
  qdWindow: YanivQuickDrawWindow | null;
  qdProgress: number;
  qdTimeLeft: number;
  qdPlayerCanSteal: boolean;
  deckCount: number;
  discardTopGroup: Card[];
  canDrawFromDiscard: boolean;
  onPickDiscardCard: (idx: number) => void;
  onSteal: () => void;
}

function getNextActiveIdx(players: YanivPlayer[], currentIdx: number): number {
  const N = players.length;
  for (let step = 1; step < N; step++) {
    const idx = (currentIdx + step) % N;
    if (!players[idx].eliminated) return idx;
  }
  return -1;
}

export function PlayerRing({
  players,
  humanId,
  currentPlayerIndex,
  turnTimerActive,
  idlePulses,
  actionBadges,
  scoreFeedback,
  qdActive,
  qdWindow,
  qdProgress,
  qdTimeLeft,
  qdPlayerCanSteal,
  deckCount,
  discardTopGroup,
  canDrawFromDiscard,
  onPickDiscardCard,
  onSteal,
}: PlayerRingProps) {
  const formFactor = useYanivTableFormFactor();
  const ringLayout = useMemo(
    () => getYanivRingLayout(players.map((player) => player.id), humanId, formFactor),
    [players, humanId, formFactor],
  );
  const nextPlayerIndex = getNextActiveIdx(players, currentPlayerIndex);
  const seats = players.map((player, i) => {
    const seatLayout = ringLayout.seats[i];
    const isActive = i === currentPlayerIndex;
    const isNext = i === nextPlayerIndex && !isActive;
    return { player, xPct: seatLayout.xPct, yPct: seatLayout.yPct, isActive, isNext, angle: seatLayout.angle };
  });

  // Small clockwise arc indicator: from ~350° to ~50° (short arc at top-right)
  // In SVG viewBox 0 0 100 100; widescreen uses an ellipse, not a scaled circle.
  const arcStart = {
    x: ringLayout.centerXPct + ringLayout.xRadiusPct * Math.cos(-0.3),
    y: ringLayout.centerYPct + ringLayout.yRadiusPct * Math.sin(-0.3),
  };
  const arcEnd = {
    x: ringLayout.centerXPct + ringLayout.xRadiusPct * Math.cos(0.6),
    y: ringLayout.centerYPct + ringLayout.yRadiusPct * Math.sin(0.6),
  };

  return (
    <div className="yaniv-player-ring relative w-full">
      {/* SVG ring guide */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <marker
            id="ring-arrow"
            markerWidth="3"
            markerHeight="3"
            refX="2.5"
            refY="1.5"
            orient="auto"
          >
            <path d="M0,0 L0,3 L3,1.5 z" fill="currentColor" opacity="0.25" />
          </marker>
        </defs>
        {/* Dashed ring */}
        <ellipse
          cx={ringLayout.centerXPct}
          cy={ringLayout.centerYPct}
          rx={ringLayout.xRadiusPct}
          ry={ringLayout.yRadiusPct}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.4"
          strokeDasharray="2 2"
          opacity="0.15"
        />
        {/* Clockwise direction arc with arrowhead */}
        <path
          d={`M ${arcStart.x.toFixed(2)},${arcStart.y.toFixed(2)} A ${ringLayout.xRadiusPct},${ringLayout.yRadiusPct} 0 0,1 ${arcEnd.x.toFixed(2)},${arcEnd.y.toFixed(2)}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.6"
          opacity="0.25"
          markerEnd="url(#ring-arrow)"
        />
      </svg>

      {/* Player seat nodes */}
      {seats.map(({ player, xPct, yPct, isActive, isNext }) => (
        <PlayerSeatNode
          key={player.id}
          player={player}
          isHuman={player.id === humanId}
          isActive={isActive}
          isNext={isNext}
          showTurnRing={isActive && turnTimerActive}
          idlePulses={idlePulses}
          badge={actionBadges[player.id]}
          scoreFeedback={scoreFeedback[player.id]}
          style={{
            position: "absolute",
            left: `calc(${xPct}% - 36px)`,
            top: `calc(${yPct}% - 40px)`,
          }}
        />
      ))}

      {/* Center: deck + discard */}
      <div
        className="absolute flex flex-col items-center gap-2"
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
        }}
      >
        <div className="flex items-end gap-6">
          {/* Draw pile — face-down green stack you draw a blind card from. */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-center justify-center min-h-[80px]">
              <DeckVisual count={deckCount} />
            </div>
            <div className="flex flex-col items-center leading-none">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Draw
              </span>
              <span className="text-[9px] text-muted-foreground/70 tabular-nums">
                {deckCount} left
              </span>
            </div>
          </div>

          {/* Discard pile — face-up; its top card is a key decision input, so it is
              rendered large and clearly distinct from the draw pile. */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-center justify-center min-h-[80px]">
              {qdActive && qdWindow ? (
                <QuickDrawPile
                  cards={qdWindow.cards}
                  progress={qdProgress}
                  timeLeftMs={qdTimeLeft}
                  canSteal={qdPlayerCanSteal}
                  onSteal={onSteal}
                />
              ) : (
                <DiscardPileGroup
                  group={discardTopGroup}
                  canDraw={canDrawFromDiscard}
                  onPickCard={onPickDiscardCard}
                />
              )}
            </div>
            <div className="flex flex-col items-center leading-none">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {qdActive ? "Quick draw!" : "Discard"}
              </span>
              <span className="text-[9px] text-muted-foreground/70">
                {qdActive
                  ? "tap to steal"
                  : canDrawFromDiscard && discardTopGroup.length > 0
                  ? "← tap to draw"
                  : " "}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerSeatNode({
  player,
  isHuman,
  isActive,
  isNext,
  showTurnRing,
  idlePulses,
  badge,
  scoreFeedback,
  style,
}: {
  player: YanivPlayer;
  isHuman: boolean;
  isActive: boolean;
  isNext: boolean;
  showTurnRing?: boolean;
  idlePulses: boolean;
  badge?: ActionBadge;
  scoreFeedback?: ScoreFeedback;
  style?: React.CSSProperties;
}) {
  const initials = player.name.slice(0, 2).toUpperCase();

  // Inactive (and not eliminated) seats are visibly dimmed so the active player
  // is unmistakable at any player count. The active seat scales up slightly.
  const seatOpacity = isActive ? 1 : player.eliminated ? 0.3 : 0.45;

  return (
    <div
      className="flex flex-col items-center gap-0.5 select-none transition-all duration-300"
      style={{
        width: 72,
        ...style,
        opacity: seatOpacity,
        transform: `${(style?.transform as string) ?? ""} scale(${isActive ? 1.08 : 1})`.trim(),
      }}
    >
      {/* Avatar */}
      <div className="relative flex items-center justify-center">
        <ContextTooltip
          text={
            showTurnRing
              ? "Active turn. The ring drains as time runs out; at zero, a safe discard is auto-played."
              : isNext
              ? "This player is next."
              : `${player.name}'s seat. The badge shows cards left in hand.`
          }
          className="rounded-full"
        >
          {/* Co-located turn countdown ring (time remaining this turn).
              LiveTurnCountdownRing subscribes to TurnCountdownContext so only it
              re-renders per 10Hz tick, not this seat node (CAR-182). */}
          {showTurnRing && <LiveTurnCountdownRing />}
          <div
            className={`
              w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
              transition-all duration-300
              ${
                isActive
                  ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
                  : isNext
                  ? "bg-muted text-foreground ring-1 ring-primary/40"
                  : player.eliminated
                  ? "bg-muted/30 text-muted-foreground/40"
                  : "bg-muted text-muted-foreground"
              }
            `}
            style={
              isActive && idlePulses
                ? { animation: "seat-glow-pulse 1.5s ease-in-out infinite" }
                : undefined
            }
          >
            {initials}
          </div>
        </ContextTooltip>

        {/* Numeric card-count badge — how many cards an opponent holds is a core Yaniv
            decision input, so it gets an explicit number rather than a fan to eyeball. */}
        {!player.eliminated && (
          <ContextTooltip
            text={`${player.name} has ${player.hand.length} card${player.hand.length === 1 ? "" : "s"} left.`}
            className="absolute -bottom-1.5 -right-1.5"
          >
            <div
              className="min-w-[20px] h-5 px-1 rounded-full
                bg-foreground text-background text-[11px] font-bold leading-none
                flex items-center justify-center ring-2 ring-background tabular-nums shadow-sm"
              aria-label={`${player.hand.length} card${player.hand.length === 1 ? "" : "s"} in hand`}
            >
              {player.hand.length}
            </div>
          </ContextTooltip>
        )}

        {/* Action badge */}
        {badge && (
          <div
            key={badge.key}
            className="absolute pointer-events-none"
            style={{
              bottom: "calc(100% + 2px)",
              left: "50%",
              animation: "badge-slide-up 2s ease-out forwards",
            }}
          >
            <span
              className={`
                text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap
                ${
                  badge.variant === "yaniv"
                    ? "bg-amber-500 text-white"
                    : badge.variant === "stolen"
                    ? "bg-destructive text-white"
                    : "bg-primary/90 text-primary-foreground"
                }
              `}
            >
              {badge.text}
            </span>
          </div>
        )}

        {/* Score cascade — the Yaniv-call climax. A proportional count-up of the
            new running total, glow + shake scaled to how many points landed, and
            a +delta chip coloured by outcome (green = stayed safe, red = took
            points). Sound is fired alongside in scheduleScoreCascade. GAM-56. */}
        {scoreFeedback && <ScoreCascadeBadge feedback={scoreFeedback} />}
      </div>

      {/* Name */}
      <span
        className={`text-[10px] font-medium text-center leading-tight max-w-[72px] truncate ${
          isActive ? "text-primary" : player.eliminated ? "text-muted-foreground/40 line-through" : "text-foreground"
        }`}
      >
        {player.name}
      </span>

      {/* Status label */}
      {isActive && (
        <span
          className="text-[9px] text-primary font-semibold tabular-nums"
          role={showTurnRing ? "timer" : undefined}
          aria-live={showTurnRing ? "off" : undefined}
        >
          ↑ turn
          {showTurnRing && <LiveTurnSeconds />}
        </span>
      )}
      {!isActive && isNext && (
        <span className="text-[9px] text-muted-foreground">next</span>
      )}
      {!isActive && !isNext && isHuman && (
        <span className="text-[9px] text-muted-foreground/60">you</span>
      )}

      {/* Running score — the live card-count now lives in the badge on the avatar. */}
      <div
        className={`flex gap-1 text-[9px] tabular-nums ${
          player.eliminated ? "text-muted-foreground/40" : "text-muted-foreground"
        }`}
      >
        <span>{player.score} pts</span>
        {player.eliminated && <span className="text-destructive/70">· out</span>}
      </div>
    </div>
  );
}

// ── ScoreCascadeBadge ─────────────────────────────────────────────────────
// The Yaniv-call climax, rendered per seat. The running total counts up from
// scoreBefore → scoreAfter; glow + shake scale with how many points landed
// (intensity), and colour follows the GAM-54 state channels: legal-green when a
// seat stays safe (delta 0), alert-red when it takes points. durationMs is
// already animation-speed scaled by the caller, so a "reduced" setting collapses
// the count-up to its final value instantly.
function useScoreCountUp(from: number, to: number, durationMs: number, key: number): number {
  const [value, setValue] = useState(from);
  useEffect(() => {
    // All updates happen inside the rAF callback so nothing is set synchronously
    // during the effect. A scaled-down "reduced" duration finishes in one frame.
    let raf = 0;
    const start = Date.now();
    const dur = Math.max(1, durationMs);
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, durationMs, key]);
  return value;
}

function ScoreCascadeBadge({ feedback }: { feedback: ScoreFeedback }) {
  const total = useScoreCountUp(
    feedback.scoreBefore,
    feedback.scoreAfter,
    feedback.durationMs,
    feedback.key,
  );
  const isSafe = feedback.tone === "safe";
  const color = isSafe ? "var(--state-legal)" : "var(--state-alert)";
  const glowBlur = feedback.intensity === "strong" ? 16 : feedback.intensity === "medium" ? 10 : 6;
  const shake = feedback.intensity === "strong";

  return (
    <div
      key={feedback.key}
      className="absolute pointer-events-none left-1/2 -translate-x-1/2 flex flex-col items-center"
      style={{ bottom: "calc(100% + 16px)", animation: "score-delta-pop 240ms ease-out both" }}
      role="status"
      aria-live="polite"
      aria-label={
        isSafe
          ? `${feedback.name} stayed safe, ${feedback.scoreAfter} points`
          : `${feedback.name} took ${feedback.scoreDelta} points, now ${feedback.scoreAfter}`
      }
    >
      <span
        className="text-base font-extrabold tabular-nums leading-none px-2 py-1 rounded-lg"
        style={{
          color,
          background: "color-mix(in oklab, var(--card) 90%, transparent)",
          boxShadow: `0 0 ${glowBlur}px ${Math.round(glowBlur / 3)}px color-mix(in oklab, ${color} 55%, transparent)`,
          animation: shake ? "score-cascade-shake 360ms ease-in-out both" : undefined,
        }}
      >
        {total}
      </span>
      <span className="mt-0.5 text-[10px] font-bold tabular-nums" style={{ color }}>
        {isSafe ? "safe" : `+${feedback.scoreDelta}`}
      </span>
    </div>
  );
}
