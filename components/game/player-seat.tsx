"use client";

import type { Seat } from "@/lib/games/shell-types";
import { PlayerHand } from "./player-hand";

interface PlayerSeatProps {
  seat: Seat;
  gameType: string;
}

export function PlayerSeat({ seat, gameType }: PlayerSeatProps) {
  return (
    <div
      className={`
        flex flex-col gap-2 rounded-xl p-3
        ${seat.isActive ? "ring-2 ring-primary/50 bg-primary/[0.08]" : ""}
      `}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="min-w-0 flex-1 text-sm font-medium leading-tight break-words">
          {seat.name}
        </span>
        {seat.isBot && (
          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
            BOT
          </span>
        )}
        <div className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {seat.score.label}: <span className="font-semibold text-foreground">{seat.score.value}</span>
        </div>
      </div>
      <PlayerHand cards={seat.hand} isSelf={seat.isSelf} gameType={gameType} />
    </div>
  );
}
