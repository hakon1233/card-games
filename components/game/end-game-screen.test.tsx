/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EndGameScreen } from "./end-game-screen";

const noop = () => {};

describe("EndGameScreen", () => {
  afterEach(cleanup);

  it("renders session stats alongside final standings (GAM-226 regression)", () => {
    // Yaniv/Go Fish pass BOTH standings and sessionRows. The session stats
    // must not be swallowed by the presence of standings.
    render(
      <EndGameScreen
        headline="Game Complete"
        winnerName="Bot 1"
        standings={[
          { rank: 1, name: "Bot 1", score: 12, isWinner: true },
          { rank: 2, name: "You", score: 47 },
        ]}
        sessionRows={[
          { label: "Rounds Won", value: 3 },
          { label: "Rounds Lost", value: 5 },
        ]}
        onPlayAgain={noop}
        onChangeGame={noop}
      />,
    );

    // Final Standings still renders.
    expect(screen.getByText("Final Standings")).toBeTruthy();
    // Session stats now render too — previously dead code.
    expect(screen.getByText("Session")).toBeTruthy();
    expect(screen.getByText("Rounds Won")).toBeTruthy();
    expect(screen.getByText("Rounds Lost")).toBeTruthy();
  });

  it("renders session stats when no standings are provided (blackjack/crazy-eights)", () => {
    render(
      <EndGameScreen
        headline="You Win!"
        sessionRows={[
          { label: "Wins", value: 2 },
          { label: "Losses", value: 1 },
        ]}
        onPlayAgain={noop}
        onChangeGame={noop}
      />,
    );

    expect(screen.queryByText("Final Standings")).toBeNull();
    expect(screen.getByText("Session")).toBeTruthy();
    expect(screen.getByText("Wins")).toBeTruthy();
    expect(screen.getByText("Losses")).toBeTruthy();
  });
});
