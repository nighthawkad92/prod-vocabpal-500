# PM-ANL-001 Microsoft Clarity Student Journey

## Objective
Instrument the student baseline journey in Microsoft Clarity with production-only gating, no PII leakage, and enough milestone/action tags to reconstruct funnel drop-off and question-level behavior.

## Locked Implementation Decisions
1. Integration method: official Clarity script (`https://www.clarity.ms/tag/<project_id>`), no npm wrapper.
2. Runtime gate: enabled only when `import.meta.env.PROD`, `VITE_CLARITY_ENABLED === "true"`, and `VITE_CLARITY_PROJECT_ID` is set.
3. Identity policy: use pseudonymous `attempt_alias` derived from SHA-256 of `attemptId` (truncated), never send student names.
4. Tag policy: allowlist-only keys/events (`vp_*`) through a typed wrapper.
5. Granularity: funnel milestones + key question actions (audio, select/input, submit, result).

## File Map
1. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/web/src/lib/clarity.ts`
2. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/web/src/types/global.d.ts`
3. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/web/src/App.tsx`
4. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/web/src/features/student/student-mode.tsx`
5. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/.env.example`

## Event Taxonomy (Core)
1. Entry: `vp_student_entry_viewed`, `vp_student_step1_next_clicked`, class/section selection, start requested/started/failed.
2. Question: viewed, reading prelude viewed, show question clicked, audio requested/started/ended/failed, mcq selected, dictation input started.
3. Submit: requested/success/failed and `vp_answer_correct` / `vp_answer_wrong`.
4. Completion: `vp_attempt_completed`, `vp_completion_viewed`.

## Tag Taxonomy (Core)
1. App context: mode, motion policy, sound enabled, student view state.
2. Student context: onboarding step, class number, section letter.
3. Attempt/question context: attempt alias, question order/type/stage, prelude presence, audio gate state, answered progress.
4. Outcome/error context: score/correct/wrong/stars/stage and error surface/category.

## QA Gates
1. `npm --prefix web run typecheck`
2. `npm --prefix web run lint`
3. `npm --prefix web run build`
4. Manual funnel smoke with prefixed test student names (example `CLARITYQA_*`) for easy cleanup.
5. Manual no-PII verification in emitted tags/events (no raw first/last/class string values).

## Credential Checkpoints
1. `CP-08-CLARITY-PROJECT`: create/get Clarity project id.
2. `CP-09-VERCEL-ENV-CLARITY`: add production env vars in Vercel and redeploy.

## Rollback
1. Set `VITE_CLARITY_ENABLED=false` in Vercel and redeploy to disable collection without code rollback.
2. Optional code rollback target: remove wrapper import calls from `App.tsx` and `student-mode.tsx`.
