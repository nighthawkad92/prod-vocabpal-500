# PM-ANL-007 Teacher AI Copilot Tabbed Refactor (Implemented)

## Scope
1. Added teacher dashboard tabs: `Attempts` and `AI Copilot`.
2. Moved AI Copilot into dedicated tab; class rows/attempt list remain in Attempts tab.
3. Reduced AI intents to: `class_snapshot`, `students_need_support`, `slow_questions`.
4. Removed AI trigger chips, recommended actions, and session history.
5. Removed attempt-status filtering in AI; backend enforces completed-only analytics.
6. Added class-scope multi-select and timeframe options: `Last 24 hours`, `Last 7 days`, `Last 30 days`, `All time`.
7. Enabled full AI Copilot on mobile with mobile filter bottom sheet.
8. Reworked Support Priority to reading-stage buckets (Stage 0->4, then Unassigned).

## Backend Contract
1. Endpoint unchanged: `POST /functions/v1/teacher-ai-query`.
2. Request filter contract:
- `classNames?: string[]`
- `timeframe?: "24h" | "7d" | "30d" | "all"`
- `limit?: number`
3. Compatibility mappings:
- `className` -> `classNames[0]`
- `today` -> `24h`
4. Response contract removes `actions`.
5. `students_need_support` deterministic dataset now groups by latest completed attempt stage.

## UX/IA
1. Tabs are rendered above class rows.
2. AI tab auto-runs all 3 sections in parallel on tab open and filter changes.
3. Section loading/errors are isolated per section.
4. Last successful section data remains visible during refresh.
5. Mobile AI is fully available; filter controls use bottom-sheet interaction.

## Files Updated
1. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/supabase/functions/_shared/teacher_analytics.ts`
2. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/supabase/functions/teacher-ai-query/index.ts`
3. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/supabase/functions/_shared/ai.ts`
4. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/web/src/features/shared/types.ts`
5. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/web/src/features/teacher/teacher-mode.tsx`
6. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/web/src/features/teacher/teacher-ai-panel.tsx`
7. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/web/src/lib/design-system.ts`
8. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/web/src/features/design-system/components-section.tsx`
9. `/Users/akashdatta/Desktop/prod-vocabpal-baseline-500/web/src/features/design-system/design-system-page.tsx`

## Validation
1. `npm --prefix web run typecheck` passed.
2. `npm --prefix web run lint` passed.
3. `npm --prefix web run build` passed.
4. `npm run qa:remote` and `npm run qa:release-gate` blocked locally due missing env (`APP_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `TEACHER_PASSCODE`).

## Rollback
1. Revert the commit containing PM-ANL-007 files.
2. Restore previous AI panel behavior (guided chips + desktop-only rendering).
