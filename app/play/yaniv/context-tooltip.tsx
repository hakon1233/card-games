"use client";

import { useEffect, useId, useRef, useState } from "react";

// ── ContextTooltip ────────────────────────────────────────────────────────
// Progressive-disclosure teaching tooltip (GAM-60). Rules surface in context —
// on hover or keyboard focus (desktop) and on long-press (touch) — instead of a
// blocking upfront tutorial. Wraps any element; the tooltip is announced to
// assistive tech via role="tooltip" + aria-describedby.
export function ContextTooltip({
  text,
  children,
  className = "",
}: {
  text: string;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    longPressTimerRef.current = null;
    hideTimerRef.current = null;
  }

  function show() {
    clearTimers();
    setVisible(true);
  }

  function hideSoon() {
    clearTimers();
    hideTimerRef.current = setTimeout(() => setVisible(false), 120);
  }

  // Touch: a deliberate long-press (≈450ms) reveals the tooltip without
  // triggering the wrapped control's tap action prematurely.
  function startLongPress(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    clearTimers();
    longPressTimerRef.current = setTimeout(() => setVisible(true), 450);
  }

  function endLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (visible) {
      hideTimerRef.current = setTimeout(() => setVisible(false), 1400);
    }
  }

  useEffect(() => clearTimers, []);

  return (
    <div
      className={`relative inline-flex min-w-0 ${className}`}
      aria-describedby={visible ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={hideSoon}
      onFocus={show}
      onBlur={hideSoon}
      onPointerDown={startLongPress}
      onPointerUp={endLongPress}
      onPointerCancel={endLongPress}
    >
      {children}
      {visible && (
        <div
          id={id}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[min(16rem,80vw)] -translate-x-1/2 rounded-md border border-white/15 bg-popover px-2.5 py-1.5 text-center text-[11px] font-medium leading-snug text-popover-foreground shadow-xl"
        >
          {text}
        </div>
      )}
    </div>
  );
}
