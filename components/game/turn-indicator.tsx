"use client";

interface TurnIndicatorProps {
  activePlayerName: string;
  isSelfTurn: boolean;
  status: "waiting" | "in_progress" | "over";
  result?: string;
}

export function TurnIndicator({
  activePlayerName,
  isSelfTurn,
  status,
  result,
}: TurnIndicatorProps) {
  if (status === "waiting") {
    return (
      <div className="text-center text-sm text-muted-foreground py-1">
        Waiting to start…
      </div>
    );
  }

  if (status === "over") {
    const label = result ?? "Game over";
    return (
      <div className="text-center text-sm font-semibold py-1 text-foreground">
        {label}
      </div>
    );
  }

  return (
    <div
      className={`
        text-center text-sm font-medium py-1 rounded-md
        ${isSelfTurn ? "text-primary" : "text-muted-foreground"}
      `}
    >
      {isSelfTurn ? "Your turn" : `${activePlayerName}'s turn`}
    </div>
  );
}
