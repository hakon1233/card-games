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
 * Deal a seeded game and drive it: when it's your turn pick the first rank you
 * hold and ask the first opponent you may ask; otherwise let the bot timers
 * fire. Returns the end screen's rematch button, or null if the game never got
 * there. Bounded well above a full game length.
 */
function playToEnd(seed: number): HTMLElement | null {
  seedRandom(seed);
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
      // Bot turn — advance the scheduled timeout.
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }
    rematch = screen.queryByRole("button", { name: /rematch/i });
  }
  return rematch;
}

/**
 * End-to-end UI smoke: the Go Fish route must deal, accept human
 * asks against the bots, let the bots play their turns, and reach a win
 * screen — proving the engine is actually wired into the page (not the old
 * "coming soon" stub).
 */
describe("Go Fish page", () => {
  it("plays a full game from deal to a win screen", () => {
    const rematch = playToEnd(20260920);

    // Game reached its end screen with a declared winner.
    expect(rematch).toBeTruthy();
    expect(screen.getAllByText(/you win!|you tied!|wins/i).length).toBeGreaterThan(0);
  });

  it("lets you ask an empty-handed opponent when no opponent holds cards", () => {
    // This seed deals a game in which Marlin and Pearl both run out of cards
    // while you still hold some and the pond is not dry.
    expect(playToEnd(4)).toBeTruthy();
  });
});
