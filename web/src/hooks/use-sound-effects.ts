import { useCallback, useRef } from "react";
import { SFX_CONFIG, type SfxEvent, type UiPreferences } from "@/lib/sfx";

type PlayOptions = {
  fromInteraction?: boolean;
};

type UseSoundEffectsOptions = {
  preferences: UiPreferences;
  onToggleSound: () => void;
  onSetSoundEnabled: (enabled: boolean) => void;
  onRegisterInteraction: () => void;
};

export function useSoundEffects({
  preferences,
  onToggleSound,
  onSetSoundEnabled,
  onRegisterInteraction,
}: UseSoundEffectsOptions) {
  const playersRef = useRef<Partial<Record<SfxEvent, HTMLAudioElement>>>({});
  const lastPlayedAtRef = useRef<Partial<Record<SfxEvent, number>>>({});
  const activePlayerRef = useRef<HTMLAudioElement | null>(null);

  const getOrCreatePlayer = useCallback((event: SfxEvent) => {
    const existing = playersRef.current[event];
    if (existing) {
      return existing;
    }

    if (typeof Audio === "undefined") {
      return null;
    }

    const player = new Audio(SFX_CONFIG[event].src);
    player.preload = "auto";
    player.volume = SFX_CONFIG[event].volume;
    playersRef.current[event] = player;
    return player;
  }, []);

  const stopAll = useCallback(() => {
    for (const event of Object.keys(playersRef.current) as SfxEvent[]) {
      const player = playersRef.current[event];
      if (!player) continue;
      player.pause();
      player.currentTime = 0;
    }
    activePlayerRef.current = null;
  }, []);

  const play = useCallback(
    async (event: SfxEvent, options: PlayOptions = {}): Promise<boolean> => {
      const interactionTriggered = options.fromInteraction === true;

      if (interactionTriggered) {
        onRegisterInteraction();
      }

      const canPlay = preferences.soundEnabled && (preferences.hasInteracted || interactionTriggered);
      if (!canPlay) {
        return false;
      }

      const config = SFX_CONFIG[event];
      const now = Date.now();
      const lastPlayedAt = lastPlayedAtRef.current[event] ?? 0;
      if (now - lastPlayedAt < config.cooldownMs) {
        return false;
      }

      const player = getOrCreatePlayer(event);
      if (!player) {
        return false;
      }

      if (
        event === "tap" &&
        activePlayerRef.current &&
        !activePlayerRef.current.paused
      ) {
        return false;
      }

      if (event !== "tap" && activePlayerRef.current && activePlayerRef.current !== player) {
        activePlayerRef.current.pause();
        activePlayerRef.current.currentTime = 0;
      }

      player.volume = config.volume;
      player.currentTime = 0;
      activePlayerRef.current = player;

      try {
        await player.play();
        lastPlayedAtRef.current[event] = now;
        return true;
      } catch {
        return false;
      }
    },
    [getOrCreatePlayer, onRegisterInteraction, preferences.hasInteracted, preferences.soundEnabled],
  );

  const toggleSound = useCallback(() => {
    onToggleSound();
    if (preferences.soundEnabled) {
      stopAll();
    }
  }, [onToggleSound, preferences.soundEnabled, stopAll]);

  const setSoundEnabled = useCallback(
    (enabled: boolean) => {
      onSetSoundEnabled(enabled);
      if (!enabled) {
        stopAll();
      }
    },
    [onSetSoundEnabled, stopAll],
  );

  return {
    soundEnabled: preferences.soundEnabled,
    hasInteracted: preferences.hasInteracted,
    play,
    toggleSound,
    setSoundEnabled,
    stopAll,
  };
}
