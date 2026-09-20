// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// next/navigation + next/image are not available under jsdom — stub the bits
// the page touches so we can drive the real component end to end.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, string>)} />;
  },
}));

import GoFishPage from "./page";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/**
 * The deck is shuffled with Math.random(), so an unseeded run deals a different
 * game every time and the bounded drive-loop below could occasionally fail to
 * reach the win screen. Pin Math.random to a small deterministic PRNG so this
 * test always plays the same game.
 */
function seedRandom(seed: number) {
  let s = seed >>> 0;
  vi.spyOn(Math, "random").mockImplementation(() => {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  });
}

/**
 * End-to-end UI smoke for GAM-99: the Go Fish route must deal, accept human
 * asks against the bots, let the bots play their turns, and reach a win
 * screen — proving the engine is actually wired into the page (not the old
 * "coming soon" stub).
 */
describe("Go Fish page", () => {
  it("plays a full game from deal to a win screen", () => {
    seedRandom(20260920);
    vi.useFakeTimers();

    render(<GoFishPage />);

    // Start screen → deal.
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /deal cards/i }));
    });

    // The human starts (currentPlayerIndex 0), so a rank button must be live.
    const liveRankButton = () =>
      screen
        .queryAllByRole("button", { name: /^Ask for .+ — you hold/i })
        .find((b) => !(b as HTMLButtonElement).disabled);
    expect(liveRankButton()).toBeTruthy();

    // Drive the game: when it's our turn pick a rank and ask an opponent;
    // otherwise let the bot timers fire. Bounded well above a full game length.
    let rematch: HTMLElement | null = null;
    for (let i = 0; i < 600 && !rematch; i++) {
      const rank = liveRankButton();
      if (rank) {
        act(() => fireEvent.click(rank));
        const askBtn = screen
          .queryAllByRole("button", { name: /^Ask (Marlin|Pearl)/i })
          .find((b) => !(b as HTMLButtonElement).disabled);
        if (askBtn) {
          act(() => fireEvent.click(askBtn));
        }
      } else {
        // Bot turn or empty-hand skip — advance the scheduled timeout.
        act(() => {
          vi.advanceTimersByTime(1000);
        });
      }
      rematch = screen.queryByRole("button", { name: /rematch/i });
    }

    // Game reached its end screen with a declared winner.
    expect(rematch).toBeTruthy();
    expect(screen.getAllByText(/you win!|you tied!|wins/i).length).toBeGreaterThan(0);
  });
});
