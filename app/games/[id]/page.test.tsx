// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { PublicGameState } from "@/lib/games/types";

let routeGameId = "game-1";
const push = vi.fn((href: string) => {
  routeGameId = href.split("/").pop() ?? routeGameId;
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: routeGameId }),
  useRouter: () => ({ push }),
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, string>)} />;
  },
}));

vi.mock("partysocket", () => ({
  default: class MockPartySocket {
    onmessage: ((evt: MessageEvent) => void) | null = null;
    close = vi.fn();
  },
}));

import GamePage from "./page";

function completedLoss(gameId: string): PublicGameState {
  return {
    gameId,
    gameType: "blackjack",
    status: "dealer_win",
    result: "dealer_win",
    playerHand: {
      playerId: "player-1",
      isBot: false,
      cards: [
        { suit: "hearts", rank: "10" },
        { suit: "clubs", rank: "8" },
      ],
    },
    dealerHand: [
      { suit: "spades", rank: "10" },
      { suit: "diamonds", rank: "9" },
    ],
    turn: "over",
  };
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  routeGameId = "game-1";
  push.mockClear();
  vi.unstubAllGlobals();
});

describe("Blackjack room page", () => {
  it("accumulates session totals when a rematch route completes another hand", async () => {
    const states = new Map<string, PublicGameState>([
      ["game-1", completedLoss("game-1")],
      ["game-2", completedLoss("game-2")],
    ]);

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/games" && init?.method === "POST") {
        return Response.json({ gameId: "game-2" });
      }

      const gameId = url.match(/\/api\/games\/([^/]+)\/action/)?.[1];
      if (gameId) {
        return Response.json({ state: states.get(gameId) });
      }

      return Response.json({ error: "unexpected request" }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<GamePage />);

    await waitFor(() => {
      expect(screen.getByText("1")).toBeTruthy();
      expect(screen.getByText("Losses")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /rematch/i }));
    });
    rerender(<GamePage />);

    await waitFor(() => {
      expect(screen.getByText("2")).toBeTruthy();
      expect(screen.getByText("Losses")).toBeTruthy();
    });
  });
});
