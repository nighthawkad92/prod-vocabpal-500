# PM-DS-025 Entry Type-Scale Mapping Update

## Locked Decisions
1. `Baseline Test` should use `Card Title` type scale.
2. `Step X of 2:` should use `Meta / Caption` type scale.
3. `Enter your full name` / `Choose your class and section` should use `Body Large` type scale.
4. Keep subtitle content split into role-based text segments.
5. No backend/API/schema changes.

## File-Level Implementation Map
1. `web/src/features/student/student-mode.tsx`
1. Convert entry subtitle to two mapped segments:
1. meta segment (`Step X of 2:`)
2. body-large segment (step instruction text)
2. Update `Baseline Test` heading class to card-title scale.
2. `web/src/features/teacher/teacher-mode.tsx`
1. Update entry `Baseline Test` heading class to card-title scale for consistency.

## Acceptance Checklist
1. Student entry title `Baseline Test` visually maps to card-title scale.
2. Teacher entry title `Baseline Test` visually maps to card-title scale.
3. Student subtitle split maps to meta + body-large styles.
4. Step 1 and Step 2 subtitle text remains correct.

## QA Notes
1. Run:
1. `npm --prefix web run typecheck`
2. `npm --prefix web run lint`
3. `npm --prefix web run build`
2. Manual check:
1. Student entry step 1 and step 2 typography hierarchy.
2. Teacher entry typography parity for title.
