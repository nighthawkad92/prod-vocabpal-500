import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ComponentsSection } from "@/features/design-system/components-section";
import { FoundationsSection } from "@/features/design-system/foundations-section";
import { MotionSfxSection } from "@/features/design-system/motion-sfx-section";
import { useMotionPolicy } from "@/hooks/use-motion-policy";
import { useSoundEffects } from "@/hooks/use-sound-effects";
import { useUiPreferences } from "@/hooks/use-ui-preferences";
import { getComponentCatalog, getDesignTokens, getSfxCatalog } from "@/lib/design-system";

export function DesignSystemPage() {
  const tokens = useMemo(() => getDesignTokens(), []);
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

  const catalog = useMemo(() => getComponentCatalog(), []);
  const sfxCatalog = useMemo(() => getSfxCatalog(), []);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-4 px-4 pb-10 pt-5 text-[color:var(--ink)] md:px-6">
      <Card className="overflow-hidden border-[#c7d7e4] bg-[linear-gradient(140deg,#fffdf5_0%,#eef7ff_55%,#fff8e9_100%)]">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--brand-700)]">
                VocabPal UI System
              </p>
              <CardTitle className="max-w-3xl text-[clamp(2rem,4vw,3.6rem)] leading-[1.06]">
                Design System
              </CardTitle>
              <CardDescription className="max-w-3xl text-base text-[color:var(--muted)]">
                Current implemented tokens, primitives, motion policy, and SFX events at `/designsystem`.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge>Live Inventory</Badge>
              <Badge>Route: /designsystem</Badge>
            </div>
          </div>

          <CardContent className="grid gap-3 rounded-2xl border border-[color:var(--line)] bg-white/90 p-3 md:grid-cols-[1fr_auto] md:items-center">
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-2">
                <p className="text-xs text-[color:var(--muted)]">Motion Policy</p>
                <p className="text-sm font-semibold capitalize">{motionPolicy}</p>
              </div>
              <div className="rounded-xl border border-[color:var(--line)] bg-white px-3 py-2">
                <p className="text-xs text-[color:var(--muted)]">Sound Enabled</p>
                <div className="mt-1 flex items-center gap-2">
                  <Switch checked={soundEnabled} onCheckedChange={toggleSoundWithSideEffects} />
                  <span className="text-sm font-semibold">{soundEnabled ? "On" : "Off"}</span>
                </div>
              </div>
            </div>
            <a href="/" className="inline-flex">
              <Button variant="secondary" className="w-full md:w-auto">
                <ArrowLeft className="h-4 w-4" />
                Back to App
              </Button>
            </a>
          </CardContent>
        </CardHeader>
      </Card>

      <FoundationsSection tokens={tokens} />
      <ComponentsSection catalog={catalog} defaultMotionPolicy={motionPolicy} />
      <MotionSfxSection
        systemMotionPolicy={motionPolicy}
        soundEnabled={soundEnabled}
        hasInteracted={hasInteracted}
        onToggleSound={toggleSoundWithSideEffects}
        onPlaySound={play}
        sfxCatalog={sfxCatalog}
      />
    </main>
  );
}
