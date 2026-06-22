import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { CARD_DECK_STORAGE_KEY } from "@/lib/card-deck-preferences";

import { CardDeckControl, useCardDeck } from "./card-deck-control";

/**
 * Regression guard for GAM-87: the Settings "Card Colors" toggle showed
 * "Two-color" selected even when "four-color" was the saved preference, because
 * `useCardDeck` read localStorage inside the `useState` initializer. During SSR
 * (no `window`) that returns the "two-color" fallback, while the client
 * initializer returned the stored value — a hydration mismatch that froze the
 * control on the SSR default until the first state change.
 *
 * The fix initialises to the fallback and syncs the persisted value in a
 * post-mount effect. `renderToStaticMarkup` captures exactly the initial render
 * (effects do not run), i.e. the hydration baseline that must match the server.
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

describe("useCardDeck hydration baseline (GAM-87)", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("renders the two-color fallback on the server (no window)", () => {
    const html = renderToStaticMarkup(<Harness />);
    expect(deckSelectedInMarkup(html)).toBe("two-color");
  });

  it("renders the two-color fallback on the client's first paint even when four-color is stored", () => {
    // Simulate the browser: window + localStorage holding the persisted choice.
    // The initial render must still match the server ("two-color"); the stored
    // value is only adopted after mount, so there is no hydration mismatch.
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (key: string) =>
          key === CARD_DECK_STORAGE_KEY ? "four-color" : null,
      },
    };

    const html = renderToStaticMarkup(<Harness />);
    expect(deckSelectedInMarkup(html)).toBe("two-color");
  });
});
