// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ModeSelector } from "./mode-selector";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

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
    const playWithFriends = screen.getByRole("button", {
      name: /Play with Friends/i,
    });

    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(document.activeElement).toBe(close);

    playWithFriends.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(playWithFriends);
  });
});
