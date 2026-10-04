// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModeSelector } from "./mode-selector";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

afterEach(cleanup);

describe("ModeSelector", () => {
  it("moves focus into the open dialog and traps keyboard tabbing", async () => {
    const onClose = vi.fn();

    function TestHost() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Background game tile</button>
          <ModeSelector
            open={open}
            onClose={() => {
              onClose();
              setOpen(false);
            }}
            gameSlug="yaniv"
            gameName="Yaniv"
          />
        </>
      );
    }

    render(<TestHost />);

    const trigger = screen.getByRole("button", { name: "Background game tile" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Play Yaniv" });
    const close = screen.getByRole("button", { name: "Close" });
    const playVsBot = screen.getByRole("button", { name: /Play vs Bot/i });

    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(document.activeElement).toBe(close);

    playVsBot.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(playVsBot);
  });

  it("offers only bot play until a multiplayer table exists", () => {
    render(<ModeSelector open onClose={() => {}} gameSlug="go-fish" gameName="Go Fish" />);

    fireEvent.click(screen.getByRole("button", { name: /Play vs Bot/i }));

    expect(screen.queryByRole("button", { name: /Play with Friends/i })).toBeNull();
    expect(push).toHaveBeenCalledWith("/play/go-fish");
  });
});
