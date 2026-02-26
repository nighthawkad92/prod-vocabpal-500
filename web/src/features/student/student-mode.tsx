import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { MotionButton } from "@/components/motion-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioOption } from "@/components/ui/radio-option";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MotionPolicy } from "@/hooks/use-motion-policy";
import type { SfxEvent } from "@/lib/sfx";
import { ApiError, callFunction } from "@/lib/env";
import { clarityEvent, clarityIdentifyAttempt, claritySet } from "@/lib/clarity";
import type { Question, StudentComplete } from "@/features/shared/types";
import {
  QUESTION_VISUAL_BY_ORDER,
  TOTAL_QUESTION_COUNT,
  type QuestionVisual,
} from "@/features/student/dictation-images";
import {
  QUESTION_READING_PRELUDE_BY_ORDER,
  type QuestionReadingPrelude,
} from "@/features/student/reading-preludes";
import logoVocabPal from "@/assets/branding/logo-vocabpal.png";
import imageComplete from "@/assets/complete/image-complete.png";
import arrowLeftIcon from "@/assets/icons/arrow-left.svg";
import playIcon from "@/assets/icons/play.svg";
import starIcon from "@/assets/icons/star.svg";

type StudentModeProps = {
  motionPolicy: MotionPolicy;
  playSound: (event: SfxEvent, options?: { fromInteraction?: boolean }) => Promise<boolean>;
  onAttemptStateChange?: (active: boolean) => void;
  onViewStateChange?: (state: "entry" | "attempt" | "completion") => void;
};

type StartAttemptResponse = {
  attemptId: string;
  firstQuestion?: Question;
  nextQuestion?: Question | null;
  progress: {
    answeredItems: number;
  };
};

type SubmitResponse = {
  isCorrect: boolean;
  nextQuestion: Question | null;
  progress: {
    answeredItems: number;
  };
};

type StudentOnboardingStep = 1 | 2;
type ClassNumber = 1 | 2 | 3 | 4 | 5 | 6;
type SectionLetter = "A" | "B" | "C" | "D" | "E" | "F";

const CLASS_OPTIONS: ClassNumber[] = [1, 2, 3, 4, 5, 6];
const SECTION_OPTIONS: SectionLetter[] = ["A", "B", "C", "D", "E", "F"];

type StudentErrorSurface =
  | "start_attempt"
  | "question_audio"
  | "submit_answer"
  | "complete_attempt"
  | "unknown";

type StudentErrorCategory =
  | "network"
  | "auth"
  | "function_error"
  | "validation"
  | "unknown";

function classifyErrorCategory(error: unknown): StudentErrorCategory {
  if (error instanceof TypeError) {
    return "network";
  }

  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return "auth";
    }
    if (error.status === 400 || error.status === 404 || error.status === 409 || error.status === 422) {
      return "validation";
    }
    return "function_error";
  }

  return "unknown";
}

function parseClassNumber(value: string): ClassNumber | null {
  const numeric = Number(value);
  return CLASS_OPTIONS.includes(numeric as ClassNumber)
    ? (numeric as ClassNumber)
    : null;
}

function parseSectionLetter(value: string): SectionLetter | null {
  return SECTION_OPTIONS.includes(value as SectionLetter)
    ? (value as SectionLetter)
    : null;
}

