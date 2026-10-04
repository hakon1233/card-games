// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { seededRng } from "@/lib/games/engine";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, string>)} />;
  },
}));

const SETTINGS_KEY = "yaniv-settings";
/** With this seed you may call Yaniv on your fifth turn, before the bot does. */
const PLAY_SEED = 21;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  // jsdom has no matchMedia; the table reads it for its form factor.
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

/**
 * Render the page, let the saved settings load (they arrive on a microtask), and seed
 * Math.random: the deal, the bots' Yaniv calls and the Quick Draw steal delay all draw on it.
 */
async function openPage(seed = 1) {
  const random = vi.spyOn(Math, "random");
  // Loaded afresh after the spy: the page's bot keeps the Math.random it is built with.
  vi.resetModules();
  const { default: YanivPage } = await import("./page");
  render(<YanivPage />);
  await act(async () => {});
  // Seeded only now: React draws one random number the first time it queues a task.
  random.mockImplementation(seededRng(seed));
}

async function click(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
  });
}

/** Let time pass, then flush the microtasks the clocks reset themselves on. */
async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

function settingRow(label: string) {
  const row = screen.getByText(label).parentElement;
  if (!row) throw new Error(`No setting row ${label}`);
  return within(row);
}

/** Your hand as "rank of suit" labels, in the order the table shows them. */
function hand(): string[] {
  return screen
    .queryAllByRole("button", { name: /^Select .+, card \d+ of \d+$/ })
    .map((b) => /^Select (.+), card/.exec(b.getAttribute("aria-label") ?? "")?.[1] ?? "");
}

function handCard(label: string) {
  return screen.getByRole("button", { name: new RegExp(`^Select ${label}, card`) });
}

const POINTS: Record<string, number> = { Joker: 0, A: 1, J: 10, Q: 10, K: 10 };
/** The Yaniv points of a "rank of suit" label. */
function points(label: string) {
  const rank = label.split(" of ")[0];
  return POINTS[rank] ?? Number(rank);
}

function isYourTurn() {
  return screen.queryByText("— your turn") !== null;
}

/** Discard the first card in your hand and draw from the deck. */
async function discardFirstAndDraw() {
  await click(handCard(hand()[0]));
  await click(screen.getByRole("button", { name: "Discard & Draw from Deck" }));
}

