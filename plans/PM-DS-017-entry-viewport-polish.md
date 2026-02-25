# PM-DS-017 Entry Viewport + Form Copy Polish

## Locked Decisions
1. Entry state lockup and form must be vertically centered within viewport height.
2. Entry form max width is `450px`.
3. Gap between logo lockup and form is `24px`.
4. Entry title changes from `Vocabulary Baseline Test` to `Baseline Test`.
5. Entry title alignment is left inside form cards.
6. Remove onboarding progress bar.
7. Student entry subtitle text:
1. Step 1: `Step 1 of 2: Enter your full name`
2. Step 2: `Step 2 of 2: Choose your class and section`
8. Remove `Complete each question carefully.` text from entry flow copy.

## File-Level Implementation Map
1. `web/src/features/student/student-mode.tsx`
1. Entry section switched to viewport-centered layout when no attempt is active.
2. Entry card constrained to `max-w-[450px]`.
3. Entry heading updated to `Baseline Test`, left aligned.
4. Dynamic step subtitle added per onboarding step.
5. Onboarding progress bar block removed; quiz progress bar retained for active attempt mode.
6. Active attempt description text simplified to remove old sentence.
2. `web/src/features/teacher/teacher-mode.tsx`
1. Teacher login entry switched to viewport-centered layout.
2. Teacher login card constrained to `max-w-[450px]`.
3. Teacher login heading updated to `Baseline Test`, left aligned.

## Acceptance Checklist
1. Student and teacher entry states are vertically centered in viewport.
2. Student and teacher entry forms do not exceed `450px` width.
3. Logo lockup-to-form spacing is `24px` (`gap-6`).
4. Entry title is `Baseline Test` and left aligned.
5. Entry copy `Complete each question carefully.` is removed.
6. Student entry shows required step subtitles for step 1 and step 2.
7. Student entry onboarding progress bar is removed.
8. Student active attempt flow continues to function, including question progress bar.

## QA Notes
1. Run:
1. `npm --prefix web run typecheck`
2. `npm --prefix web run lint`
3. `npm --prefix web run build`
2. Manual confirmation:
1. Student entry step 1 and step 2 states
2. Teacher login state
3. Student active attempt state
