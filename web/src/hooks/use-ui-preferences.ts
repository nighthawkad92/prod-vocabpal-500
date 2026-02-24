import { useCallback, useEffect, useState } from "react";
import { type UiPreferences, UI_PREFERENCES_STORAGE_KEY } from "@/lib/sfx";

const DEFAULT_PREFERENCES: UiPreferences = {
  soundEnabled: true,
  hasInteracted: false,
};

function readStoredPreferences(): UiPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_PREFERENCES;
  }

  try {
    const raw = window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PREFERENCES;
    }
    const parsed = JSON.parse(raw) as Partial<UiPreferences>;
    return {
      soundEnabled:
        typeof parsed.soundEnabled === "boolean"
          ? parsed.soundEnabled
          : DEFAULT_PREFERENCES.soundEnabled,
      hasInteracted:
        typeof parsed.hasInteracted === "boolean"
          ? parsed.hasInteracted
          : DEFAULT_PREFERENCES.hasInteracted,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function useUiPreferences() {
  const [preferences, setPreferences] = useState<UiPreferences>(() =>
    readStoredPreferences(),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      UI_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  }, [preferences]);

  useEffect(() => {
    if (typeof window === "undefined" || preferences.hasInteracted) {
      return;
    }

    const markInteracted = () => {
      setPreferences((current) => ({ ...current, hasInteracted: true }));
    };

    window.addEventListener("pointerdown", markInteracted, { once: true });
    window.addEventListener("keydown", markInteracted, { once: true });

    return () => {
      window.removeEventListener("pointerdown", markInteracted);
      window.removeEventListener("keydown", markInteracted);
    };
  }, [preferences.hasInteracted]);

  const setSoundEnabled = useCallback((enabled: boolean) => {
    setPreferences((current) => ({ ...current, soundEnabled: enabled }));
  }, []);

  const toggleSound = useCallback(() => {
    setPreferences((current) => ({
      ...current,
      soundEnabled: !current.soundEnabled,
      hasInteracted: true,
    }));
  }, []);

  const registerInteraction = useCallback(() => {
    setPreferences((current) =>
      current.hasInteracted
        ? current
        : {
            ...current,
            hasInteracted: true,
          },
    );
  }, []);

  return {
    preferences,
    setSoundEnabled,
    toggleSound,
    registerInteraction,
  };
}
