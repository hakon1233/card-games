# Agent-reported bugs

## GAM-76 — Yaniv late-discard timer race

Resolved: the countdown interval is invalidated before `dispatch` advances the game, preventing an old expiry callback from affecting the next human turn.
