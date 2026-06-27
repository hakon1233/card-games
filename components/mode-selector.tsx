"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Bot, Users, X } from "lucide-react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

interface ModeSelectorProps {
  open: boolean;
  onClose: () => void;
  gameSlug: string;
  gameName: string;
}

export function ModeSelector({
  open,
  onClose,
  gameSlug,
  gameName,
}: ModeSelectorProps) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusableElements = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements.at(-1);

      if (!firstFocusable || !lastFocusable) {
        e.preventDefault();
        panel.focus();
        return;
      }

      if (!panel.contains(document.activeElement)) {
        e.preventDefault();
        firstFocusable.focus();
        return;
      }

      if (e.shiftKey && document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable.focus();
        return;
      }

      if (!e.shiftKey && document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    firstFocusable?.focus();

    return () => {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  function handlePlayBot() {
    router.push(`/play/${gameSlug}`);
    onClose();
  }

  function handlePlayFriends() {
    router.push(
      `/auth/sign-in?next=${encodeURIComponent(`/play/${gameSlug}?mode=friends`)}`
    );
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mode-selector-title"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative z-10 w-full rounded-t-2xl bg-card p-6 shadow-xl sm:max-w-sm sm:rounded-2xl"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2
            id="mode-selector-title"
            className="text-lg font-semibold text-card-foreground"
          >
            Play {gameName}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <Button
            onClick={handlePlayBot}
            className="h-14 w-full justify-start gap-3 rounded-xl px-4 text-base"
          >
            <Bot className="size-5 shrink-0" />
            <div className="text-left">
              <div className="font-semibold leading-tight">Play vs Bot</div>
              <div className="text-xs font-normal opacity-70">
                No sign-in required
              </div>
            </div>
          </Button>
          <Button
            onClick={handlePlayFriends}
            variant="outline"
            className="h-14 w-full justify-start gap-3 rounded-xl px-4 text-base"
          >
            <Users className="size-5 shrink-0" />
            <div className="text-left">
              <div className="font-semibold leading-tight">Play with Friends</div>
              <div className="text-xs font-normal opacity-70">
                Sign in to invite friends
              </div>
            </div>
          </Button>
        </div>
      </div>
    </div>
  );
}
