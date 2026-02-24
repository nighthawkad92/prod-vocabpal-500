import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { MotionButton } from "@/components/motion-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MotionPolicy } from "@/hooks/use-motion-policy";
import type { SfxEvent } from "@/lib/sfx";
import type { SfxCatalogItem } from "@/features/design-system/types";

type MotionSfxSectionProps = {
  systemMotionPolicy: MotionPolicy;
  soundEnabled: boolean;
  hasInteracted: boolean;
  onToggleSound: () => void;
  onPlaySound: (event: SfxEvent, options?: { fromInteraction?: boolean }) => Promise<boolean>;
  sfxCatalog: SfxCatalogItem[];
};

export function MotionSfxSection({
  systemMotionPolicy,
  soundEnabled,
  hasInteracted,
  onToggleSound,
  onPlaySound,
  sfxCatalog,
}: MotionSfxSectionProps) {
  const [previewMotionPolicy, setPreviewMotionPolicy] = useState<MotionPolicy>(systemMotionPolicy);
  const [pulseNonce, setPulseNonce] = useState(0);
  const [lastSfxResult, setLastSfxResult] = useState<string>("No event played yet.");

  const motionTransition = useMemo(
    () =>
      previewMotionPolicy === "full"
        ? { duration: 0.24, ease: "easeOut" as const }
        : { duration: 0.01 },
    [previewMotionPolicy],
  );

  return (
    <section className="space-y-4" aria-labelledby="motion-sfx-heading">
      <div className="space-y-1">
        <h2 id="motion-sfx-heading" className="font-['Fraunces',serif] text-3xl text-[color:var(--ink)]">
          Motion + SFX
        </h2>
        <p className="text-sm text-[color:var(--muted)]">
          Demonstrates reduced-motion behavior and event-based sound cues.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Motion Policy</CardTitle>
            <CardDescription>
              Compare <strong>full</strong> and <strong>reduced</strong> behavior.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs
              value={previewMotionPolicy}
              onValueChange={(value) => setPreviewMotionPolicy(value as MotionPolicy)}
            >
              <TabsList>
                <TabsTrigger value="full">Full</TabsTrigger>
                <TabsTrigger value="reduced">Reduced</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-2">
              <Badge>System: {systemMotionPolicy}</Badge>
              <Badge>Preview: {previewMotionPolicy}</Badge>
            </div>

            <motion.div
              key={`${previewMotionPolicy}-${pulseNonce}`}
              initial={previewMotionPolicy === "full" ? { opacity: 0, y: 10, scale: 0.99 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={motionTransition}
              className="rounded-2xl border border-[color:var(--line)] bg-white p-4"
            >
              <p className="text-sm text-[color:var(--muted)]">
                Section enter transition sample.
              </p>
              <MotionButton
                className="mt-3"
                motionPolicy={previewMotionPolicy}
                variant="secondary"
                onClick={() => setPulseNonce((current) => current + 1)}
              >
                Replay Motion
              </MotionButton>
            </motion.div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Sound Events</CardTitle>
            <CardDescription>
              Uses existing `useSoundEffects` pipeline with runtime mute control.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-2xl border border-[color:var(--line)] bg-white px-3 py-2">
              <div className="space-y-0.5">
                <Label htmlFor="design-system-sound-toggle">Sound Enabled</Label>
                <p className="text-xs text-[color:var(--muted)]">
                  Interaction unlocked: {hasInteracted ? "yes" : "no"}
                </p>
              </div>
              <Switch
                id="design-system-sound-toggle"
                checked={soundEnabled}
                onCheckedChange={onToggleSound}
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {sfxCatalog.map((item) => (
                <div
                  key={item.event}
                  className="rounded-xl border border-[color:var(--line)] bg-white p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold capitalize text-[color:var(--ink)]">
                      {item.event}
                    </p>
                    <Badge>vol {item.volume}</Badge>
                  </div>
                  <p className="text-xs text-[color:var(--muted)]">
                    cooldown {item.cooldownMs}ms
                  </p>
                  <Button
                    className="mt-2 w-full"
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const played = await onPlaySound(item.event, { fromInteraction: true });
                      setLastSfxResult(`${item.event}: ${played ? "played" : "blocked"}`);
                    }}
                  >
                    Trigger {item.event}
                  </Button>
                </div>
              ))}
            </div>

            <Separator />
            <p className="text-xs text-[color:var(--muted)]">{lastSfxResult}</p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
