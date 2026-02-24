import welcomeSfx from "@/assets/sfx/8_bit_chime_quick.wav";
import endSfx from "@/assets/sfx/8_bit_positive_long.wav";
import submitSfx from "@/assets/sfx/pop_2.wav";
import tapSfx from "@/assets/sfx/select_2.wav";
import progressSfx from "@/assets/sfx/select_4.wav";

export type SfxEvent = "welcome" | "tap" | "submit" | "progress" | "end" | "error";
export type UiPreferences = {
  soundEnabled: boolean;
  hasInteracted: boolean;
};

export const UI_PREFERENCES_STORAGE_KEY = "vocabpal.ui.preferences";

export const SFX_CONFIG: Record<
  SfxEvent,
  { src: string; volume: number; cooldownMs: number }
> = {
  welcome: { src: welcomeSfx, volume: 0.35, cooldownMs: 1200 },
  tap: { src: tapSfx, volume: 0.22, cooldownMs: 120 },
  submit: { src: submitSfx, volume: 0.3, cooldownMs: 220 },
  progress: { src: progressSfx, volume: 0.28, cooldownMs: 350 },
  end: { src: endSfx, volume: 0.45, cooldownMs: 1400 },
  error: { src: progressSfx, volume: 0.2, cooldownMs: 500 },
};
