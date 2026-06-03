"use client";

import type { ReactNode } from "react";
import type { GameShellState } from "@/lib/games/shell-types";
import { PlayerSeat } from "./player-seat";
import { TurnIndicator } from "./turn-indicator";

interface GameShellProps {
  state: GameShellState;
  actionArea?: ReactNode;
}

export function GameShell({ state, actionArea }: GameShellProps) {
  const selfSeat = state.seats.find((s) => s.isSelf);
  const opponentSeats = state.seats.filter((s) => !s.isSelf);
  const activePlayer = state.seats.find((s) => s.isActive);
  const isSelfTurn = !!selfSeat?.isActive;

  return (
    <div className="flex flex-col min-h-full w-full bg-[#0f5132] rounded-2xl overflow-hidden">
      {/* Felt table area */}
      <div className="flex flex-col flex-1 gap-4 p-4 md:p-6">
        {/* Opponent seats — top of table */}
        {opponentSeats.length > 0 && (
          <div className="flex flex-wrap gap-3 justify-center">
            {opponentSeats.map((seat) => (
              <div key={seat.id} className="bg-white/10 backdrop-blur-sm rounded-xl">
                <PlayerSeat seat={seat} />
              </div>
            ))}
          </div>
        )}

        {/* Turn indicator — center of table */}
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-black/20 rounded-xl px-6 py-2">
            <TurnIndicator
              activePlayerName={activePlayer?.name ?? ""}
              isSelfTurn={isSelfTurn}
              status={state.status}
              result={state.result}
            />
          </div>
        </div>

        {/* Self seat — bottom of table */}
        {selfSeat && (
          <div className="bg-white/10 backdrop-blur-sm rounded-xl">
            <PlayerSeat seat={selfSeat} />
          </div>
        )}
      </div>

      {/* Action area — below the table */}
      {actionArea && (
        <div className="bg-background/95 border-t border-border px-4 py-3 md:px-6 md:py-4">
          {actionArea}
        </div>
      )}
    </div>
  );
}
