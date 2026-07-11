/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Seat } from "@/lib/games/shell-types";

import { PlayerSeat } from "./player-seat";

const seat: Seat = {
  id: "you",
  name: "Manual order",
  isBot: false,
  isSelf: true,
  isActive: false,
  hand: [],
  score: { label: "Wins", value: 3 },
};

describe("PlayerSeat", () => {
  it("allows long names and score labels to wrap instead of truncating in narrow panels", () => {
    const { container } = render(<PlayerSeat seat={seat} gameType="blackjack" />);

    const header = screen.getByText("Manual order").parentElement;
    expect(header?.classList.contains("flex-wrap")).toBe(true);

    const nameClasses = screen.getByText("Manual order").classList;
    expect(nameClasses.contains("truncate")).toBe(false);
    expect(nameClasses.contains("max-w-[120px]")).toBe(false);

    const scoreClasses = screen.getByText("3").parentElement?.classList;
    expect(scoreClasses?.contains("ml-auto")).toBe(false);

    expect(container.textContent).toContain("Wins: 3");
  });
});
