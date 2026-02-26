import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MotionButton } from "@/components/motion-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { TeacherAiChart } from "@/features/teacher/teacher-ai-chart";
import type {
  TeacherAiIntent,
  TeacherAiRequest,
  TeacherAiResponse,
  TeacherAiTimeframe,
} from "@/features/shared/types";
import type { MotionPolicy } from "@/hooks/use-motion-policy";
import { ApiError, getClientConfig } from "@/lib/env";
import type { SfxEvent } from "@/lib/sfx";
import { cn } from "@/lib/utils";
import cancelIcon from "@/assets/icons/cancel.svg";
import checkSquareIcon from "@/assets/icons/check-square.svg";
import closeIcon from "@/assets/icons/times.svg";
import filterIcon from "@/assets/icons/filter.svg";

const AI_INTENTS: Array<{
  intent: TeacherAiIntent;
  label: string;
  helper: string;
}> = [
  {
    intent: "class_snapshot",
    label: "Class snapshot",
    helper: "Current score and completion trends from completed attempts.",
  },
  {
    intent: "students_need_support",
    label: "Support priority",
    helper: "Students grouped by reading stage, from Stage 0 to Stage 4.",
  },
  {
    intent: "slow_questions",
    label: "Slow questions",
    helper: "Questions taking the highest response time.",
  },
];

const MOBILE_BREAKPOINT_QUERY = "(max-width: 768px)";

type TeacherAiPanelProps = {
  token: string;
  classOptions: string[];
  defaultClassFilter: string;
  active: boolean;
  motionPolicy: MotionPolicy;
  playSound: (event: SfxEvent, options?: { fromInteraction?: boolean }) => Promise<boolean>;
  onSessionExpired: () => void;
};

type AiSectionState = {
  data: TeacherAiResponse | null;
  loading: boolean;
  error: string | null;
};

type AiSectionsMap = Record<TeacherAiIntent, AiSectionState>;

function buildInitialSections(): AiSectionsMap {
  return {
    class_snapshot: { data: null, loading: false, error: null },
    students_need_support: { data: null, loading: false, error: null },
    slow_questions: { data: null, loading: false, error: null },
  };
}

function isTeacherSessionError(error: unknown): boolean {
  if (error instanceof ApiError && error.status === 401) {
    return true;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("invalid or expired teacher session") ||
    message.includes("missing teacher session token")
  );
}

function formatMetricValue(value: unknown): string {
  if (value === null || typeof value === "undefined") return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `${value.length} items`;
  }
  if (typeof value === "object") {
    return `${Object.keys(value).length} fields`;
  }
  return "-";
}

function selectedClassLabel(selectedClassNames: string[], allClassCount: number): string {
  if (selectedClassNames.length === 0) return "All classes";
  if (selectedClassNames.length === allClassCount) return "All classes";
  if (selectedClassNames.length === 1) return selectedClassNames[0];
  return `${selectedClassNames.length} classes selected`;
}

function timeframeLabel(value: TeacherAiTimeframe): string {
  switch (value) {
    case "24h":
      return "Last 24 hours";
    case "7d":
      return "Last 7 days";
    case "30d":
      return "Last 30 days";
    case "all":
      return "All time";
    default:
      return "Last 7 days";
  }
}

function formatStageLabel(stageNo: number | null | undefined): string {
  if (typeof stageNo === "number" && stageNo >= 0 && stageNo <= 4) {
    return `Stage ${stageNo}`;
  }
  return "Unassigned";
}

function groupRowsByStage(rows: TeacherAiResponse["tableRows"]) {
  const groups: Array<{
    key: string;
    label: string;
    rows: TeacherAiResponse["tableRows"];
  }> = [
    { key: "stage-0", label: "Stage 0", rows: [] },
    { key: "stage-1", label: "Stage 1", rows: [] },
    { key: "stage-2", label: "Stage 2", rows: [] },
    { key: "stage-3", label: "Stage 3", rows: [] },
    { key: "stage-4", label: "Stage 4", rows: [] },
    { key: "stage-unassigned", label: "Unassigned", rows: [] },
  ];

  rows.forEach((row) => {
    if (typeof row.stageNo === "number" && row.stageNo >= 0 && row.stageNo <= 4) {
      groups[row.stageNo].rows.push(row);
      return;
    }
    groups[groups.length - 1].rows.push(row);
  });

  return groups.filter((group) => group.rows.length > 0);
}

