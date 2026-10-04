// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

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

import CrazyEightsPage from "./page";

beforeEach(() => {
  localStorage.clear();
  // jsdom has no matchMedia; the animation-speed preference reads it.
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: false,
    media,
    addEventListener() {},
    removeEventListener() {},
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Pin Math.random (the page's shuffle source) so every run deals the same game. */
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

const status = () => screen.getByRole("status").textContent ?? "";
const livePlayableCard = () =>
  screen
    .queryAllByRole("button", { name: /^Select .+ of .+, card \d+ of \d+$/ })
    .find((b) => !(b as HTMLButtonElement).disabled);
const drawButton = () => screen.queryByRole("button", { name: /^Draw a card( \(reshuffle\))?$/ });

describe("Crazy Eights page", () => {
  it("deals, takes your plays and draws, lets the bots answer and reaches a result", () => {
    seedRandom(20261004);
    vi.useFakeTimers();
    render(<CrazyEightsPage />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Start Game" }));
    });
    // You sit first, so the table waits on you.
    expect(status()).toMatch(/^Your turn/);

    let sawBotThinking = false;
    let pickedSuit = false;
    let rematch: HTMLElement | null = null;
    for (let i = 0; i < 1000 && !rematch; i++) {
      const picker = screen.queryByRole("dialog", { name: "Choose a suit" });
      if (picker) {
        act(() => fireEvent.click(within(picker).getByRole("button", { name: /Hearts/ })));
        pickedSuit = true;
      } else if (status().startsWith("Your turn")) {
        const card = livePlayableCard();
        const draw = drawButton();
        if (card) act(() => fireEvent.click(card));
        else if (draw) act(() => fireEvent.click(draw));
      } else {
        if (/is thinking…$/.test(status())) sawBotThinking = true;
        act(() => {
          vi.advanceTimersByTime(1000);
        });
      }
      rematch = screen.queryByRole("button", { name: /rematch/i });
    }

    expect(sawBotThinking).toBe(true);
    expect(pickedSuit).toBe(true);
    expect(rematch).toBeTruthy();
    expect(status()).toMatch(/^You win the round!$|wins the round\.$/);
    expect(screen.getByText("Wins")).toBeTruthy();
  });
});
