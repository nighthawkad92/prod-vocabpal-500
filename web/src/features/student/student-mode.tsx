import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MotionButton } from "@/components/motion-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import type { MotionPolicy } from "@/hooks/use-motion-policy";
import type { SfxEvent } from "@/lib/sfx";
import { callFunction } from "@/lib/env";
import type { Question, StudentComplete } from "@/features/shared/types";
import { DICTATION_IMAGE_BY_ORDER, TOTAL_QUESTION_COUNT } from "@/features/student/dictation-images";

type StudentModeProps = {
  motionPolicy: MotionPolicy;
  playSound: (event: SfxEvent, options?: { fromInteraction?: boolean }) => Promise<boolean>;
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

export function StudentMode({ motionPolicy, playSound }: StudentModeProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [className, setClassName] = useState("Class A");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState("");
  const [shownAtIso, setShownAtIso] = useState("");
  const [answeredItems, setAnsweredItems] = useState(0);
  const [completion, setCompletion] = useState<StudentComplete | null>(null);
  const [busy, setBusy] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioPlayedForQuestion, setAudioPlayedForQuestion] = useState(false);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
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
          activeAudioRef.current.pause();
          activeAudioRef.current.currentTime = 0;
        }

        const player = new Audio(result.audioUrl);
        activeAudioRef.current = player;
        await player.play();
        setAudioPlayedForQuestion(true);
        setAudioNotice(null);
      } catch (err) {
        if (source === "auto") {
          setAudioNotice("Audio autoplay was blocked. Tap Play Audio.");
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
    setAudioPlayedForQuestion(false);
    setAudioNotice(null);

    if (autoPlayedQuestionIdRef.current !== question.id && question.ttsText) {
      autoPlayedQuestionIdRef.current = question.id;
      void playQuestionAudio("auto");
    }
  }, [question, playQuestionAudio]);

  useEffect(() => {
    return () => {
      if (!activeAudioRef.current) return;
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    };
  }, []);

  const startAttempt = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setBusy(true);
      setError(null);

      try {
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
    [className, firstName, lastName, playSound],
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

  return (
    <section className="space-y-4" aria-label="student-mode">
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="text-4xl">Student Baseline Test</CardTitle>
          <CardDescription>
            Complete each question carefully. Audio must be played before submit.
          </CardDescription>
        </CardHeader>

        {!attemptId && (
          <CardContent>
            <form className="card grid gap-3" onSubmit={startAttempt}>
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

              <Label htmlFor="student-class-name">Class</Label>
              <Input
                id="student-class-name"
                value={className}
                onChange={(event) => setClassName(event.target.value)}
                required
              />

              <MotionButton
                motionPolicy={motionPolicy}
                type="submit"
                disabled={busy}
                onClick={() => {
                  void playSound("tap", { fromInteraction: true });
                }}
              >
                {busy ? "Starting..." : "Start Baseline"}
              </MotionButton>
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
                <div className="meta-row flex items-center justify-between gap-3 text-sm text-[color:var(--muted)]">
                  <span>{`Question ${question.displayOrder} / ${TOTAL_QUESTION_COUNT}`}</span>
                  <Badge>{`${answeredItems}/${TOTAL_QUESTION_COUNT} answered`}</Badge>
                </div>

                <Progress value={progressPercent} />

                {question.itemType === "mcq" && (
                  <>
                    <p className="prompt rounded-xl border-l-4 border-[color:var(--accent)] bg-white px-4 py-3 text-base text-[color:var(--ink)]">
                      {question.promptText}
                    </p>

                    {question.ttsText && (
                      <MotionButton
                        type="button"
                        variant="secondary"
                        motionPolicy={motionPolicy}
                        className="secondary"
                        onClick={() => {
                          void playSound("tap", { fromInteraction: true });
                          void playQuestionAudio("manual");
                        }}
                        disabled={audioBusy}
                      >
                        {audioBusy ? "Loading audio..." : "Play Audio"}
                      </MotionButton>
                    )}

                    {audioNotice && <Alert>{audioNotice}</Alert>}
                    {question.ttsText && !audioPlayedForQuestion && (
                      <Alert>Play audio before submitting.</Alert>
                    )}

                    {question.options && (
                      <div className="option-grid grid gap-2">
                        {question.options.map((option) => {
                          const selected = answer === option;
                          return (
                            <MotionButton
                              key={option}
                              type="button"
                              variant={selected ? "default" : "secondary"}
                              motionPolicy={motionPolicy}
                              className={`option justify-start ${selected ? "selected" : ""}`}
                              onClick={() => {
                                setAnswer(option);
                                void playSound("tap", { fromInteraction: true });
                              }}
                            >
                              {option}
                            </MotionButton>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}

                {question.itemType === "dictation" && (
                  <>
                    <p className="prompt rounded-xl border-l-4 border-[color:var(--accent)] bg-white px-4 py-3 text-base text-[color:var(--ink)]">
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
                            className="secondary"
                            onClick={() => {
                              void playSound("tap", { fromInteraction: true });
                              void playQuestionAudio("manual");
                            }}
                            disabled={audioBusy}
                          >
                            {audioBusy ? "Loading audio..." : "Play Audio"}
                          </MotionButton>
                        )}

                        {audioNotice && <Alert>{audioNotice}</Alert>}
                        {question.ttsText && !audioPlayedForQuestion && (
                          <Alert>Play audio before submitting.</Alert>
                        )}

                        <Label htmlFor="dictation-answer">Your answer</Label>
                        <Input
                          id="dictation-answer"
                          value={answer}
                          onChange={(event) => setAnswer(event.target.value)}
                          required
                        />
                      </div>
                    </div>
                  </>
                )}

                <MotionButton
                  motionPolicy={motionPolicy}
                  type="submit"
                  disabled={
                    busy ||
                    !answer.trim() ||
                    (Boolean(question.ttsText) && !audioPlayedForQuestion)
                  }
                >
                  {busy ? "Submitting..." : "Submit Answer"}
                </MotionButton>
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
