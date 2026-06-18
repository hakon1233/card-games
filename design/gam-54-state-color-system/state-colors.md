# State Color System — GAM-54

**Color is information, not decoration.** This is the foundation of the Yaniv
"readable feedback machine" (GAM-41 north star). Every hue below answers exactly
one game question. These signal hues are **reserved**: they may never be used to
make something look nice. The moment a player sees one, it *means something*.

Conforms to **Court & Tin** (GAM-39, locked). Tokens live in
`app/globals.css` `:root` and are consumed everywhere — never hard-code these
values in a component.

---

## The channels

| Channel | Question it answers | Token | Hue | Where it appears |
|---|---|---|---|---|
| **TURN** | *Whose turn is it?* | `--state-turn` | Gold `#C9A24B` | Active seat ring/pulse, "— your turn", active player name |
| **SELECTION** | *What have I picked up?* | `--state-select` | Cream `#F7F0DD` | Lifted/glowing selected discard cards |
| **LEGAL** | *Is this move allowed?* | `--state-legal` | Jade `#36B37E` | Valid-discard summary border/tick, "within threshold" readout |
| **WARN** | *Am I running low on time?* | `--state-warn` | Amber `#E8A53C` | Turn-timer middle band, "over threshold" caution readout |
| **ALERT** | *That is not allowed / time's up* | `--state-alert` | Vermilion `#E0533B` | Illegal-selection border, illegal-action feedback, timer final band |
| **IDLE** | *(no signal)* inactive / out | `--state-idle` | `--muted-foreground` | Dimmed inactive seats, eliminated players |

Glow helpers: `--state-turn-glow`, `--state-select-glow` (pre-mixed translucent
versions for box-shadows).

### Why these assignments

- **Gold = turn.** The spotlight metaphor: the active seat is *lit*. Gold reads
  warm and unmistakable on the dark baize (`--pip-table` `#1E1512`) and is
  Court & Tin native.
- **Cream = selection.** Selection is **orthogonal to legality** — it says only
  "you are holding this," nothing about whether the move is valid. So it must be
  a *neutral* lift (the felt's own light raising the card), never red or gold,
  so it can't be mistaken for turn or legality. Legality is then layered *on top*
  of selection via the summary border (jade ↔ vermilion).
- **Jade = legal, Vermilion = illegal.** Green/red is the universal go/stop pair,
  instantly readable. Both are kept as **thin accents** (borders, ticks, text) —
  never large fills — so they harmonize with the warm table instead of fighting
  it. Vermilion is deliberately **brighter and more orange than brand tin-red**
  (`--primary` `#7A1F1B`) so "you can't do that" never blends into brand chrome.
- **Amber = warn**, the calm middle of the time-pressure ramp.
- **Idle has no hue.** Being eliminated is not an *error* — it must read as
  "switched off" (neutral + strikethrough), never as illegal-red.

### The time-pressure ramp (the one sanctioned hue sequence)

The turn timer is the only place hues hand off to one another, and it is
meaningful — a single channel (time pressure) escalating:

```
TURN (gold, calm)  →  WARN (amber, hurry)  →  ALERT (vermilion, now)
   t > 50%                t ≤ 50%                  t ≤ 25%
```

This is not decorative reuse: each colour still means exactly what its row says.

---

## The reuse ban (enforceable rules)

A signal hue used decoratively destroys the system — it teaches the player to
ignore it. These are the standing rules; reviewers and the referencing issues
must hold them:

1. **`--state-*` hues are signal-only.** Never use gold-glow, cream-glow, jade,
   amber, or vermilion to "add some colour." If it isn't answering one of the
   six questions above, it must come from the **brand chrome** palette instead
   (`--primary` tin-red, `--pip-gold` as a *static* rail/hairline, cream, ink).
2. **Gold glow/ring/pulse = turn only.** The static gold table *rail*
   (`.pip-table-rail`) is structural material, not a signal — that is the single
   permitted non-turn gold, and it never animates.
3. **Vermilion (`--state-alert`) ≠ eliminated.** Out-of-game players use
   `--state-idle` (neutral + strikethrough). Red is for *illegal*, not *out*.
4. **Amber is warn-only.** It may not be a button colour or a highlight ring.
5. **Brand `--primary` (tin-red) is identity, not a state.** Use it for brand
   buttons and chrome. It is *not* the legal/selection/turn signal anymore — the
   old overload (turn = selection = legal = `--primary`) is what this issue fixes.

---

## Migration notes for the referencing issues

These are the known decorative-reuse sites to clean up. Each is owned by the
listed issue — this spec defines the target; those issues do the wiring.

| Site (in `app/play/yaniv/page.tsx`) | Today | Target | Owner |
|---|---|---|---|
| Active-seat pulse (`seat-glow-pulse`) | `--primary` red | ✅ now `--state-turn` (done here) | GAM-44 turn |
| Selected-card glow (`.card-selected-glow`) | `--primary` red | ✅ now `--state-select` (done here) | GAM-45 select |
| Turn-timer ring ramp (`timerColor`) | `--primary` → `rgb(245 158 11)` → `rgb(239 68 68)` | `--state-turn` → `--state-warn` → `--state-alert` | GAM-44 turn |
| Selection-summary legality border | `primary` ↔ `destructive` | `--state-legal` ↔ `--state-alert` | GAM-45 select |
| Hand readout within/over threshold | `emerald-300` / `amber-300` | `--state-legal` / `--state-warn` | feedback issue |
| Draw-pile highlight (`ring-amber-400`) | amber (decorative!) | brand `--pip-gold` static, or cream | GAM-46 piles |
| Yaniv/Assaf action buttons (`bg-amber-500`) | amber (decorative!) | brand `--primary` | feedback issue |
| Eliminated player (`text-destructive`) | red (wrong — "out" ≠ "illegal") | `--state-idle` + strikethrough | GAM-44 turn |

`--state-turn` and `--state-select` are already wired in `globals.css`; the rest
are component-level changes the owning issues pick up by referencing this spec.

---

## Quick reference (copy into components)

```css
/* whose turn      */ color: var(--state-turn);    /* gold     #C9A24B */
/* what I picked   */ color: var(--state-select);  /* cream    #F7F0DD */
/* legal move      */ color: var(--state-legal);   /* jade     #36B37E */
/* running low     */ color: var(--state-warn);    /* amber    #E8A53C */
/* illegal / time! */ color: var(--state-alert);   /* vermilion #E0533B */
/* inactive / out  */ color: var(--state-idle);    /* muted-foreground */
```
