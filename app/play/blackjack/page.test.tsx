// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, string>)} />;
  },
}));

import BlackjackPage from "./page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Blackjack page", () => {
  it("settles a natural on the deal: the player wins without hitting", () => {
    // With the shuffle's random source pinned to 0.001 the deal is
    // player A♥ Q♠ (a natural) against dealer K♠ J♠ (20).
    vi.spyOn(Math, "random").mockReturnValue(0.001);
    render(<BlackjackPage />);

    fireEvent.click(screen.getByRole("button", { name: "Deal" }));

    expect(screen.getByRole("status").textContent).toBe("Blackjack — you win!");
    expect(screen.getByRole("button", { name: "Hit" })).toHaveProperty("disabled", true);
  });
});
