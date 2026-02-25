import { AnimatePresence, motion } from "motion/react";
import { Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { MotionPolicy } from "@/hooks/use-motion-policy";
import type { AppMode } from "@/features/shared/types";
import menuIcon from "@/assets/icons/menu.svg";

const COLLAPSE_THRESHOLD_PX = 48;

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
  const widthClass = mode === "teacher" ? "max-w-[85vw]" : "max-w-6xl";
  const headerRef = useRef<HTMLDivElement | null>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);
  const inlineControlsRef = useRef<HTMLDivElement | null>(null);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cachedControlsWidth, setCachedControlsWidth] = useState(0);
  const isDrawerVisible = controlsCollapsed && drawerOpen;

  const evaluateControlCollapse = useCallback(() => {
    if (!showUtilityLogo || !headerRef.current || !logoRef.current) {
      setControlsCollapsed(false);
      if (drawerOpen) {
        setDrawerOpen(false);
      }
      return;
    }

    const logoRect = logoRef.current.getBoundingClientRect();
    const controlRect = inlineControlsRef.current?.getBoundingClientRect();

    if (controlRect) {
      const nextGap = controlRect.left - logoRect.right;
      if (controlRect.width > 0) {
        setCachedControlsWidth(controlRect.width);
      }
      const shouldCollapse = nextGap < COLLAPSE_THRESHOLD_PX;
      setControlsCollapsed(shouldCollapse);
      if (!shouldCollapse && drawerOpen) {
        setDrawerOpen(false);
      }
      return;
    }

    if (cachedControlsWidth <= 0) {
      setControlsCollapsed(false);
      return;
    }

    const headerRect = headerRef.current.getBoundingClientRect();
    const estimatedGap = headerRect.width - logoRect.width - cachedControlsWidth;
    const shouldCollapse = estimatedGap < COLLAPSE_THRESHOLD_PX;
    setControlsCollapsed(shouldCollapse);
    if (!shouldCollapse && drawerOpen) {
      setDrawerOpen(false);
    }
  }, [cachedControlsWidth, drawerOpen, showUtilityLogo]);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      evaluateControlCollapse();
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [evaluateControlCollapse, mode, showUtilityLogo]);

  useEffect(() => {
    const handleResize = () => evaluateControlCollapse();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [evaluateControlCollapse]);

  useEffect(() => {
    if (!isDrawerVisible) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isDrawerVisible]);

  const controls = (
    <>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-[color:var(--ink)]">Sound</span>
        <div className="flex items-center gap-2">
          {soundEnabled ? (
            <Volume2 className="h-4 w-4 text-[color:var(--ink)]" />
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
    </>
  );

  return (
    <main
      className={`mx-auto w-full ${widthClass} space-y-4 px-4 pb-8 pt-5 text-[color:var(--ink)] md:px-6`}
      data-motion-policy={motionPolicy}
      data-sound-enabled={soundEnabled ? "true" : "false"}
    >
      <motion.div
        ref={headerRef}
        initial={motionPolicy === "full" ? { opacity: 0, y: 8 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: motionPolicy === "full" ? 0.26 : 0.01 }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex min-h-11 items-center">
          {showUtilityLogo ? (
            <img
              ref={logoRef}
              src={utilityLogoSrc}
              alt="VocabPal"
              className="h-auto w-[200px] max-w-full"
            />
          ) : null}
        </div>

        <div className="ml-auto flex items-center justify-end">
          {controlsCollapsed ? (
            <Button
              variant="secondary"
              className="h-11 px-4"
              onClick={() => setDrawerOpen((current) => !current)}
              aria-expanded={isDrawerVisible}
              aria-label="Open utility menu"
            >
              <img src={menuIcon} alt="" aria-hidden className="h-4 w-4" />
              Menu
            </Button>
          ) : (
            <div
              ref={inlineControlsRef}
              className="ml-auto flex flex-wrap items-center justify-end gap-x-6 gap-y-2"
            >
              {controls}
            </div>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {isDrawerVisible ? (
          <>
            <motion.button
              type="button"
              className="fixed inset-0 z-40 bg-black/25"
              aria-label="Close menu drawer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: motionPolicy === "full" ? 0.2 : 0.01 }}
              onClick={() => setDrawerOpen(false)}
            />

            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: motionPolicy === "full" ? 0.22 : 0.01 }}
              className="fixed right-0 top-0 z-50 flex h-full w-[min(23rem,calc(100vw-1rem))] flex-col gap-6 border-l border-[color:var(--border)] bg-[color:var(--card)] p-5 shadow-[var(--shadow-lg)]"
              role="dialog"
              aria-modal="true"
              aria-label="Utility menu"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold tracking-wide text-[color:var(--ink)]">Menu</p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close utility menu"
                >
                  Close
                </Button>
              </div>

              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-[color:var(--ink)]">Sound</span>
                  <div className="flex items-center gap-2">
                    {soundEnabled ? (
                      <Volume2 className="h-4 w-4 text-[color:var(--ink)]" />
                    ) : (
                      <VolumeX className="h-4 w-4 text-[color:var(--ink)]" />
                    )}
                    <Switch checked={soundEnabled} onCheckedChange={onSoundToggle} />
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[color:var(--ink)]">Mode</p>
                  <Tabs
                    value={mode}
                    onValueChange={(nextMode) => {
                      onModeChange(nextMode as AppMode);
                      setDrawerOpen(false);
                    }}
                    className="space-y-0"
                  >
                    <TabsList className="w-full border-none bg-transparent p-0 shadow-none">
                      <TabsTrigger className="w-full" value="student">
                        Student
                      </TabsTrigger>
                      <TabsTrigger className="w-full" value="teacher">
                        Teacher
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      {configError && <Alert variant="destructive">{configError}</Alert>}

      {children}
    </main>
  );
}
