# Yaniv bugs

## GAM-76 — late-discard timer race

- Status: resolved
- Classification: TIMING_RACE
- Reproducer: `app/play/yaniv/turn-clock-race.test.ts`
- Root cause: a stale interval callback could run after synchronous turn advancement but before React cleaned up the old effect.
- Fix: invalidate the active timer generation synchronously in `dispatch`; stale callbacks clear themselves before setting state or auto-playing.
