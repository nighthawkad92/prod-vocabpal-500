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
import { callFunction } from "@/lib/env";
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
  const [error, setError] = useState<string | null>(null);

  const autoPlayedQuestionIdRef = useRef<string | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

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
  const showReadySubmitIcon = !busy && !audioGateLocked;
  const stepOneComplete = firstName.trim().length > 0 && lastName.trim().length > 0;
  const stepTwoComplete = Boolean(classNumber && sectionLetter);
  const isCompletionView = Boolean(attemptId && completion && !question);
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
    setShowReadingPrelude(false);
    setShownAtIso(new Date().toISOString());
    void playSound("tap", { fromInteraction: true });

    if (question?.ttsText && autoPlayedQuestionIdRef.current !== question.id) {
      autoPlayedQuestionIdRef.current = question.id;
      void playQuestionAudio("auto");
    }
  }, [playQuestionAudio, playSound, question]);

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
            <Badge className="ml-auto gap-1">
              <img
                src={starIcon}
                alt=""
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0"
                style={{ filter: "brightness(0)" }}
              />
              {`Collected ${answeredItems}`}
            </Badge>
          </div>
          <Progress value={progressPercent} />
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

                            {question.displayOrder === 2 || question.displayOrder === 4
                              ? renderQuestionVisual(
                                  `Question ${question.displayOrder} illustration`,
                                  "full-width",
                                )
                              : null}

                            <Label htmlFor="dictation-answer">Your answer</Label>
                            <Input
                              id="dictation-answer"
                              value={answer}
                              className="text-base font-semibold leading-6"
                              onChange={(event) => setAnswer(event.target.value)}
                              required
                            />
                          </div>
                        ) : (
                          <div className="dictation-grid grid gap-3 md:grid-cols-[minmax(190px,36%)_1fr]">
                            {renderQuestionVisual("Picture clue")}

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
