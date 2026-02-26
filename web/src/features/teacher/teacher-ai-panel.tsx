import { useEffect, useMemo, useState } from "react";
import { MotionButton } from "@/components/motion-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type {
  TeacherAiIntent,
  TeacherAiRequest,
  TeacherAiResponse,
  TeacherAiStatusFilter,
  TeacherAiTimeframe,
} from "@/features/shared/types";
import { TeacherAiChart } from "@/features/teacher/teacher-ai-chart";
import type { MotionPolicy } from "@/hooks/use-motion-policy";
import { ApiError, callFunction } from "@/lib/env";
import type { SfxEvent } from "@/lib/sfx";

const INTENT_OPTIONS: Array<{
  intent: TeacherAiIntent;
  label: string;
  helper: string;
}> = [
  {
    intent: "class_snapshot",
    label: "Class snapshot",
    helper: "How is this class doing right now?",
  },
  {
    intent: "students_need_support",
    label: "Support priority",
    helper: "Which students need support first?",
  },
  {
    intent: "slow_questions",
    label: "Slow questions",
    helper: "Which questions are taking the most time?",
  },
  {
    intent: "class_comparison",
    label: "Class comparison",
    helper: "Compare classes by score and completion.",
  },
  {
    intent: "next_steps",
    label: "Next teaching steps",
    helper: "What should I teach next?",
  },
];

type SessionMessage = {
  requestId: string;
  intent: TeacherAiIntent;
  summary: string;
  createdAt: string;
  fallbackUsed: boolean;
};

type TeacherAiPanelProps = {
  token: string;
  classOptions: string[];
  defaultClassFilter: string;
  motionPolicy: MotionPolicy;
  playSound: (event: SfxEvent, options?: { fromInteraction?: boolean }) => Promise<boolean>;
  onSessionExpired: () => void;
};

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