function toSentenceCase(value: string): string {
  if (!value) return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1).toLowerCase()}`;
}

export function StudentMode({
  motionPolicy,
  playSound,
  onAttemptStateChange,
  onViewStateChange,
}: StudentModeProps) {
  const [step, setStep] = useState<StudentOnboardingStep>(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [classNumber, setClassNumber] = useState<ClassNumber | null>(null);
  const [sectionLetter, setSectionLetter] = useState<SectionLetter | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState("");
  const [shownAtIso, setShownAtIso] = useState("");
  const [answeredItems, setAnsweredItems] = useState(0);
  const [completion, setCompletion] = useState<StudentComplete | null>(null);
  const [busy, setBusy] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioPlayedForQuestion, setAudioPlayedForQuestion] = useState(false);
  const [showReadingPrelude, setShowReadingPrelude] = useState(false);
  const [showProgressSweep, setShowProgressSweep] = useState(false);
  const [starPulseTick, setStarPulseTick] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const autoPlayedQuestionIdRef = useRef<string | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const attemptAliasRef = useRef<string | null>(null);
  const lastTrackedAttemptIdRef = useRef<string | null>(null);
  const hasTrackedEntryViewRef = useRef(false);
  const trackedQuestionViewIdsRef = useRef<Set<string>>(new Set());
  const trackedPreludeViewIdsRef = useRef<Set<string>>(new Set());
  const trackedDictationInputStartedRef = useRef<Set<string>>(new Set());
  const completionViewedTrackedRef = useRef(false);
  const isCompletionView = Boolean(attemptId && completion && !question);
  const studentViewState: "entry" | "attempt" | "completion" = !attemptId
    ? "entry"
    : isCompletionView
      ? "completion"
      : "attempt";

  const progressPercent = useMemo(() => {
    return Math.min(100, (answeredItems / TOTAL_QUESTION_COUNT) * 100);
  }, [answeredItems]);

  const questionVisual = useMemo<QuestionVisual | null>(() => {
    if (!question) return null;
    return QUESTION_VISUAL_BY_ORDER[question.displayOrder] ?? null;
  }, [question]);
  const readingPrelude = useMemo<QuestionReadingPrelude | null>(() => {
    if (!question) return null;
    return QUESTION_READING_PRELUDE_BY_ORDER[question.displayOrder] ?? null;
  }, [question]);
  const activeQuestionPromptText = readingPrelude?.questionPrompt ?? question?.promptText ?? "";

  const setQuestionClarityTags = useCallback(
    (
      sourceQuestion: Question,
      extraTags?: {
        vp_audio_source?: "auto" | "manual";
        vp_audio_gate_locked?: boolean;
        vp_progress_answered_count?: number;
      },
    ) => {
      claritySet({
        vp_attempt_alias: attemptAliasRef.current ?? undefined,
        vp_question_order: sourceQuestion.displayOrder,
        vp_question_type: sourceQuestion.itemType,
        vp_stage_no: sourceQuestion.stageNo,
        vp_has_reading_prelude: Boolean(
          QUESTION_READING_PRELUDE_BY_ORDER[sourceQuestion.displayOrder],
        ),
        vp_audio_source: extraTags?.vp_audio_source,
        vp_audio_gate_locked: extraTags?.vp_audio_gate_locked,
        vp_progress_answered_count: extraTags?.vp_progress_answered_count,
      });
    },
    [],
  );

  const trackStudentError = useCallback(
    (surface: StudentErrorSurface, errorValue: unknown) => {
      claritySet({
        vp_error_surface: surface,
        vp_error_category: classifyErrorCategory(errorValue),
      });
    },
    [],
  );

  const handleDictationAnswerChange = useCallback(
    (value: string) => {
      setAnswer(value);
      if (!question || question.itemType !== "dictation") return;
      if (!value.trim()) return;
      if (trackedDictationInputStartedRef.current.has(question.id)) return;

      trackedDictationInputStartedRef.current.add(question.id);
      setQuestionClarityTags(question, {
        vp_audio_gate_locked: Boolean(question.ttsText) && !audioPlayedForQuestion,
        vp_progress_answered_count: answeredItems,
      });
      clarityEvent("vp_dictation_input_started");
    },
    [answeredItems, audioPlayedForQuestion, question, setQuestionClarityTags],
  );

  const playQuestionAudio = useCallback(
    async (source: "auto" | "manual") => {
      if (!question || !question.ttsText) return;

      setQuestionClarityTags(question, {
        vp_audio_source: source,
        vp_audio_gate_locked: true,
        vp_progress_answered_count: answeredItems,
      });
      clarityEvent("vp_audio_play_requested");
      setAudioBusy(true);
      if (source === "manual") {
        setError(null);
      }

      try {
        const result = await callFunction<{ audioUrl: string }>(
          `student-question-audio/${question.id}`,
        );

        if (activeAudioRef.current) {
          activeAudioRef.current.onended = null;
          activeAudioRef.current.onerror = null;
          activeAudioRef.current.pause();
          activeAudioRef.current.currentTime = 0;
        }

        const player = new Audio(result.audioUrl);
        player.onended = () => {
          setAudioPlaying(false);
          setAudioPlayedForQuestion(true);
          setQuestionClarityTags(question, {
            vp_audio_source: source,
            vp_audio_gate_locked: false,
            vp_progress_answered_count: answeredItems,
          });
          clarityEvent("vp_audio_play_ended");
        };
        player.onerror = () => {
          setAudioPlaying(false);
          trackStudentError("question_audio", new Error("Audio player error"));
          clarityEvent("vp_audio_play_failed");
        };
        activeAudioRef.current = player;
        await player.play();
        setAudioPlaying(true);
        clarityEvent("vp_audio_play_started");
      } catch (err) {
        setAudioPlaying(false);
        trackStudentError("question_audio", err);
        clarityEvent("vp_audio_play_failed");
        if (source === "auto") {
          return;
        } else {
          setError(err instanceof Error ? err.message : "Failed to play audio");
          void playSound("error", { fromInteraction: true });
        }
      } finally {
        setAudioBusy(false);
      }
    },
    [answeredItems, playSound, question, setQuestionClarityTags, trackStudentError],
  );

  useEffect(() => {
    if (!question) return;
    const hasReadingPrelude = Boolean(
      QUESTION_READING_PRELUDE_BY_ORDER[question.displayOrder],
    );

    setShownAtIso(hasReadingPrelude ? "" : new Date().toISOString());
    setAnswer("");
    setAudioPlaying(false);
    setAudioPlayedForQuestion(false);
    setShowReadingPrelude(hasReadingPrelude);

    if (!hasReadingPrelude && autoPlayedQuestionIdRef.current !== question.id && question.ttsText) {
      autoPlayedQuestionIdRef.current = question.id;
      void playQuestionAudio("auto");
    }
  }, [question, playQuestionAudio]);

  useEffect(() => {
    return () => {
      if (!activeAudioRef.current) return;
      activeAudioRef.current.pause();
      activeAudioRef.current.onended = null;
      activeAudioRef.current.onerror = null;
      activeAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    onAttemptStateChange?.(Boolean(attemptId));
  }, [attemptId, onAttemptStateChange]);

  useEffect(() => {
    return () => {
      onAttemptStateChange?.(false);
    };
  }, [onAttemptStateChange]);

  useEffect(() => {
    onViewStateChange?.(studentViewState);
  }, [onViewStateChange, studentViewState]);

  useEffect(() => {
    return () => {
      onViewStateChange?.("entry");
    };
  }, [onViewStateChange]);

  useEffect(() => {
    if (attemptId) return;
    claritySet({
      vp_onboarding_step: step,
      vp_class_number: classNumber ?? undefined,
      vp_section_letter: sectionLetter ?? undefined,
    });

    if (hasTrackedEntryViewRef.current) return;
    hasTrackedEntryViewRef.current = true;
    clarityEvent("vp_student_entry_viewed");
  }, [attemptId, classNumber, sectionLetter, step]);

  useEffect(() => {
    if (lastTrackedAttemptIdRef.current === attemptId) {
      return;
    }

    lastTrackedAttemptIdRef.current = attemptId;
    trackedQuestionViewIdsRef.current.clear();
    trackedPreludeViewIdsRef.current.clear();
    trackedDictationInputStartedRef.current.clear();
    completionViewedTrackedRef.current = false;

    if (!attemptId) {
      attemptAliasRef.current = null;
      return;
    }

    void clarityIdentifyAttempt(attemptId).then((alias) => {
      if (lastTrackedAttemptIdRef.current !== attemptId) return;
      attemptAliasRef.current = alias;
      claritySet({ vp_attempt_alias: alias });
    });
  }, [attemptId]);

  useEffect(() => {
    if (!question) return;

    setQuestionClarityTags(question, {
      vp_audio_gate_locked: Boolean(question.ttsText) && !audioPlayedForQuestion,
      vp_progress_answered_count: answeredItems,
    });

    if (showReadingPrelude && readingPrelude) {
      if (!trackedPreludeViewIdsRef.current.has(question.id)) {
        trackedPreludeViewIdsRef.current.add(question.id);
        clarityEvent("vp_reading_prelude_viewed");
      }
      return;
    }

    if (!trackedQuestionViewIdsRef.current.has(question.id)) {
      trackedQuestionViewIdsRef.current.add(question.id);
      clarityEvent("vp_question_viewed");
    }
  }, [
    answeredItems,
    audioPlayedForQuestion,
    question,
    readingPrelude,
    setQuestionClarityTags,
    showReadingPrelude,
  ]);

  useEffect(() => {
    if (!completion || !isCompletionView || completionViewedTrackedRef.current) return;
    completionViewedTrackedRef.current = true;
    claritySet({
      vp_total_score_10: completion.totalScore10,
      vp_total_correct: completion.totalCorrect,
      vp_total_wrong: completion.totalWrong,
      vp_stars_collected: completion.stars,
      vp_placement_stage: completion.placementStage,
    });
    clarityEvent("vp_completion_viewed");
  }, [completion, isCompletionView]);

  const startAttempt = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!classNumber || !sectionLetter) {
        setError("Please select class and section.");
        trackStudentError("start_attempt", new ApiError("Missing class/section", 400));
        clarityEvent("vp_student_attempt_start_failed");
        return;
      }

      setBusy(true);
      setError(null);
      claritySet({
        vp_onboarding_step: step,
        vp_class_number: classNumber,
        vp_section_letter: sectionLetter,
      });
      clarityEvent("vp_student_attempt_start_requested");

      try {
        const className = `Class ${classNumber} - Section ${sectionLetter}`;
        const result = await callFunction<StartAttemptResponse>("student-start-attempt", {
          method: "POST",
          body: { firstName, lastName, className },
        });

        setAttemptId(result.attemptId);
        void clarityIdentifyAttempt(result.attemptId).then((alias) => {
          if (lastTrackedAttemptIdRef.current !== result.attemptId) return;
          attemptAliasRef.current = alias;
          claritySet({ vp_attempt_alias: alias });
        });
        setQuestion(result.firstQuestion ?? result.nextQuestion ?? null);
        setAnsweredItems(result.progress.answeredItems);
        setCompletion(null);
        clarityEvent("vp_student_attempt_started");
        void playSound("progress", { fromInteraction: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start attempt");
        trackStudentError("start_attempt", err);
        clarityEvent("vp_student_attempt_start_failed");
        void playSound("error", { fromInteraction: true });
      } finally {
        setBusy(false);
      }
    },
    [classNumber, firstName, lastName, playSound, sectionLetter, step, trackStudentError],
  );

  const submitAnswer = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!attemptId || !question || !answer.trim()) return;

      const audioGateLockedForSubmit = Boolean(question.ttsText) &&
        (!audioPlayedForQuestion || audioBusy || audioPlaying);
      setQuestionClarityTags(question, {
        vp_audio_gate_locked: audioGateLockedForSubmit,
        vp_progress_answered_count: answeredItems,
      });
      clarityEvent("vp_submit_answer_requested");
      setBusy(true);
      setError(null);
      try {
        const submit = await callFunction<SubmitResponse>("student-submit-response", {
          method: "POST",
          body: {
            attemptId,
            questionItemId: question.id,
            stageNo: question.stageNo,
            itemNo: question.itemNo,
            answer,
            shownAtIso,
            answeredAtIso: new Date().toISOString(),
          },
        });

        void playSound("submit", { fromInteraction: true });

        claritySet({
          vp_progress_answered_count: submit.progress.answeredItems,
          vp_audio_gate_locked: false,
        });
        clarityEvent("vp_submit_answer_success");
        setAnsweredItems(submit.progress.answeredItems);
        if (submit.isCorrect) {
          clarityEvent("vp_answer_correct");
          setStarPulseTick((current) => current + 1);
          if (motionPolicy === "full") {
            setShowProgressSweep(true);
          }
          await new Promise((resolve) => {
            window.setTimeout(resolve, motionPolicy === "full" ? 220 : 90);
          });
          setShowProgressSweep(false);
        } else {
          clarityEvent("vp_answer_wrong");
        }

        setQuestion(submit.nextQuestion);

        if (submit.nextQuestion) {
          void playSound("progress", { fromInteraction: true });
        } else {
          const complete = await callFunction<StudentComplete>("student-complete-attempt", {
            method: "POST",
            body: { attemptId },
          });
          setCompletion(complete);
          claritySet({
            vp_total_score_10: complete.totalScore10,
            vp_total_correct: complete.totalCorrect,
            vp_total_wrong: complete.totalWrong,
            vp_stars_collected: complete.stars,
            vp_placement_stage: complete.placementStage,
          });
          clarityEvent("vp_attempt_completed");
          void playSound("end", { fromInteraction: true });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to submit answer");
        trackStudentError("submit_answer", err);
        clarityEvent("vp_submit_answer_failed");
        void playSound("error", { fromInteraction: true });
      } finally {
        setBusy(false);
      }
    },
    [
      answer,
      answeredItems,
      attemptId,
      audioBusy,
      audioPlayedForQuestion,
      audioPlaying,
      motionPolicy,
      playSound,
      question,
      setQuestionClarityTags,
      shownAtIso,
      trackStudentError,
    ],
  );

  const questionTransition =
    motionPolicy === "full"
      ? {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          exit: { opacity: 0, y: -8 },
          transition: { duration: 0.2, ease: "easeOut" as const },
        }
      : {
          initial: { opacity: 1, y: 0 },
          animate: { opacity: 1, y: 0 },
          exit: { opacity: 1, y: 0 },
          transition: { duration: 0.01 },
        };

  const requiresAudio = Boolean(question?.ttsText);
  const audioGateLocked =
    requiresAudio && (!audioPlayedForQuestion || audioBusy || audioPlaying);
  const audioStateHint = !requiresAudio
    ? ""
    : (audioBusy
      ? "Audio is loading. Please wait."
      : audioPlaying
        ? "Audio is playing. Listen fully before submitting."
        : audioPlayedForQuestion
          ? "Audio complete. You can submit."
          : "Tap Play audio and wait for it to finish.");
  const submitLabel = busy
    ? "Submitting..."
    : audioGateLocked
      ? (audioBusy ? "Waiting for Audio" : audioPlaying ? "Audio playing" : "Waiting for Audio")
      : "Submit answer";
  const showReadySubmitIcon = !busy && !audioGateLocked;
  const stepOneComplete = firstName.trim().length > 0 && lastName.trim().length > 0;
  const stepTwoComplete = Boolean(classNumber && sectionLetter);
  const entryStepMeta =
    step === 1
      ? "Step 1 of 2:"
      : "Step 2 of 2:";
  const entryStepAction =
    step === 1
      ? "Enter your full name"
      : "Choose your class and section";
  const renderQuestionVisual = (alt: string, layout: "default" | "full-width" = "default") => (
    <div className="dictation-visual flex min-h-[190px] items-center justify-center rounded-2xl border border-[color:var(--line)] bg-white p-3">
      {questionVisual ? (
        questionVisual.kind === "lottie" ? (
          <DotLottieReact
            src={questionVisual.src}
            loop
            autoplay
            style={{
              width: "100%",
              maxWidth: layout === "full-width" ? "100%" : "220px",
              height: "auto",
            }}
          />
        ) : (
          <img
            src={questionVisual.src}
            alt={alt}
            loading="lazy"
            className={layout === "full-width" ? "h-auto w-full max-w-full" : "h-auto w-full max-w-[220px]"}
          />
        )
      ) : (
        <div className="dictation-placeholder text-sm font-semibold text-[color:var(--muted)]">Picture clue</div>
      )}
    </div>
  );
  const revealQuestion = useCallback(() => {
    if (question) {
      setQuestionClarityTags(question, {
        vp_audio_gate_locked: Boolean(question.ttsText) && !audioPlayedForQuestion,
        vp_progress_answered_count: answeredItems,
      });
    }
    clarityEvent("vp_show_question_clicked");
    setShowReadingPrelude(false);
    setShownAtIso(new Date().toISOString());
    void playSound("tap", { fromInteraction: true });

    if (question?.ttsText && autoPlayedQuestionIdRef.current !== question.id) {
      autoPlayedQuestionIdRef.current = question.id;
      void playQuestionAudio("auto");
    }
  }, [answeredItems, audioPlayedForQuestion, playQuestionAudio, playSound, question, setQuestionClarityTags]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("student-complete-bg", isCompletionView);

    return () => {
      document.body.classList.remove("student-complete-bg");
    };
  }, [isCompletionView]);

  return (
    <section
      className={
        isCompletionView
          ? "flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center"
          : attemptId
            ? "mx-auto w-full max-w-[850px] pt-8"
            : "flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center gap-12"
      }
      aria-label="student-mode"
    >
      {!attemptId && (
        <div className="flex flex-col items-center gap-[8px] px-2 text-center">
          <img src={logoVocabPal} alt="VocabPal" className="h-auto w-[350px] max-w-full" />
          <p className="text-base font-semibold text-[color:var(--ink)]">English Vocabulary Revision</p>
        </div>
      )}

      {attemptId && question && (
        <div className="mb-12 space-y-2">
          <div className="flex items-center gap-3">
            <Badge data-testid="question-counter">{`Question ${question.displayOrder} of ${TOTAL_QUESTION_COUNT}`}</Badge>
            <motion.div
              key={`collected-${starPulseTick}`}
              className="ml-auto"
              initial={
                starPulseTick === 0
                  ? false
                  : motionPolicy === "full"
                    ? { scale: 1 }
                    : { opacity: 0.92 }
              }
              animate={
                starPulseTick === 0
                  ? { scale: 1, opacity: 1 }
                  : motionPolicy === "full"
                    ? { scale: [1, 1.04, 1] }
                    : { opacity: [0.92, 1] }
              }
              transition={{ duration: motionPolicy === "full" ? 0.22 : 0.08 }}
            >
              <Badge className="gap-1">
                <img
                  src={starIcon}
                  alt=""
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ filter: "brightness(0)" }}
                />
                {`Collected ${answeredItems}`}
              </Badge>
            </motion.div>
          </div>
          <div className="relative overflow-hidden rounded-full">
            <Progress value={progressPercent} />
            <AnimatePresence>
              {showProgressSweep && motionPolicy === "full" ? (
                <motion.div
                  key="progress-sweep"
                  initial={{ x: "-125%", opacity: 0.2 }}
                  animate={{ x: "150%", opacity: 0.42 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.26, ease: "easeOut" }}
                  className="pointer-events-none absolute inset-y-0 w-[32%] rounded-full bg-white"
                />
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      )}

      <Card className={!attemptId || isCompletionView ? "w-full max-w-[450px]" : undefined}>
        {!attemptId && (
          <CardHeader className="space-y-3">
            <CardTitle className="text-left text-2xl">Baseline Test</CardTitle>
            <CardDescription className="text-left text-[color:var(--ink)]">
              <span className="text-base font-semibold leading-6 text-[color:var(--ink)]">
                {entryStepMeta}
              </span>{" "}
              <span className="text-base font-semibold leading-6 text-[color:var(--ink)]">
                {entryStepAction}
              </span>
            </CardDescription>
          </CardHeader>
        )}

        {!attemptId && (
          <CardContent>
            <form
              className="card grid gap-4"
              onSubmit={step === 1 ? (event) => {
                event.preventDefault();
                if (!stepOneComplete) return;
                claritySet({ vp_onboarding_step: 1 });
                clarityEvent("vp_student_step1_next_clicked");
                setStep(2);
              } : startAttempt}
            >
              {step === 1 ? (
                <div className="grid gap-3">
                  <Label htmlFor="student-first-name">First Name</Label>
                  <Input
                    id="student-first-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    data-clarity-mask="true"
                    required
                  />

                  <Label htmlFor="student-last-name">Last Name</Label>
                  <Input
                    id="student-last-name"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    data-clarity-mask="true"
                    required
                  />

                  <MotionButton
                    motionPolicy={motionPolicy}
                    type="submit"
                    disabled={!stepOneComplete}
                    onClick={() => {
                      void playSound("tap", { fromInteraction: true });
                    }}
                  >
                    Next
                  </MotionButton>
                </div>
              ) : (
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label>Class</Label>
                    <Tabs
                      value={classNumber ? String(classNumber) : ""}
                      onValueChange={(value) => {
                        const next = parseClassNumber(value);
                        if (!next) return;
                        setClassNumber(next);
                        claritySet({ vp_class_number: next, vp_onboarding_step: 2 });
                        clarityEvent("vp_student_class_selected");
                        void playSound("tap", { fromInteraction: true });
                      }}
                      data-testid="onboarding-class-tabs"
                      className="space-y-0"
                    >
                      <TabsList className="grid w-full grid-cols-3 gap-2 border-none bg-transparent p-0 shadow-none md:grid-cols-6">
                        {CLASS_OPTIONS.map((value) => (
                          <TabsTrigger
                            key={value}
                            value={String(value)}
                            className="h-14 w-full justify-center px-2 text-lg"
                          >
                            {value}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                  </div>

                  <div className="space-y-2">
                    <Label>Section</Label>
                    <Tabs
                      value={sectionLetter ?? ""}
                      onValueChange={(value) => {
                        const next = parseSectionLetter(value);
                        if (!next) return;
                        setSectionLetter(next);
                        claritySet({ vp_section_letter: next, vp_onboarding_step: 2 });
                        clarityEvent("vp_student_section_selected");
                        void playSound("tap", { fromInteraction: true });
                      }}
                      data-testid="onboarding-section-tabs"
                      className="space-y-0"
                    >
                      <TabsList className="grid w-full grid-cols-3 gap-2 border-none bg-transparent p-0 shadow-none md:grid-cols-6">
                        {SECTION_OPTIONS.map((value) => (
                          <TabsTrigger
                            key={value}
                            value={value}
                            className="h-14 w-full justify-center px-2 text-lg"
                          >
                            {value}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                  </div>

                  <div className="flex items-center gap-2">
                    <MotionButton
                      motionPolicy={motionPolicy}
                      type="button"
                      variant="secondary"
                      size="icon"
                      aria-label="Back to name details"
                      onClick={() => {
                        setStep(1);
                        void playSound("tap", { fromInteraction: true });
                      }}
                    >
                      <img src={arrowLeftIcon} alt="" aria-hidden="true" className="h-4 w-4" />
                    </MotionButton>

                    <MotionButton
                      motionPolicy={motionPolicy}
                      type="submit"
                      disabled={busy || !stepTwoComplete}
                      className="flex-1"
                      onClick={() => {
                        void playSound("tap", { fromInteraction: true });
                      }}
                    >
                      {busy ? "Starting..." : "Start test"}
                    </MotionButton>
                  </div>
                </div>
              )}
            </form>
          </CardContent>
        )}

        {attemptId && question && (
          <CardContent>
            <AnimatePresence mode="wait">
              <motion.form
                key={question.id}
                className="card space-y-4"
                onSubmit={submitAnswer}
                {...questionTransition}
              >
                {showReadingPrelude && readingPrelude ? (
                  <>
                    <div className="grid gap-4">
                      <div className="dictation-visual aspect-[16/9] overflow-hidden rounded-2xl border border-[color:var(--line)] bg-white">
                        <img
                          src={readingPrelude.imageSrc}
                          alt={`Question ${question.displayOrder} sentence illustration`}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <p className="font-['Fraunces',serif] text-2xl leading-tight text-[color:var(--ink)]">
                        {`Q${question.displayOrder}. Read this sentence: ${readingPrelude.sentence}`}
                      </p>
                    </div>

                    <div className="flex justify-start">
                      <MotionButton
                        motionPolicy={motionPolicy}
                        type="button"
                        className="h-auto w-auto px-5 py-3 font-['Fraunces',serif] text-2xl leading-tight"
                        onClick={revealQuestion}
                      >
                        Show question
                      </MotionButton>
                    </div>
                  </>
                ) : (
                  <>
                    {question.itemType === "mcq" && (
                      <>
                        <div className="grid gap-3">
                          <p className="prompt font-['Fraunces',serif] text-2xl leading-tight text-[color:var(--ink)]">
                            {`Q${question.displayOrder}: ${activeQuestionPromptText}`}
                          </p>

                          {question.ttsText ? (
                            <div className="flex flex-wrap items-center gap-4">
                              <MotionButton
                                type="button"
                                variant="secondary"
                                motionPolicy={motionPolicy}
                                className="secondary w-fit"
                                data-testid="question-audio-button"
                                onClick={() => {
                                  void playSound("tap", { fromInteraction: true });
                                  void playQuestionAudio("manual");
                                }}
                                disabled={audioBusy || audioPlaying}
                              >
                                {!audioBusy && (
                                  <img src={playIcon} alt="" aria-hidden="true" className="h-4 w-4" />
                                )}
                                {audioBusy ? "Loading audio..." : "Play audio"}
                              </MotionButton>
                              <p className="min-h-5 text-xs font-semibold text-[color:var(--muted)]">
                                {audioStateHint}
                              </p>
                            </div>
                          ) : null}

                          {question.displayOrder === 1 && questionVisual
                            ? renderQuestionVisual("Question 1 illustration", "full-width")
                            : null}

                          {question.options && (
                            <div
                              className="option-grid grid gap-2"
                              role="radiogroup"
                              aria-label="Answer options"
                              style={{ gridTemplateColumns: `repeat(${question.options.length}, minmax(0, 1fr))` }}
                            >
                              {question.options.map((option) => {
                                const selected = answer === option;
                                return (
                                  <RadioOption
                                    key={option}
                                    motionPolicy={motionPolicy}
                                    variant="tile"
                                    selected={selected}
                                    label={toSentenceCase(option)}
                                    onSelect={() => {
                                      setAnswer(option);
                                      setQuestionClarityTags(question, {
                                        vp_audio_gate_locked: Boolean(question.ttsText) && !audioPlayedForQuestion,
                                        vp_progress_answered_count: answeredItems,
                                      });
                                      clarityEvent("vp_mcq_option_selected");
                                      void playSound("tap", { fromInteraction: true });
                                    }}
                                  />
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {question.itemType === "dictation" && (
                      <>
                        <p className="prompt font-['Fraunces',serif] text-2xl leading-tight text-[color:var(--ink)]">
                          {`Q${question.displayOrder}: Listen to the word and type what you hear.`}
                        </p>
                        {question.displayOrder === 2 ||
                        question.displayOrder === 4 ||
                        question.displayOrder === 6 ||
                        question.displayOrder === 8 ||
                        question.displayOrder === 10 ? (
                          <div className="grid gap-3">
                            {question.ttsText ? (
                              <div className="flex flex-wrap items-center gap-4">
                                <MotionButton
                                  type="button"
                                  variant="secondary"
                                  motionPolicy={motionPolicy}
                                  className="secondary w-fit"
                                  data-testid="question-audio-button"
                                  onClick={() => {
                                    void playSound("tap", { fromInteraction: true });
                                    void playQuestionAudio("manual");
                                  }}
                                  disabled={audioBusy || audioPlaying}
                                >
                                  {!audioBusy && (
                                    <img src={playIcon} alt="" aria-hidden="true" className="h-4 w-4" />
                                  )}
                                  {audioBusy ? "Loading audio..." : "Play audio"}
                                </MotionButton>
                                <p className="min-h-5 text-xs font-semibold text-[color:var(--muted)]">
                                  {audioStateHint}
                                </p>
                              </div>
                            ) : null}

                            {question.displayOrder === 2 || question.displayOrder === 4
                              ? renderQuestionVisual(
                                  `Question ${question.displayOrder} illustration`,
                                  "full-width",
                                )
                              : null}

                            <Label htmlFor="dictation-answer">Your answer</Label>
                            <Input
                              id="dictation-answer"
                              name={`dictation-answer-${question.displayOrder}`}
                              value={answer}
                              className="text-base font-semibold leading-6"
                              onChange={(event) => handleDictationAnswerChange(event.target.value)}
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="none"
                              spellCheck={false}
                              enterKeyHint="done"
                              data-lpignore="true"
                              required
                            />
                          </div>
                        ) : (
                          <div className="dictation-grid grid gap-3 md:grid-cols-[minmax(190px,36%)_1fr]">
                            {renderQuestionVisual("Picture clue")}

                            <div className="dictation-work grid content-start gap-3">
                              {question.ttsText ? (
                                <div className="flex flex-wrap items-center gap-4">
                                  <MotionButton
                                    type="button"
                                    variant="secondary"
                                    motionPolicy={motionPolicy}
                                    className="secondary w-fit"
                                    data-testid="question-audio-button"
                                    onClick={() => {
                                      void playSound("tap", { fromInteraction: true });
                                      void playQuestionAudio("manual");
                                    }}
                                    disabled={audioBusy || audioPlaying}
                                  >
                                    {!audioBusy && (
                                      <img src={playIcon} alt="" aria-hidden="true" className="h-4 w-4" />
                                    )}
                                    {audioBusy ? "Loading audio..." : "Play audio"}
                                  </MotionButton>
                                  <p className="min-h-5 text-xs font-semibold text-[color:var(--muted)]">
                                    {audioStateHint}
                                  </p>
                                </div>
                              ) : null}

                              <Label htmlFor="dictation-answer">Your answer</Label>
                              <Input
                                id="dictation-answer"
                                name={`dictation-answer-${question.displayOrder}`}
                                value={answer}
                                className="text-base font-semibold leading-6"
                                onChange={(event) => handleDictationAnswerChange(event.target.value)}
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="none"
                                spellCheck={false}
                                enterKeyHint="done"
                                data-lpignore="true"
                                required
                              />
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    <div className="flex justify-end">
                      <MotionButton
                        motionPolicy={motionPolicy}
                        type="submit"
                        data-testid="question-submit-button"
                        className="ml-auto h-auto w-auto px-5 py-3 font-['Fraunces',serif] text-2xl leading-tight"
                        disabled={
                          busy ||
                          !answer.trim() ||
                          !shownAtIso ||
                          audioGateLocked
                        }
                      >
                        {showReadySubmitIcon && (
                          <img src={starIcon} alt="" aria-hidden="true" className="h-[1.65rem] w-[1.65rem] shrink-0" />
                        )}
                        {submitLabel}
                      </MotionButton>
                    </div>
                  </>
                )}
              </motion.form>
            </AnimatePresence>
          </CardContent>
        )}

        {completion && (
          <CardContent>
            <motion.div
              className="card items-center justify-items-center gap-4 text-center"
              initial={motionPolicy === "full" ? { opacity: 0, y: 10 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: motionPolicy === "full" ? 0.24 : 0.01 }}
            >
              <img
                src={imageComplete}
                alt="Baseline complete"
                loading="lazy"
                className="h-auto w-full max-w-[260px]"
              />
              <h3 className="font-['Fraunces',serif] text-4xl leading-tight">Baseline Complete</h3>
              <p className="text-base font-semibold text-[color:var(--ink)]">
                The only way to go from here is UP!
              </p>
              <div className="inline-flex items-center gap-2 text-2xl font-semibold leading-tight text-[color:var(--ink)]">
                <img
                  src={starIcon}
                  alt=""
                  aria-hidden="true"
                  className="h-6 w-6 shrink-0"
                  style={{ filter: "brightness(0)" }}
                />
                {`Collected: ${completion.stars}`}
              </div>
            </motion.div>
          </CardContent>
        )}
      </Card>

      {error && <Alert variant="destructive" className={attemptId ? "mt-4" : undefined}>{error}</Alert>}
    </section>
  );
}
