import { motion } from "motion/react";
import { Volume2, VolumeX } from "lucide-react";
import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  children: ReactNode;
};

export function AppShell({
  mode,
  onModeChange,
  soundEnabled,
  onSoundToggle,
  configError,
  motionPolicy,
  children,
}: AppShellProps) {
  return (
    <main
      className="mx-auto w-full max-w-6xl space-y-4 px-4 pb-8 pt-5 text-[color:var(--ink)] md:px-6"
      data-motion-policy={motionPolicy}
      data-sound-enabled={soundEnabled ? "true" : "false"}
    >
      <Card className="relative overflow-hidden border-[#c7d7e4] bg-[linear-gradient(130deg,#fffef7_0%,#f6faff_52%,#fff8e8_100%)]">
        <div className="pointer-events-none absolute -left-20 -top-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(22,131,159,0.18)_0%,rgba(22,131,159,0)_70%)]" />
        <div className="pointer-events-none absolute -right-16 -bottom-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(238,181,63,0.22)_0%,rgba(238,181,63,0)_70%)]" />

        <motion.div
          initial={motionPolicy === "full" ? { opacity: 0, y: 8 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: motionPolicy === "full" ? 0.26 : 0.01 }}
          className="relative"
        >
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--brand-700)]">
                  VocabPal Prototype
                </p>
                <CardTitle className="max-w-3xl text-[clamp(2.2rem,4.4vw,4rem)] leading-[1.05]">
                  Baseline Assessment Console
                </CardTitle>
                <CardDescription className="max-w-2xl text-base text-[color:var(--muted)]">
                  Student and teacher workflows for the 500-student Ahmedabad pilot.
                </CardDescription>
              </div>

              <div className="rounded-2xl border border-[color:var(--line)] bg-white px-3 py-2 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-[color:var(--muted)]">Sound</span>
                  <div className="flex items-center gap-2">
                    {soundEnabled ? (
                      <Volume2 className="h-4 w-4 text-[color:var(--brand-700)]" />
                    ) : (
                      <VolumeX className="h-4 w-4 text-[color:var(--muted)]" />
                    )}
                    <Switch checked={soundEnabled} onCheckedChange={onSoundToggle} />
                  </div>
                </div>
              </div>
            </div>

            <Tabs
              value={mode}
              onValueChange={(nextMode) => onModeChange(nextMode as AppMode)}
            >
              <TabsList>
                <TabsTrigger value="student">Student</TabsTrigger>
                <TabsTrigger value="teacher">Teacher</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
        </motion.div>
      </Card>

      {configError && <Alert variant="destructive">{configError}</Alert>}

      {children}
    </main>
  );
}
