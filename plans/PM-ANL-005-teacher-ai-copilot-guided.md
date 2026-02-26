# PM-ANL-005 Teacher AI Copilot (Guided Prompt Chips + Structured Responses)

## 1. Summary
1. Add a teacher-only AI copilot for guided analytics questions.
2. Use guided prompt chips (no free-form SQL or unrestricted prompt input).
3. Return structured output: summary, insights, actions, chart spec, table rows, source metrics.
4. Keep chat history session-only (frontend state only).
5. Keep rollout desktop/tablet first with a mobile fallback notice.

## 2. Locked Decisions
1. Backend endpoint: `POST /functions/v1/teacher-ai-query`.
2. Intent set:
1. `class_snapshot`
2. `students_need_support`
3. `slow_questions`
4. `class_comparison`
5. `next_steps`
3. Backend resolves deterministic metrics first, then optional OpenAI language patch.
4. If OpenAI fails/times out, deterministic fallback is returned.
5. No transcript persistence in DB.

## 3. File Map
1. Backend:
1. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/supabase/functions/teacher-ai-query/index.ts`
2. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/supabase/functions/teacher-ai-query/deno.json`
3. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/supabase/functions/_shared/ai.ts`
4. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/supabase/functions/_shared/teacher_analytics.ts`
2. Frontend:
1. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/web/src/features/shared/types.ts`
2. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/web/src/features/teacher/teacher-ai-panel.tsx`
3. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/web/src/features/teacher/teacher-ai-chart.tsx`
4. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/web/src/features/teacher/teacher-mode.tsx`
3. Design system docs:
1. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/web/src/lib/design-system.ts`
2. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/web/src/features/design-system/components-section.tsx`
3. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/web/src/features/design-system/design-system-page.tsx`
4. Env docs:
1. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/.env.example`

## 4. API Contract
1. Request:
1. `intent`: one of guided intents
2. `filters`: `{ className?, timeframe?, status?, limit? }`
2. Response:
1. `requestId`
2. `intent`
3. `summary`
4. `insights[]`
5. `actions[]`
6. `chart`
7. `tableRows[]`
8. `sourceMetrics`
9. `fallbackUsed`

## 5. UX Contract
1. Desktop/tablet:
1. Show AI copilot card in teacher dashboard.
2. Guided chips trigger requests.
3. Response renders structured sections + lightweight chart.
4. Session-only query history chips are visible in current page session.
2. Mobile (`<=768px`):
1. Show compact fallback note: AI insights are available on larger screens.

## 6. Env + Checkpoints
1. Frontend flags:
1. `VITE_TEACHER_AI_ENABLED=false` (default)
2. Backend secrets:
1. `OPENAI_API_KEY`
2. `OPENAI_MODEL` (default `gpt-4.1-mini`)
3. Checkpoints:
1. `CP-10-OPENAI-SUPABASE-SECRET`
2. `CP-11-VERCEL-ENV-TEACHER-AI`

## 7. Validation Gates
1. `npm --prefix web run typecheck`
2. `npm --prefix web run lint`
3. `npm --prefix web run build`
4. Contract checks:
1. Auth errors return 401 and UI handles gracefully.
2. Fallback path returns deterministic response when OpenAI is unavailable.
3. No transcript persistence.

## 8. Rollback
1. Set `VITE_TEACHER_AI_ENABLED=false` to hide frontend copilot immediately.
2. Keep function deployed; disable usage by UI flag if issues arise.
3. Revert UI integration commit if rendering regressions appear.
