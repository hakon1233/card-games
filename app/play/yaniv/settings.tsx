"use client";

// Your Yaniv table settings: the settings screen, and keeping them in localStorage between visits.

import { useCallback, useEffect, useState } from "react";
import { BrandHeader } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { AnimationPreferencesControl } from "@/components/game/animation-preferences-control";
import { CardDeckControl } from "@/components/game/card-deck-control";
import type { AnimationSpeed } from "@/lib/animation-preferences";
import type { CardDeck } from "@/lib/card-deck-preferences";
import { DEFAULT_YANIV_SETTINGS, type YanivSettings } from "@/lib/games/yaniv";

const SETTINGS_KEY = "yaniv-settings";

export type YanivLocalSettings = YanivSettings & {
  numBots: number;
  lowTimeSound: boolean;
  idlePulses: boolean;
  nextUpPreview: boolean;
};

const DEFAULT_LOCAL_SETTINGS: YanivLocalSettings = {
  ...DEFAULT_YANIV_SETTINGS,
  numBots: 1,
  lowTimeSound: false,
  idlePulses: true,
  nextUpPreview: true,
};

function loadSettings(): YanivLocalSettings {
  if (typeof window === "undefined") return DEFAULT_LOCAL_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_LOCAL_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return DEFAULT_LOCAL_SETTINGS;
}

function saveSettings(s: YanivLocalSettings) {
  try {
    const { yanivThreshold, scoreLimit, quickDraw, numBots, lowTimeSound, idlePulses, nextUpPreview } = s;
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ yanivThreshold, scoreLimit, quickDraw, numBots, lowTimeSound, idlePulses, nextUpPreview }),
    );
  } catch {
    // ignore
  }
}

/** Your settings, loaded once after the first render; save() keeps them for next time. */
export function useYanivSettings() {
  const [settings, setSettings] = useState(DEFAULT_LOCAL_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = loadSettings();
    queueMicrotask(() => {
      setSettings(saved);
      setLoaded(true);
    });
  }, []);

  const change = useCallback(
    (patch: Partial<YanivLocalSettings>) => setSettings((current) => ({ ...current, ...patch })),
    [],
  );
  const save = useCallback(() => saveSettings(settings), [settings]);

  return { settings, loaded, change, save };
}

export function YanivSettingsScreen({
  settings,
  onChange,
  canStart,
  onStart,
  animationSpeed,
  onAnimationSpeedChange,
  cardDeck,
  onCardDeckChange,
}: {
  settings: YanivLocalSettings;
  onChange: (patch: Partial<YanivLocalSettings>) => void;
  canStart: boolean;
  onStart: () => void;
  animationSpeed: AnimationSpeed;
  onAnimationSpeedChange: (speed: AnimationSpeed) => void;
  cardDeck: CardDeck;
  onCardDeckChange: (deck: CardDeck) => void;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <BrandHeader title="Yaniv" backLabel="Back" />
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm flex flex-col gap-6 rounded-lg border border-border bg-card/70 p-5 shadow-sm">
          <div className="text-center">
            <p className="pip-eyebrow text-xs">Yaniv table</p>
            <h2 className="mt-2 font-heading text-2xl font-bold text-foreground">Game Settings</h2>
          </div>

          <SettingRow label="Number of Bots">
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => onChange({ numBots: n })}
                  className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${
                    settings.numBots === n
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </SettingRow>

          <SettingRow label="Yaniv Call Threshold">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 13 }, (_, i) => i + 3).map((n) => (
                <button
                  key={n}
                  onClick={() => onChange({ yanivThreshold: n })}
                  className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${
                    settings.yanivThreshold === n
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-muted-foreground text-xs mt-1">Maximum hand total to call Yaniv</p>
          </SettingRow>

          <SettingRow label="Elimination Score">
            <div className="flex gap-2">
              {[100, 150, 200, 300].map((n) => (
                <button
                  key={n}
                  onClick={() => onChange({ scoreLimit: n })}
                  className={`px-3 h-9 rounded-lg text-sm font-semibold transition-colors ${
                    settings.scoreLimit === n
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-muted-foreground text-xs mt-1">Score at which a player is eliminated</p>
          </SettingRow>

          <SettingRow label="Quick Draw">
            <ToggleSwitch label="Quick Draw" checked={settings.quickDraw} onChange={(quickDraw) => onChange({ quickDraw })} />
            <p className="text-muted-foreground text-xs mt-1">2-second window to pick up discarded cards</p>
          </SettingRow>

          <SettingRow label="Animation Speed">
            <AnimationPreferencesControl
              value={animationSpeed}
              onChange={onAnimationSpeedChange}
            />
            <p className="text-muted-foreground text-xs mt-1">
              Fast play shortens table motion; reduced minimizes movement.
            </p>
          </SettingRow>

          <SettingRow label="Card Colors">
            <CardDeckControl value={cardDeck} onChange={onCardDeckChange} />
            <p className="text-muted-foreground text-xs mt-1">
              Four-color gives each suit its own color, so suits stay easy to tell
              apart for colorblind players. Suit symbols always show too.
            </p>
          </SettingRow>

          <div className="grid grid-cols-2 gap-3">
            <SettingRow label="Low-Time Sound">
              <ToggleSwitch label="Low-Time Sound" checked={settings.lowTimeSound} onChange={(lowTimeSound) => onChange({ lowTimeSound })} />
            </SettingRow>

            <SettingRow label="Idle Pulses">
              <ToggleSwitch label="Idle Pulses" checked={settings.idlePulses} onChange={(idlePulses) => onChange({ idlePulses })} />
            </SettingRow>

            <SettingRow label="Next-Up Preview">
              <ToggleSwitch label="Next-Up Preview" checked={settings.nextUpPreview} onChange={(nextUpPreview) => onChange({ nextUpPreview })} />
            </SettingRow>
          </div>

          <Button
            onClick={onStart}
            disabled={!canStart}
            size="lg"
            className="w-full h-12 text-base font-bold mt-2"
          >
            Start Game
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── SettingRow ────────────────────────────────────────────────────────────

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-foreground text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

// ── ToggleSwitch ──────────────────────────────────────────────────────────
// On/off switch with an accessible name. The `label` is applied as
// `aria-label` so screen readers announce e.g. "Quick Draw, switch, on"
// instead of a bare "switch" (WCAG 2.1 SC 4.1.2).

function ToggleSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? "bg-primary" : "bg-input"
      }`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
