import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AppShell } from "@/components/app-shell";
import { DesignSystemPage } from "@/features/design-system/design-system-page";
import { StudentMode } from "@/features/student/student-mode";
import { TeacherMode } from "@/features/teacher/teacher-mode";
import type { AppMode } from "@/features/shared/types";
import { useMotionPolicy } from "@/hooks/use-motion-policy";
import { useSoundEffects } from "@/hooks/use-sound-effects";
import { useUiPreferences } from "@/hooks/use-ui-preferences";
import { getClientConfigError } from "@/lib/env";

export type AppRoute = "app" | "designsystem";

function resolveRoute(pathname: string): AppRoute {
  return pathname === "/designsystem" || pathname === "/designsystem/"
    ? "designsystem"
    : "app";
}

function BaselineAssessmentApp() {
  const [mode, setMode] = useState<AppMode>("student");
  const configError = getClientConfigError();
  const motionPolicy = useMotionPolicy();

  const {
    preferences,
    setSoundEnabled,
    toggleSound,
    registerInteraction,
  } = useUiPreferences();

  const {
    soundEnabled,
    hasInteracted,
    play,
    toggleSound: toggleSoundWithSideEffects,
  } = useSoundEffects({
    preferences,
    onToggleSound: toggleSound,
    onSetSoundEnabled: setSoundEnabled,
    onRegisterInteraction: registerInteraction,
  });

  const welcomedModesRef = useRef<Set<AppMode>>(new Set());

  useEffect(() => {
    if (!soundEnabled || !hasInteracted) return;

    if (welcomedModesRef.current.has(mode)) {
      return;
    }

    welcomedModesRef.current.add(mode);
    void play("welcome");
  }, [hasInteracted, mode, play, soundEnabled]);

  const sectionTransition =
    motionPolicy === "full"
      ? {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          exit: { opacity: 0, y: -8 },
          transition: { duration: 0.18, ease: "easeOut" as const },
        }
      : {
          initial: { opacity: 1, y: 0 },
          animate: { opacity: 1, y: 0 },
          exit: { opacity: 1, y: 0 },
          transition: { duration: 0.01 },
        };

  return (
    <AppShell
      mode={mode}
      onModeChange={(nextMode) => {
        setMode(nextMode);
        void play("tap", { fromInteraction: true });
      }}
      soundEnabled={soundEnabled}
      onSoundToggle={() => {
        toggleSoundWithSideEffects();
        void play("tap", { fromInteraction: true });
      }}
      configError={configError}
      motionPolicy={motionPolicy}
    >
      <AnimatePresence mode="wait">
        <motion.section key={mode} {...sectionTransition}>
          {mode === "student" ? (
            <StudentMode motionPolicy={motionPolicy} playSound={play} />
          ) : (
            <TeacherMode motionPolicy={motionPolicy} playSound={play} />
          )}
        </motion.section>
      </AnimatePresence>
    </AppShell>
  );
}

function App() {
  const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
  const route = resolveRoute(pathname);

  if (route === "designsystem") {
    return <DesignSystemPage />;
  }

  return <BaselineAssessmentApp />;
}

export default App;
