"use client";

import type { ReactNode } from "react";
import type { GameShellState } from "@/lib/games/shell-types";
import { PlayerSeat } from "./player-seat";
import { TurnIndicator } from "./turn-indicator";

export interface VirtualTableSeatPlacement {
  seat: GameShellState["seats"][number];
  xPct: number;
  yPct: number;
  anchor: "self" | "opponent";
}

interface GameShellProps {
  state: GameShellState;
  gameType: string;
  actionArea?: ReactNode;
}

function roundPct(value: number) {
  return Math.round(value);
}

export function getVirtualTableSeatPlacements(
  seats: GameShellState["seats"],
): VirtualTableSeatPlacement[] {
  const selfSeat = seats.find((s) => s.isSelf);
  const opponentSeats = seats.filter((s) => !s.isSelf);
  const opponentCount = opponentSeats.length;
  const placements: VirtualTableSeatPlacement[] = opponentSeats.map((seat, index) => {
    const t = opponentCount === 1 ? 0.5 : (index + 1) / (opponentCount + 1);
    const angle = Math.PI + t * Math.PI;
    const xPct = 50 + 38 * Math.cos(angle);
    const yPct = 50 + 32 * Math.sin(angle);

    return {
      seat,
      xPct: roundPct(xPct),
      yPct: roundPct(yPct),
      anchor: "opponent" as const,
    };
  });

  if (selfSeat) {
    placements.push({ seat: selfSeat, xPct: 50, yPct: 82, anchor: "self" });
  }

  return placements;
}

export function GameShell({ state, gameType, actionArea }: GameShellProps) {
  const selfSeat = state.seats.find((s) => s.isSelf);
  const activePlayer = state.seats.find((s) => s.isActive);
  const isSelfTurn = !!selfSeat?.isActive;
  const seatPlacements = getVirtualTableSeatPlacements(state.seats);

  return (
    <div className="pip-table-surface pip-table-rail flex flex-col min-h-full w-full rounded-2xl overflow-hidden">
      <div className="relative flex-1 min-h-[440px] p-4 md:min-h-[520px] md:p-6">
        <div className="absolute inset-4 md:inset-6 rounded-[999px] border border-white/10 bg-black/10 shadow-inner" />
        <div className="absolute inset-4 md:inset-6 pointer-events-none text-white/25">
          <svg className="size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <ellipse
              cx="50"
              cy="50"
              rx="42"
              ry="34"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.8"
              strokeDasharray="2 2"
            />
          </svg>
        </div>

        <div className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
          <div className="bg-black/20 rounded-xl px-5 py-2 shadow-sm backdrop-blur-sm">
            <TurnIndicator
              activePlayerName={activePlayer?.name ?? ""}
              isSelfTurn={isSelfTurn}
              status={state.status}
              result={state.result}
            />
          </div>
        </div>

        {seatPlacements.map(({ seat, xPct, yPct, anchor }) => (
          <div
            key={seat.id}
            className={`pip-seat-panel absolute z-20 w-[min(15rem,42vw)] rounded-xl shadow-lg transition-all ${
              anchor === "self" ? "max-w-[25rem] md:w-[24rem]" : "md:w-[14rem]"
            }`}
            style={{
              left: `${xPct}%`,
              top: `${yPct}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <PlayerSeat seat={seat} gameType={gameType} />
          </div>
        ))}
      </div>

      {actionArea && (
        <div className="bg-background/95 border-t border-border px-4 py-3 md:px-6 md:py-4">
          {actionArea}
        </div>
      )}
    </div>
  );
}
