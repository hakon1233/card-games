import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for the "white-on-white card" bug class (GAM-41 / GAM-42,
 * GAM-55; original incident fixed in commit bef07af).
 *
 * Root cause: the suit-colour custom properties (`--pip-suit-*`) lived in a
 * SECOND top-level `:root { ... }` block. Tailwind v4 / Lightning CSS merges
 * duplicate top-level `:root` selectors and, under Turbopack incremental dev
 * compilation, dropped that duplicate block AND the `.pip-suit-*` rules that
 * followed it — so `color: var(--pip-suit-red)` resolved to nothing and rank
 * text fell back to the cream foreground on a white card face. Invisible.
 * The production build was unaffected, so it silently corrupted every dev /
 * live-QA pass instead of failing a gate.
 *
 * This guard asserts the structural invariants that make that bug impossible,
 * with no browser required:
 *   1. There is exactly ONE top-level `:root { }` block (no duplicate for the
 *      Lightning CSS merge pass to drop).
 *   2. Every suit-colour token is defined inside that single `:root`.
 *   3. Every `var(--pip-suit-*)` referenced by a `.pip-suit-*` rule resolves
 *      to a defined token (no dangling reference → no colour-less rank text).
 */

const cssPath = join(dirname(fileURLToPath(import.meta.url)), "globals.css");
const css = readFileSync(cssPath, "utf8");

/** Match top-level (column-0) `:root {` declarations only — not `.dark`, not nested. */
const topLevelRootBlocks = css.match(/^:root\s*\{/gm) ?? [];

/** Extract the body of the first top-level `:root { ... }` block via brace matching. */
function firstRootBody(source: string): string {
  const open = source.search(/^:root\s*\{/m);
  if (open === -1) return "";
  const braceStart = source.indexOf("{", open);
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(braceStart + 1, i);
    }
  }
  return "";
}

describe("globals.css — suit-colour cascade invariants (white-on-white guard)", () => {
  it("declares exactly one top-level :root block", () => {
    // A second top-level `:root` is the exact shape Lightning CSS drops in dev.
    expect(topLevelRootBlocks.length).toBe(1);
  });

  const SUIT_TOKENS = [
    "--pip-suit-red",
    "--pip-suit-black",
    "--pip-suit-blue",
    "--pip-suit-green",
  ];

  it("defines every --pip-suit-* token inside the single :root block", () => {
    const rootBody = firstRootBody(css);
    for (const token of SUIT_TOKENS) {
      expect(rootBody, `${token} must be defined inside the primary :root`).toContain(
        `${token}:`,
      );
    }
  });

  it("has no dangling var(--pip-suit-*) reference", () => {
    // Every suit hue consumed by a `.pip-suit-*` rule must resolve to a token
    // that is actually defined — otherwise rank/suit text renders colour-less.
    const referenced = new Set(
      [...css.matchAll(/var\((--pip-suit-[a-z]+)\)/g)].map((m) => m[1]),
    );
    const defined = new Set(
      [...css.matchAll(/(--pip-suit-[a-z]+)\s*:/g)].map((m) => m[1]),
    );
    for (const ref of referenced) {
      expect(defined.has(ref), `var(${ref}) is referenced but never defined`).toBe(true);
    }
    // Sanity: the four-colour deck actually consumes the channels.
    expect(referenced.size).toBeGreaterThanOrEqual(3);
  });
});