function formatIntentLabel(intent: TeacherAiIntent): string {
  return INTENT_OPTIONS.find((option) => option.intent === intent)?.label ?? intent;
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

export function TeacherAiPanel({
  token,
  classOptions,
  defaultClassFilter,
  motionPolicy,
  playSound,
  onSessionExpired,
}: TeacherAiPanelProps) {
  const [activeIntent, setActiveIntent] = useState<TeacherAiIntent>("class_snapshot");
  const [timeframe, setTimeframe] = useState<TeacherAiTimeframe>("7d");
  const [statusFilter, setStatusFilter] = useState<TeacherAiStatusFilter>("all");
  const [classFilter, setClassFilter] = useState(defaultClassFilter === "all" ? "all" : defaultClassFilter);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState<TeacherAiResponse | null>(null);
  const [sessionMessages, setSessionMessages] = useState<SessionMessage[]>([]);

  useEffect(() => {
    const defaultIsVisible = defaultClassFilter !== "all" && classOptions.includes(defaultClassFilter);
    if (defaultIsVisible) {
      setClassFilter(defaultClassFilter);
      return;
    }
    if (classFilter !== "all" && !classOptions.includes(classFilter)) {
      setClassFilter("all");
    }
  }, [classFilter, classOptions, defaultClassFilter]);

  const sourceMetricEntries = useMemo(
    () => Object.entries(aiResponse?.sourceMetrics ?? {}),
    [aiResponse?.sourceMetrics],
  );

  const runIntent = async (intent: TeacherAiIntent) => {
    setActiveIntent(intent);
    setAiError(null);
    setAiLoading(true);

    try {
      const body: TeacherAiRequest = {
        intent,
        filters: {
          className: classFilter === "all" ? undefined : classFilter,
          timeframe,
          status: statusFilter,
          limit: 6,
        },
      };

      const response = await callFunction<TeacherAiResponse>("teacher-ai-query", {
        method: "POST",
        token,
        body,
      });

      setAiResponse(response);
      setSessionMessages((current) => {
        const next: SessionMessage[] = [
          {
            requestId: response.requestId,
            intent: response.intent,
            summary: response.summary,
            createdAt: new Date().toISOString(),
            fallbackUsed: response.fallbackUsed,
          },
          ...current.filter((message) => message.requestId !== response.requestId),
        ];
        return next.slice(0, 6);
      });
      await playSound("submit", { fromInteraction: true });
    } catch (error) {
      if (isTeacherSessionError(error)) {
        onSessionExpired();
        return;
      }
      setAiError(error instanceof Error ? error.message : "Failed to generate AI insight.");
      await playSound("error", { fromInteraction: true });
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-3xl">AI Copilot</CardTitle>
            <CardDescription>
              Guided insights from teacher dashboard data with structured outputs and chart view.
            </CardDescription>
          </div>
          {aiResponse?.fallbackUsed ? <Badge>Fallback mode</Badge> : <Badge>OpenAI mode</Badge>}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {INTENT_OPTIONS.map((option) => (
            <MotionButton
              key={option.intent}
              motionPolicy={motionPolicy}
              size="sm"
              variant={activeIntent === option.intent ? "default" : "secondary"}
              title={option.helper}
              disabled={aiLoading}
              onClick={() => {
                void playSound("tap", { fromInteraction: true });
                void runIntent(option.intent);
              }}
            >
              {option.label}
            </MotionButton>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="teacher-ai-class-filter">Class scope</Label>
            <Select
              id="teacher-ai-class-filter"
              value={classFilter}
              onChange={(event) => setClassFilter(event.target.value)}
              disabled={aiLoading}
            >
              <option value="all">All classes</option>
              {classOptions.map((className) => (
                <option key={className} value={className}>
                  {className}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="teacher-ai-timeframe">Timeframe</Label>
            <Select
              id="teacher-ai-timeframe"
              value={timeframe}
              onChange={(event) => setTimeframe(event.target.value as TeacherAiTimeframe)}
              disabled={aiLoading}
            >
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="all">All time</option>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="teacher-ai-status-filter">Attempt status</Label>
            <Select
              id="teacher-ai-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as TeacherAiStatusFilter)}
              disabled={aiLoading}
            >
              <option value="all">All</option>
              <option value="completed">Completed</option>
              <option value="in_progress">In progress</option>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--muted)]">
            Structured response output
          </p>
          <MotionButton
            motionPolicy={motionPolicy}
            size="sm"
            variant="secondary"
            disabled={aiLoading}
            onClick={() => {
              void playSound("tap", { fromInteraction: true });
              void runIntent(activeIntent);
            }}
          >
            {aiLoading ? "Generating..." : "Refresh insight"}
          </MotionButton>
        </div>

        {aiLoading ? <Alert>Generating insight...</Alert> : null}
        {aiError ? <Alert variant="destructive">{aiError}</Alert> : null}

        {aiResponse ? (
          <div className="space-y-4">
            <Alert variant="success">{aiResponse.summary}</Alert>

            <div className="grid gap-3 lg:grid-cols-2">
              <Card className="bg-white">
                <CardHeader className="pb-1">
                  <CardTitle className="text-lg">Key Insights</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-[color:var(--ink)]">
                    {aiResponse.insights.map((insight, index) => (
                      <li key={`${insight}-${index}`}>{insight}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardHeader className="pb-1">
                  <CardTitle className="text-lg">Recommended Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-[color:var(--ink)]">
                    {aiResponse.actions.map((action, index) => (
                      <li key={`${action}-${index}`}>{action}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            <TeacherAiChart chart={aiResponse.chart} />

            <Card className="bg-white">
              <CardHeader className="pb-1">
                <CardTitle className="text-lg">Source Metrics Table</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {aiResponse.tableRows.length === 0 ? (
                  <p className="text-sm text-[color:var(--muted)]">No rows available for this query.</p>
                ) : (
                  aiResponse.tableRows.map((row, index) => (
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
                <CardTitle className="text-base">Source Metrics</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {sourceMetricEntries.map(([key, value]) => (
                  <Badge key={key}>
                    {key}: {formatMetricValue(value)}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Alert>Select a prompt chip to generate the first insight.</Alert>
        )}

        {sessionMessages.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--muted)]">
              Session history
            </p>
            <div className="flex flex-wrap gap-2">
              {sessionMessages.map((message) => (
                <Badge key={message.requestId}>
                  {formatIntentLabel(message.intent)} · {message.fallbackUsed ? "Fallback" : "OpenAI"}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
