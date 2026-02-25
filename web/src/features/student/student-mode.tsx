import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
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
import { callFunction } from "@/lib/env";
import type { Question, StudentComplete } from "@/features/shared/types";
import { DICTATION_IMAGE_BY_ORDER, TOTAL_QUESTION_COUNT } from "@/features/student/dictation-images";
import logoVocabPal from "@/assets/branding/logo-vocabpal.png";
import arrowLeftIcon from "@/assets/icons/arrow-left.svg";
import playIcon from "@/assets/icons/play.svg";
import starIcon from "@/assets/icons/star.svg";

type StudentModeProps = {
  motionPolicy: MotionPolicy;
  playSound: (event: SfxEvent, options?: { fromInteraction?: boolean }) => Promise<boolean>;
  onAttemptStateChange?: (active: boolean) => void;
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

export function StudentMode({
  motionPolicy,
  playSound,
  onAttemptStateChange,
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
  const [error, setError] = useState<string | null>(null);

  const autoPlayedQuestionIdRef = useRef<string | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  const progressPercent = useMemo(() => {
    return Math.min(100, (answeredItems / TOTAL_QUESTION_COUNT) * 100);
  }, [answeredItems]);

  const dictationImage = useMemo(() => {
    if (!question || question.itemType !== "dictation") return null;
    return DICTATION_IMAGE_BY_ORDER[question.displayOrder] ?? null;
  }, [question]);

  const playQuestionAudio = useCallback(
    async (source: "auto" | "manual") => {
      if (!question || !question.ttsText) return;

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
        };
        player.onerror = () => {
          setAudioPlaying(false);
        };
        activeAudioRef.current = player;
        await player.play();
        setAudioPlaying(true);
      } catch (err) {
        setAudioPlaying(false);
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
    [question, playSound],
  );

  useEffect(() => {
    if (!question) return;

    setShownAtIso(new Date().toISOString());
    setAnswer("");
    setAudioPlaying(false);
    setAudioPlayedForQuestion(false);

    if (autoPlayedQuestionIdRef.current !== question.id && question.ttsText) {
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

  const startAttempt = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!classNumber || !sectionLetter) {
        setError("Please select class and section.");
        return;
      }

      setBusy(true);
      setError(null);

      try {
        const className = `Class ${classNumber} - Section ${sectionLetter}`;
        const result = await callFunction<StartAttemptResponse>("student-start-attempt", {
          method: "POST",
          body: { firstName, lastName, className },
        });

        setAttemptId(result.attemptId);
        setQuestion(result.firstQuestion ?? result.nextQuestion ?? null);
        setAnsweredItems(result.progress.answeredItems);
        setCompletion(null);
        void playSound("progress", { fromInteraction: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start attempt");
        void playSound("error", { fromInteraction: true });
      } finally {
        setBusy(false);
      }
    },
    [classNumber, firstName, lastName, playSound, sectionLetter],
  );

  const submitAnswer = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!attemptId || !question || !answer.trim()) return;

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
        setAnsweredItems(submit.progress.answeredItems);
        setQuestion(submit.nextQuestion);

        if (submit.nextQuestion) {
          void playSound("progress", { fromInteraction: true });
        } else {
          const complete = await callFunction<StudentComplete>("student-complete-attempt", {
            method: "POST",
            body: { attemptId },
          });
          setCompletion(complete);
          void playSound("end", { fromInteraction: true });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to submit answer");
        void playSound("error", { fromInteraction: true });
      } finally {
        setBusy(false);
      }
    },
    [answer, attemptId, playSound, question, shownAtIso],
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
  const submitLabel = busy
    ? "Submitting..."
    : audioGateLocked
      ? (audioBusy ? "Waiting for Audio" : audioPlaying ? "Audio playing" : "Waiting for Audio")
      : "Submit answer";
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

  return (
    <section
      className={
        attemptId
          ? "space-y-4"
          : "flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center gap-12"
      }
      aria-label="student-mode"
    >
      {!attemptId && (
        <div className="flex flex-col items-center gap-[8px] px-2 text-center">
          <img src={logoVocabPal} alt="VocabPal" className="h-auto w-[250px] max-w-full" />
          <p className="text-base font-semibold text-[color:var(--ink)]">English Vocabulary Revision</p>
        </div>
      )}

      {attemptId && question && (
        <div className="space-y-2">
          <div className="flex items-center justify-end">
            <Badge data-testid="question-counter">{`Question ${question.displayOrder} of ${TOTAL_QUESTION_COUNT}`}</Badge>
          </div>
          <Progress value={progressPercent} />
        </div>
      )}

      <Card className={!attemptId ? "w-full max-w-[450px]" : undefined}>
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
                    required
                  />

                  <Label htmlFor="student-last-name">Last Name</Label>
                  <Input
                    id="student-last-name"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
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
                        void playSound("tap", { fromInteraction: true });
                      }}
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
                        void playSound("tap", { fromInteraction: true });
                      }}
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
                {question.itemType === "mcq" && (
                  <>
                    <p className="prompt rounded-xl border-l-4 border-[color:var(--accent)] bg-white px-4 py-3 font-['Fraunces',serif] text-2xl leading-tight text-[color:var(--ink)]">
                      {question.promptText}
                    </p>

                    {question.ttsText && (
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
                    )}

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
                              label={option}
                              onSelect={() => {
                                setAnswer(option);
                                void playSound("tap", { fromInteraction: true });
                              }}
                            />
                          );
                        })}
                      </div>
                    )}
                  </>
                )}

                {question.itemType === "dictation" && (
                  <>
                    <p className="prompt rounded-xl border-l-4 border-[color:var(--accent)] bg-white px-4 py-3 font-['Fraunces',serif] text-2xl leading-tight text-[color:var(--ink)]">
                      Listen to the word and type what you hear.
                    </p>
                    <div className="dictation-grid grid gap-3 md:grid-cols-[minmax(190px,36%)_1fr]">
                      <div className="dictation-visual flex min-h-[190px] items-center justify-center rounded-2xl border border-[color:var(--line)] bg-white p-3">
                        {dictationImage ? (
                          <img src={dictationImage} alt="Picture clue" loading="lazy" className="h-auto max-w-[220px] w-full" />
                        ) : (
                          <div className="dictation-placeholder text-sm font-semibold text-[color:var(--muted)]">Picture clue</div>
                        )}
                      </div>

                      <div className="dictation-work grid content-start gap-3">
                        {question.ttsText && (
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
                        )}

                        <Label htmlFor="dictation-answer">Your answer</Label>
                        <Input
                          id="dictation-answer"
                          value={answer}
                          className="text-base font-semibold leading-6"
                          onChange={(event) => setAnswer(event.target.value)}
                          required
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="flex justify-end">
                  <MotionButton
                    motionPolicy={motionPolicy}
                    type="submit"
                    data-testid="question-submit-button"
                    className="ml-auto w-auto px-5 font-['Fraunces',serif] text-2xl leading-tight"
                    disabled={
                      busy ||
                      !answer.trim() ||
                      audioGateLocked
                    }
                  >
                    <img src={starIcon} alt="" aria-hidden="true" className="h-4 w-4" />
                    {submitLabel}
                  </MotionButton>
                </div>
              </motion.form>
            </AnimatePresence>
          </CardContent>
        )}

        {completion && (
          <CardContent>
            <motion.div
              className="card border-l-4 border-l-[#2f8b58]"
              initial={motionPolicy === "full" ? { opacity: 0, y: 10 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: motionPolicy === "full" ? 0.24 : 0.01 }}
            >
              <h3 className="font-['Fraunces',serif] text-2xl">Test Complete</h3>
              <p>Stars Collected: {completion.stars}</p>
              <p>Score: {completion.totalScore10} / 10</p>
              <p>Placement Stage: {completion.placementStage}</p>
              <p>Instructional Need: {completion.instructionalNeed}</p>
            </motion.div>
          </CardContent>
        )}
      </Card>

      {error && <Alert variant="destructive">{error}</Alert>}
    </section>
  );
}
