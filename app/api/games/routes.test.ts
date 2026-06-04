import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { getGame } from "@/lib/game-store";
import type { GoFishGameState } from "@/lib/games/go-fish";
import { POST as createGame } from "./route";
import { POST as applyGameAction } from "./[id]/action/route";

describe("/api/games", () => {
  it("creates and applies actions for Go Fish games", async () => {
    const createResponse = await createGame(
      new Request("http://localhost/api/games?gameType=go_fish"),
    );
    const { gameId } = (await createResponse.json()) as { gameId: string };

    const initialState = getGame(gameId) as GoFishGameState;
    const askingPlayer = initialState.players[initialState.currentPlayerIndex];
    const targetPlayer = initialState.players.find((p) => p.id !== askingPlayer.id)!;

    const actionResponse = await applyGameAction(
      new NextRequest(`http://localhost/api/games/${gameId}/action`, {
        method: "POST",
        body: JSON.stringify({
          type: "ASK",
          playerId: askingPlayer.id,
          targetPlayerId: targetPlayer.id,
          rank: askingPlayer.hand[0].rank,
        }),
      }),
      { params: Promise.resolve({ id: gameId }) },
    );

    expect(actionResponse.status).toBe(200);
    const { state } = (await actionResponse.json()) as { state: GoFishGameState };
    expect(state.gameId).toBe(gameId);
    expect(state.lastEvent).toMatchObject({
      askingPlayerId: askingPlayer.id,
      targetPlayerId: targetPlayer.id,
    });
    expect(getGame(gameId)).toEqual(state);
  });
});