describe("Yaniv page", () => {
  it("offers Yaniv call thresholds from 3 through 15", async () => {
    await openPage();
    const thresholds = settingRow("Yaniv Call Threshold")
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(thresholds).toEqual(["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]);
  });

  it("starts from the settings saved last time, and saves the ones you start with", async () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ numBots: 3, yanivThreshold: 5, scoreLimit: 100, quickDraw: true, lowTimeSound: true }),
    );
    await openPage();

    expect(settingRow("Quick Draw").getByRole("switch", { name: "Quick Draw" }).getAttribute("aria-checked")).toBe("true");
    expect(settingRow("Idle Pulses").getByRole("switch").getAttribute("aria-checked")).toBe("true");
    await click(settingRow("Elimination Score").getByRole("button", { name: "150" }));
    await click(screen.getByRole("button", { name: "Start Game" }));

    expect(screen.getByText("Bot 3")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}")).toEqual({
      yanivThreshold: 5,
      scoreLimit: 150,
      quickDraw: true,
      numBots: 3,
      lowTimeSound: true,
      idlePulses: true,
      nextUpPreview: true,
    });
  });

  it("plays a round: discard and draw, the bot answers, you call Yaniv, the scores show, the next round deals", async () => {
    await openPage(PLAY_SEED);
    await click(screen.getByRole("button", { name: "Start Game" }));

    expect(isYourTurn()).toBe(true);
    expect(hand()).toHaveLength(5);

    // One turn: discard, draw from the deck; the bot answers before control returns.
    const before = hand();
    await discardFirstAndDraw();
    expect(isYourTurn()).toBe(true);
    expect(hand()).toHaveLength(5);
    expect(hand()).not.toContain(before[0]);
    // Both seats show what they drew.
    expect(screen.getAllByText(/^Drew/)).toHaveLength(2);

    // Keep discarding until you may call Yaniv.
    for (let turn = 0; turn < 40 && !screen.queryByRole("button", { name: /^Call Yaniv!/ }); turn++) {
      await discardFirstAndDraw();
    }
    const call = screen.getByRole("button", { name: /^Call Yaniv!/ });
    await click(call);

    // The scores land seat by seat before the round-end overlay opens.
    expect(screen.queryByText("Round 1 complete")).toBeNull();
    await advance(5000);
    expect(screen.getByText("Round 1 complete")).toBeTruthy();
    expect(screen.getByText("Yaniv! You win this round")).toBeTruthy();
    // Bot 1 is left holding 11 points.
    expect(screen.getByText("+11")).toBeTruthy();

    await click(screen.getByRole("button", { name: "Next Round" }));
    expect(screen.queryByText("Round 1 complete")).toBeNull();
    expect(hand()).toHaveLength(5);
  });

  it("plays rounds until one player is left, then shows the final standings and your rounds won and lost", async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ scoreLimit: 100 }));
    await openPage(PLAY_SEED);
    await click(screen.getByRole("button", { name: "Start Game" }));

    for (let step = 0; step < 400 && !screen.queryByText("Rounds Won"); step++) {
      const call = screen.queryByRole("button", { name: /^Call Yaniv!/ });
      const next = screen.queryByRole("button", { name: "Next Round" });
      if (call) await click(call);
      else if (next) await click(next);
      else if (isYourTurn()) await discardFirstAndDraw();
      else await advance(5000);
    }

    expect(screen.getByText("Game Complete")).toBeTruthy();
    expect(screen.getByText("Bot 1 outlasted the table.")).toBeTruthy();
    expect(screen.getByText("Rounds Won").parentElement?.textContent).toBe("1Rounds Won");
    expect(screen.getByText("Rounds Lost").parentElement?.textContent).toBe("4Rounds Lost");
  });

  it("counts every round in rounds won and lost, including one a bot ends on its opening moves", async () => {
    // With three bots and this seed, bots open several rounds and call Yaniv before you act.
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ scoreLimit: 100, yanivThreshold: 15, numBots: 3 }));
    await openPage(4);
    await click(screen.getByRole("button", { name: "Start Game" }));

    let roundsSeen = 0;
    for (let step = 0; step < 600 && !screen.queryByText("Rounds Won"); step++) {
      const heading = screen.queryByText(/^Round \d+ complete$/);
      if (heading) roundsSeen = Math.max(roundsSeen, Number(/\d+/.exec(heading.textContent ?? "")?.[0]));
      const call = screen.queryByRole("button", { name: /^Call Yaniv!/ });
      const next = screen.queryByRole("button", { name: "Next Round" });
      if (call) await click(call);
      else if (next) await click(next);
      else if (isYourTurn()) await discardFirstAndDraw();
      else await advance(5000);
    }

    const tally = (label: string) =>
      Number(screen.getByText(label).parentElement?.textContent?.replace(label, ""));
    // Every completed round plus the final one.
    expect(tally("Rounds Won") + tally("Rounds Lost")).toBe(roundsSeen + 1);
  });

  it("lets the bots finish the game after you are eliminated, then shows the final standings", async () => {
    // Three bots outlive you: each round after you are out is bots only, longer than one batch
    // of bot moves.
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ scoreLimit: 100, numBots: 3 }));
    await openPage(1);
    await click(screen.getByRole("button", { name: "Start Game" }));

    // You never call Yaniv, so the bots' calls push you out first.
    for (let step = 0; step < 600 && !screen.queryByText("Rounds Won"); step++) {
      const next = screen.queryByRole("button", { name: "Next Round" });
      if (next) await click(next);
      else if (isYourTurn()) await discardFirstAndDraw();
      else await advance(5000);
    }

    expect(screen.getByText("Game Complete")).toBeTruthy();
    const yourRow = screen.getAllByText("You").map((el) => el.parentElement?.textContent);
    expect(yourRow).toContain("Youout");
  });

  it("plays a safe discard for you when your turn clock runs out", async () => {
    await openPage(PLAY_SEED);
    await click(screen.getByRole("button", { name: "Start Game" }));
    const before = hand();

    await advance(19_900);
    expect(hand()).toEqual(before);
    expect(screen.getByText(/↑ turn · 1s/)).toBeTruthy();

    await advance(200);
    const highest = before.reduce((a, b) => (points(b) > points(a) ? b : a));
    expect(hand()).not.toContain(highest);
    expect(isYourTurn()).toBe(true);
    expect(screen.getByText(/↑ turn · 20s/)).toBeTruthy();
  });

  it("starts a fresh turn clock after you move, so the old one never plays your next turn", async () => {
    await openPage(PLAY_SEED);
    await click(screen.getByRole("button", { name: "Start Game" }));

    await advance(19_900);
    await discardFirstAndDraw();
    const afterMove = hand();

    await advance(19_800);
    expect(hand()).toEqual(afterMove);
    await advance(300);
    expect(hand()).not.toEqual(afterMove);
  });

  it("opens a Quick Draw window after you discard, then draws for you when it closes", async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ quickDraw: true }));
    await openPage(PLAY_SEED);
    await click(screen.getByRole("button", { name: "Start Game" }));

    await discardFirstAndDraw();
    expect(screen.getByText("Quick-draw window — bot may steal…")).toBeTruthy();
    expect(screen.getByRole("timer").textContent).toBe("2.0s");
    expect(hand()).toHaveLength(4);

    await advance(2000);
    expect(screen.queryByText("Quick-draw window — bot may steal…")).toBeNull();
    expect(hand()).toHaveLength(5);

    // The bot then discards, and its fresh discard is yours to steal.
    expect(screen.getByText("Steal the discard? Click the highlighted card!")).toBeTruthy();
    await click(screen.getByRole("button", { name: "Steal discarded cards" }));
    expect(hand().length).toBeGreaterThan(5);
    expect(screen.getByText("Stolen!")).toBeTruthy();
    expect(isYourTurn()).toBe(true);
  });
});
