import { motion } from "motion/react";
import { Volume2, VolumeX } from "lucide-react";
import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import type { MotionPolicy } from "@/hooks/use-motion-policy";
import type { AppMode } from "@/features/shared/types";

type AppShellProps = {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  soundEnabled: boolean;
  onSoundToggle: () => void;
  configError: string | null;
  motionPolicy: MotionPolicy;
  showUtilityLogo: boolean;
  utilityLogoSrc: string;
  children: ReactNode;
};

export function AppShell({
  mode,
  onModeChange,
  soundEnabled,
  onSoundToggle,
  configError,
  motionPolicy,
  showUtilityLogo,
  utilityLogoSrc,
  children,
}: AppShellProps) {
  return (
    <main
      className="mx-auto w-full max-w-6xl space-y-4 px-4 pb-8 pt-5 text-[color:var(--ink)] md:px-6"
      data-motion-policy={motionPolicy}
      data-sound-enabled={soundEnabled ? "true" : "false"}
    >
      <motion.div
        initial={motionPolicy === "full" ? { opacity: 0, y: 8 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: motionPolicy === "full" ? 0.26 : 0.01 }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex min-h-11 items-center">
          {showUtilityLogo ? (
            <img src={utilityLogoSrc} alt="VocabPal" className="h-auto w-[200px] max-w-full" />
          ) : null}
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-[color:var(--ink)]">Sound</span>
            <div className="flex items-center gap-2">
              {soundEnabled ? (
                <Volume2 className="h-4 w-4 text-[color:var(--brand-700)]" />
              ) : (
                <VolumeX className="h-4 w-4 text-[color:var(--ink)]" />
              )}
              <Switch checked={soundEnabled} onCheckedChange={onSoundToggle} />
            </div>
          </div>

          <Tabs
            value={mode}
            onValueChange={(nextMode) => onModeChange(nextMode as AppMode)}
            className="space-y-0"
          >
            <TabsList className="border-none bg-transparent p-0 shadow-none">
              <TabsTrigger value="student">Student</TabsTrigger>
              <TabsTrigger value="teacher">Teacher</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </motion.div>

      {configError && <Alert variant="destructive">{configError}</Alert>}

      {children}
    </main>
  );
}
