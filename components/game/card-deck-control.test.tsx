// @vitest-environment jsdom
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString, renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CARD_DECK_STORAGE_KEY } from "@/lib/card-deck-preferences";

import { CardDeckControl, useCardDeck } from "./card-deck-control";

/**
 * Regression guards for the Card Colors toggle.
 *
 * GAM-87: the toggle showed "Two-color" selected even when "four-color" was the
 * saved preference. The first fix silenced the hydration *warning* but GAM-94
 * found the user-facing symptom survived: after a reload with `four-color`
 * persisted, the rendered toggle still highlighted "Two-color" — `aria-pressed`
 * lied about the active deck (the very thing colour-blind users rely on).
 *
 * The bug only reproduces on the *hydration* path (`hydrateRoot` over
 * server-rendered HTML), not a fresh client `render()`, so the GAM-94 test
 * below hydrates real SSR markup — exactly what a browser reload does.
 *
 * Two things must hold:
 *  1. The hydration baseline (server + client first paint) is "two-color", so
 *     there is no hydration mismatch.
 *  2. After hydration settles, the *displayed selected control* reflects the
 *     persisted deck — Four-color shows aria-pressed="true" on reload.
 */
function Harness() {
  const [deck] = useCardDeck();
  return <CardDeckControl value={deck} onChange={() => {}} />;
}

function deckSelectedInMarkup(html: string): "two-color" | "four-color" | null {
  // Each button carries aria-pressed plus its label text; find the pressed one.
  const buttons = html.split("<button").slice(1);
  for (const button of buttons) {
    if (!button.includes('aria-pressed="true"')) continue;
    if (button.includes("Four-color")) return "four-color";
    if (button.includes("Two-color")) return "two-color";
  }
  return null;
}

function pressedDeckIn(container: HTMLElement): "two-color" | "four-color" | null {
  const pressed = Array.from(
    container.querySelectorAll('button[aria-pressed="true"]'),
  )[0];
  if (!pressed) return null;
  if (pressed.textContent?.includes("Four-color")) return "four-color";
  if (pressed.textContent?.includes("Two-color")) return "two-color";
  return null;
}

describe("useCardDeck hydration baseline (GAM-87)", () => {
  it("renders the two-color fallback in the initial (hydration) render", () => {
    // renderToStaticMarkup captures exactly the initial render (effects do not
    // run) — i.e. the hydration baseline that must match the server HTML.
    const html = renderToStaticMarkup(<Harness />);
    expect(deckSelectedInMarkup(html)).toBe("two-color");
  });
});

describe("useCardDeck post-hydration adoption (GAM-94)", () => {
  let container: HTMLElement;
  let root: { unmount: () => void } | null = null;

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container.remove();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-card-deck");
  });

  async function hydrate() {
    // Server HTML always uses the two-color fallback (getServerSnapshot /
    // initial state), matching what Next.js ships. The browser then hydrates
    // with localStorage already populated — the exact reload scenario.
    container.innerHTML = renderToString(<Harness />);
    await act(async () => {
      root = hydrateRoot(container, <Harness />);
    });
  }

  it("flips the displayed toggle to Four-color after hydration when four-color is persisted", async () => {
    window.localStorage.setItem(CARD_DECK_STORAGE_KEY, "four-color");

    await hydrate();

    // The exact assertion the console-warning-only test missed: the displayed
    // selected control must reflect the persisted deck after a reload.
    expect(pressedDeckIn(container)).toBe("four-color");
    // And it drives the document dataset that the cards read from.
    expect(document.documentElement.dataset.cardDeck).toBe("four-color");
  });

  it("keeps Two-color selected after hydration when nothing is persisted", async () => {
    await hydrate();

    expect(pressedDeckIn(container)).toBe("two-color");
  });
});
