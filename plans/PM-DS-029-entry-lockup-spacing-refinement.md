# PM-DS-029 Entry Lockup Spacing Refinement

## Locked Decisions
1. Increase vertical gap between logo lockup and form card to `48px`.
2. Set internal lockup vertical gap (logo + subtitle) to `8px`.
3. Apply to both student entry and teacher login entry states.
4. No logic/backend/API/schema changes.

## File-Level Implementation Map
1. `web/src/features/student/student-mode.tsx`
1. Entry-state container gap updated from `gap-6` to `gap-12`.
2. Lockup internal gap set to explicit `gap-[8px]`.
2. `web/src/features/teacher/teacher-mode.tsx`
1. Entry-state container gap updated from `gap-6` to `gap-12`.
2. Lockup internal gap set to explicit `gap-[8px]`.

## Acceptance Checklist
1. Student entry lockup-to-form spacing is 48px.
2. Teacher entry lockup-to-form spacing is 48px.
3. Student and teacher lockup internals are 8px.
4. No regression in login/start flow.

## QA Notes
1. Run:
1. `npm --prefix web run typecheck`
2. `npm --prefix web run lint`
3. `npm --prefix web run build`
2. Manual check:
1. verify spacing values in both entry states.
