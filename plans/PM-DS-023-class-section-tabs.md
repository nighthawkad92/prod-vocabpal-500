# PM-DS-023 Class/Section Selector Tabs Conversion

## Locked Decisions
1. Replace student onboarding step-2 class/section `RadioOption` controls with `Tabs`.
2. Keep class options `1-6` and section options `A-F`.
3. Keep existing step flow, validation, and payload format unchanged.
4. Keep existing tap/click sound behavior.
5. No backend/API/schema changes.

## File-Level Implementation Map
1. `web/src/features/student/student-mode.tsx`
1. Remove `RadioOption` usage for class and section selectors.
2. Introduce `Tabs`, `TabsList`, and `TabsTrigger` controls for both groups.
3. Add safe parsing helpers to map tab values into `ClassNumber` and `SectionLetter` union types.
4. Preserve `Start test` enablement logic and `Class N - Section X` payload composition.

## Acceptance Checklist
1. Step-2 class selector renders as tabs controls, not radio option cards.
2. Step-2 section selector renders as tabs controls, not radio option cards.
3. Selecting class/section updates state and keeps `Start test` gating intact.
4. No regressions to onboarding navigation (`Next`, back icon, `Start test`).

## QA Notes
1. Run:
1. `npm --prefix web run typecheck`
2. `npm --prefix web run lint`
3. `npm --prefix web run build`
2. Manual check:
1. Student step-2 selector UX is lighter and matches tabs behavior.