async function callTeacherAiQuery(
  token: string,
  body: TeacherAiRequest,
  signal: AbortSignal,
): Promise<TeacherAiResponse> {
  const { supabaseUrl, apikey } = getClientConfig();
  const headers = new Headers({
    "Content-Type": "application/json",
    apikey,
  });

  if (token.split(".").length === 3) {
    headers.set("Authorization", `Bearer ${token}`);
  } else {
    headers.set("x-teacher-session", token);
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/teacher-ai-query`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  const text = await response.text();
  let payload: Record<string, unknown> = {};
  if (text) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const message =
      typeof payload.error === "string"
        ? payload.error
        : typeof payload.message === "string"
          ? payload.message
          : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return payload as unknown as TeacherAiResponse;
}

function IconGlyph({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt={alt} aria-hidden={alt === ""} className="h-4 w-4 shrink-0" />;
}

function SectionCard({
  title,
  helper,
  section,
  isSupportSection,
}: {
  title: string;
  helper: string;
  section: AiSectionState;
  isSupportSection: boolean;
}) {
  const sourceMetricEntries = useMemo(
    () => Object.entries(section.data?.sourceMetrics ?? {}),
    [section.data?.sourceMetrics],
  );

  const stageGroups = useMemo(
    () => (isSupportSection && section.data ? groupRowsByStage(section.data.tableRows) : []),
    [isSupportSection, section.data],
  );

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{helper}</CardDescription>
        </div>
        {section.loading ? <Badge>Updating...</Badge> : null}
      </CardHeader>

      <CardContent className="space-y-3">
        {section.error ? <Alert variant="destructive">{section.error}</Alert> : null}

        {!section.data && section.loading ? <Alert>Loading insight...</Alert> : null}
        {!section.data && !section.loading && !section.error ? <Alert>No data available yet.</Alert> : null}

        {section.data ? (
          <>
            <Alert variant="success">{section.data.summary}</Alert>

            <Card className="bg-white">
              <CardHeader className="pb-1">
                <CardTitle className="text-lg">Key insights</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm text-[color:var(--ink)]">
                  {section.data.insights.map((insight, index) => (
                    <li key={`${insight}-${index}`}>{insight}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <TeacherAiChart chart={section.data.chart} />

            <Card className="bg-white">
              <CardHeader className="pb-1">
                <CardTitle className="text-lg">Metrics table</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {section.data.tableRows.length === 0 ? (
                  <p className="text-sm text-[color:var(--muted)]">No rows available for this query.</p>
                ) : isSupportSection ? (
                  <div className="space-y-3">
                    {stageGroups.map((group) => (
                      <div key={group.key} className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-[color:var(--ink)]">
                            {group.label} · {group.rows.length} {group.rows.length === 1 ? "student" : "students"}
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          {group.rows.map((row, index) => (
                            <div
                              key={`${row.label}-${group.key}-${index}`}
                              className="rounded-[var(--radius-lg)] border border-[color:var(--line)] bg-[color:var(--surface)] px-3 py-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-[color:var(--ink)]">{row.label}</p>
                                <Badge>{row.value}</Badge>
                              </div>
                              <p className="text-sm text-[color:var(--ink)]">{row.primary}</p>
                              <p className="text-xs text-[color:var(--muted)]">
                                {row.secondary || formatStageLabel(row.stageNo)}
                              </p>
                              {row.trend ? (
                                <p className="text-xs font-semibold text-[color:var(--muted)]">{row.trend}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  section.data.tableRows.map((row, index) => (
                    <div
                      key={`${row.label}-${index}`}
                      className="rounded-[var(--radius-lg)] border border-[color:var(--line)] bg-[color:var(--surface)] px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[color:var(--ink)]">{row.label}</p>
                        <Badge>{row.value}</Badge>
                      </div>
                      <p className="text-sm text-[color:var(--ink)]">{row.primary}</p>
                      {row.secondary ? (
                        <p className="text-xs text-[color:var(--muted)]">{row.secondary}</p>
                      ) : null}
                      {row.trend ? (
                        <p className="text-xs font-semibold text-[color:var(--muted)]">{row.trend}</p>
                      ) : null}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader className="pb-1">
                <CardTitle className="text-base">Source metrics</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {sourceMetricEntries.length === 0 ? (
                  <p className="text-sm text-[color:var(--muted)]">No source metrics available.</p>
                ) : (
                  sourceMetricEntries.map(([key, value]) => (
                    <Badge key={key}>
                      {key}: {formatMetricValue(value)}
                    </Badge>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function TeacherAiPanel({
  token,
  classOptions,
  defaultClassFilter,
  active,
  motionPolicy,
  playSound,
  onSessionExpired,
}: TeacherAiPanelProps) {
  const [sections, setSections] = useState<AiSectionsMap>(() => buildInitialSections());
  const [timeframe, setTimeframe] = useState<TeacherAiTimeframe>("7d");
  const [selectedClassNames, setSelectedClassNames] = useState<string[]>([]);
  const [isClassMenuOpen, setIsClassMenuOpen] = useState(false);
  const [isMobileFilterSheetOpen, setIsMobileFilterSheetOpen] = useState(false);
  const [mobileDraftClassNames, setMobileDraftClassNames] = useState<string[]>([]);
  const [mobileDraftTimeframe, setMobileDraftTimeframe] = useState<TeacherAiTimeframe>("7d");
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
  });

  const classMenuRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sortedClassOptions = useMemo(
    () => [...classOptions].sort((a, b) => a.localeCompare(b)),
    [classOptions],
  );

  useEffect(() => {
    const nextClasses = selectedClassNames.filter((className) => sortedClassOptions.includes(className));
    if (nextClasses.length !== selectedClassNames.length) {
      setSelectedClassNames(nextClasses);
    }
  }, [selectedClassNames, sortedClassOptions]);

  useEffect(() => {
    if (defaultClassFilter === "all") {
      return;
    }
    if (!sortedClassOptions.includes(defaultClassFilter)) {
      return;
    }
    setSelectedClassNames((current) => {
      if (current.length > 0) return current;
      return [defaultClassFilter];
    });
  }, [defaultClassFilter, sortedClassOptions]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    const updateMatch = (matches: boolean) => {
      setIsMobile(matches);
    };

    updateMatch(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      updateMatch(event.matches);
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (!isClassMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!classMenuRef.current) return;
      const target = event.target as Node;
      if (!classMenuRef.current.contains(target)) {
        setIsClassMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [isClassMenuOpen]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (!active || !token) return;

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      const nextController = new AbortController();
      if (abortRef.current) {
        abortRef.current.abort();
      }
      abortRef.current = nextController;

      AI_INTENTS.forEach((option) => {
        setSections((current) => ({
          ...current,
          [option.intent]: {
            ...current[option.intent],
            loading: true,
            error: null,
          },
        }));
      });

      const filters = {
        classNames: selectedClassNames.length > 0 ? selectedClassNames : undefined,
        timeframe,
        limit: 8,
      };

      Promise.all(
        AI_INTENTS.map(async (option) => {
          try {
            const body: TeacherAiRequest = {
              intent: option.intent,
              filters,
            };
            const response = await callTeacherAiQuery(token, body, nextController.signal);
            setSections((current) => ({
              ...current,
              [option.intent]: {
                data: response,
                loading: false,
                error: null,
              },
            }));
          } catch (error) {
            if (nextController.signal.aborted) {
              return;
            }
            if (isTeacherSessionError(error)) {
              onSessionExpired();
              return;
            }
            setSections((current) => ({
              ...current,
              [option.intent]: {
                ...current[option.intent],
                loading: false,
                error: error instanceof Error ? error.message : "Failed to generate insight.",
              },
            }));
          }
        }),
      ).finally(() => {
        if (abortRef.current === nextController) {
          abortRef.current = null;
        }
      });
    }, 300);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [active, onSessionExpired, selectedClassNames, timeframe, token]);

  const toggleClassSelection = (className: string) => {
    setSelectedClassNames((current) => {
      if (current.includes(className)) {
        return current.filter((item) => item !== className);
      }
      return [...current, className].sort((a, b) => a.localeCompare(b));
    });
  };

  const classScopeLabel = selectedClassLabel(selectedClassNames, sortedClassOptions.length);

  return (
    <section className="space-y-4" aria-label="teacher-ai-copilot">
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="text-3xl">AI Copilot</CardTitle>
          <CardDescription>
            Filter scope and timeframe to generate class snapshot, support priority, and slow-question insights.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {isMobile ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-[var(--radius-lg)] border border-[color:var(--line)] bg-white px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--muted)]">Scope</p>
                <p className="text-sm font-semibold text-[color:var(--ink)]">{classScopeLabel}</p>
                <p className="text-xs text-[color:var(--muted)]">{timeframeLabel(timeframe)}</p>
              </div>
              <MotionButton
                motionPolicy={motionPolicy}
                variant="secondary"
                size="icon"
                title="Open AI filters"
                aria-label="Open AI filters"
                onClick={() => {
                  setMobileDraftClassNames(selectedClassNames);
                  setMobileDraftTimeframe(timeframe);
                  setIsMobileFilterSheetOpen(true);
                  void playSound("tap", { fromInteraction: true });
                }}
              >
                <IconGlyph src={filterIcon} alt="" />
              </MotionButton>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-1" ref={classMenuRef}>
                <Label htmlFor="teacher-ai-class-multiselect">Class scope</Label>
                <div className="relative">
                  <button
                    id="teacher-ai-class-multiselect"
                    type="button"
                    className="w-full rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-white px-3 py-2 text-left text-sm font-semibold text-[color:var(--ink)] shadow-[var(--shadow-2xs)]"
                    onClick={() => {
                      setIsClassMenuOpen((current) => !current);
                      void playSound("tap", { fromInteraction: true });
                    }}
                  >
                    {classScopeLabel}
                  </button>
                  {isClassMenuOpen ? (
                    <div className="absolute z-20 mt-2 w-full rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[color:var(--card)] p-3 shadow-[var(--shadow-md)]">
                      <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                        {sortedClassOptions.map((className) => {
                          const checked = selectedClassNames.includes(className);
                          return (
                            <label
                              key={className}
                              className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--line)] bg-white px-2 py-1.5"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  toggleClassSelection(className);
                                  void playSound("tap", { fromInteraction: true });
                                }}
                                className="h-4 w-4 accent-[color:var(--brand-600)]"
                              />
                              <span className="text-sm font-semibold text-[color:var(--ink)]">{className}</span>
                            </label>
                          );
                        })}
                      </div>
                      <div className="mt-3 flex items-center justify-end gap-2">
                        <MotionButton
                          motionPolicy={motionPolicy}
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSelectedClassNames([]);
                            void playSound("tap", { fromInteraction: true });
                          }}
                        >
                          Clear
                        </MotionButton>
                        <MotionButton
                          motionPolicy={motionPolicy}
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setIsClassMenuOpen(false);
                            void playSound("tap", { fromInteraction: true });
                          }}
                        >
                          Done
                        </MotionButton>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="teacher-ai-timeframe">Timeframe</Label>
                <Select
                  id="teacher-ai-timeframe"
                  value={timeframe}
                  onChange={(event) => {
                    setTimeframe(event.target.value as TeacherAiTimeframe);
                    void playSound("tap", { fromInteraction: true });
                  }}
                >
                  <option value="24h">Last 24 hours</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="all">All time</option>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {AI_INTENTS.map((option) => (
        <SectionCard
          key={option.intent}
          title={option.label}
          helper={option.helper}
          section={sections[option.intent]}
          isSupportSection={option.intent === "students_need_support"}
        />
      ))}

      <AnimatePresence>
        {isMobile && isMobileFilterSheetOpen ? (
          <>
            <motion.button
              type="button"
              className="fixed inset-0 z-40 bg-black/20"
              aria-label="Close AI filter sheet"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: motionPolicy === "full" ? 0.16 : 0.01 }}
              onClick={() => setIsMobileFilterSheetOpen(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: motionPolicy === "full" ? 0.2 : 0.01 }}
              className="fixed inset-x-0 bottom-0 z-50 rounded-t-[var(--radius-xl)] border-t border-[color:var(--line)] bg-[color:var(--card)] p-4 shadow-[var(--shadow-lg)]"
              role="dialog"
              aria-modal="true"
              aria-label="AI filters"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">AI filters</p>
                <MotionButton
                  motionPolicy={motionPolicy}
                  variant="secondary"
                  size="icon"
                  title="Close AI filters"
                  aria-label="Close AI filters"
                  onClick={() => {
                    setIsMobileFilterSheetOpen(false);
                    void playSound("tap", { fromInteraction: true });
                  }}
                >
                  <IconGlyph src={closeIcon} alt="" />
                </MotionButton>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="teacher-ai-timeframe-mobile">Timeframe</Label>
                  <Select
                    id="teacher-ai-timeframe-mobile"
                    value={mobileDraftTimeframe}
                    onChange={(event) => {
                      setMobileDraftTimeframe(event.target.value as TeacherAiTimeframe);
                      void playSound("tap", { fromInteraction: true });
                    }}
                  >
                    <option value="24h">Last 24 hours</option>
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                    <option value="all">All time</option>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Class scope</Label>
                  <div className="max-h-[32vh] space-y-2 overflow-y-auto pr-1">
                    {sortedClassOptions.map((className) => {
                      const checked = mobileDraftClassNames.includes(className);
                      return (
                        <label
                          key={className}
                          className={cn(
                            "flex cursor-pointer items-center gap-2 rounded-[var(--radius-lg)] border px-3 py-2 text-sm font-semibold",
                            checked
                              ? "border-[color:var(--ring)] bg-[color:var(--secondary)]"
                              : "border-[color:var(--line)] bg-white",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setMobileDraftClassNames((current) => {
                                if (current.includes(className)) {
                                  return current.filter((item) => item !== className);
                                }
                                return [...current, className].sort((a, b) => a.localeCompare(b));
                              });
                              void playSound("tap", { fromInteraction: true });
                            }}
                            className="h-4 w-4 accent-[color:var(--brand-600)]"
                          />
                          <span>{className}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-end gap-2">
                  <MotionButton
                    motionPolicy={motionPolicy}
                    variant="secondary"
                    size="icon"
                    title="Clear AI filters"
                    aria-label="Clear AI filters"
                    onClick={() => {
                      setMobileDraftClassNames([]);
                      setMobileDraftTimeframe("7d");
                      void playSound("tap", { fromInteraction: true });
                    }}
                  >
                    <IconGlyph src={cancelIcon} alt="" />
                  </MotionButton>
                  <MotionButton
                    motionPolicy={motionPolicy}
                    variant="secondary"
                    size="icon"
                    title="Apply AI filters"
                    aria-label="Apply AI filters"
                    onClick={() => {
                      setSelectedClassNames(mobileDraftClassNames);
                      setTimeframe(mobileDraftTimeframe);
                      setIsMobileFilterSheetOpen(false);
                      void playSound("tap", { fromInteraction: true });
                    }}
                  >
                    <IconGlyph src={checkSquareIcon} alt="" />
                  </MotionButton>
                </div>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
