# PM-DS-015 Header + Onboarding UX Refresh

## Locked Decisions
1. Student/Teacher toggle uses the same white-shell container style as the Sound control.
2. Entry/login states show centered logo above card (`250px`) with `English Vocabulary Revision` below.
3. Entry/login cards show `Vocabulary Baseline Test` as the in-card heading.
4. Internal states keep compact utility-row logo (`200px`) at top-left.
5. Student onboarding becomes two-step:
1. Step 1: first name + last name
2. Step 2: class (1-6) + section (A-F)
6. Stepper style is text + progress bar (`Step X of 2` and percent complete).
7. CTA labels:
1. Step 1: `Next`
2. Step 2: `Start test`
8. Step 2 includes icon-only back button using bundled `arrow-left.svg`.
9. Backend contract stays unchanged by serializing `className` as `Class N - Section X`.

## File-Level Implementation Map
1. `web/src/components/app-shell.tsx`
1. Applied white-shell parity for Student/Teacher toggle container to match Sound shell treatment.
2. Kept right-side order: Sound first, Student/Teacher second.
2. `web/src/features/student/student-mode.tsx`
1. Added entry-state outside branding block (logo + English line).
2. Changed entry card header to in-card title `Vocabulary Baseline Test`.
3. Replaced single-step start form with two-step onboarding flow and stepper.
4. Added touch-friendly class/section tap grids (1-6, A-F) using `RadioOption`.
5. Added icon-only back control on step 2.
6. Serialized class/section into existing `className` payload field.
3. `web/src/features/teacher/teacher-mode.tsx`
1. Added entry-state outside branding block (logo + English line).
2. Changed login card header to in-card title `Vocabulary Baseline Test`.
4. `web/src/assets/icons/arrow-left.svg`
1. Copied from root `assets/icons/arrow-left.svg` for web-bundled runtime usage.

## Acceptance Checklist
1. Student/Teacher toggle appears in white shell matching Sound shell styling language.
2. Student login state shows outside logo and `English Vocabulary Revision`.
3. Student entry card title is `Vocabulary Baseline Test`.
4. Teacher login state shows outside logo and `English Vocabulary Revision`.
5. Teacher login card title is `Vocabulary Baseline Test`.
6. Student stepper shows `Step 1 of 2` then `Step 2 of 2` with progress bar updates.
7. Step 1 CTA label is `Next`; step 2 CTA label is `Start test`.
8. Step 2 has icon-only back button using bundled arrow icon.
9. Student start payload sends `className` formatted as `Class N - Section X`.
10. Student/teacher active internal states keep utility-row compact logo behavior.

## QA Matrix and Screenshot Targets
1. Static gates:
1. `npm --prefix web run typecheck`
2. `npm --prefix web run lint`
3. `npm --prefix web run build`
2. Visual checks:
1. student entry step 1
2. student entry step 2
3. student active state
4. teacher login state
5. teacher internal state
6. utility-row close-up (Sound + Student/Teacher parity)
3. Data checks:
1. verify `student-start-attempt` request body class value format
2. verify teacher attempt records continue rendering class string without regression

## Rollback Notes
1. Revert `web/src/features/student/student-mode.tsx` to single-step start form with direct class input.
2. Revert `web/src/features/teacher/teacher-mode.tsx` entry header back to previous in-card branding placement.
3. Revert `web/src/components/app-shell.tsx` mode toggle wrapper to previous non-shell treatment.
4. Remove `web/src/assets/icons/arrow-left.svg` if no longer referenced.
