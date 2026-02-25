# PM-DS-013 Main Page Header/Layout Redesign

## Locked Decisions
1. Student entry state shows centered `logo-vocabpal.png` at 250px width and centered subtitle `Vocabulary Baseline Test` inside the form card.
2. Student active state (after attempt start) shows utility-row logo at top-left with 200px width and no subtitle.
3. Teacher login and teacher internal screens follow the same state behavior pattern.
4. Logo is bundled from `web/src/assets/branding/logo-vocabpal.png` copied from repo root assets.
5. Entry cards use logo/subtitle branding without duplicated hero headline copy.

## File-Level Implementation Map
1. `web/src/components/app-shell.tsx`
   - Remove hero card block.
   - Add background utility row with conditional left logo and right controls (`Sound`, then `Student/Teacher`).
   - Keep config error alert below utility row.
2. `web/src/App.tsx`
   - Add state wiring for student attempt active / teacher auth active.
   - Compute and pass `showUtilityLogo` and `utilityLogoSrc` to app shell.
3. `web/src/features/student/student-mode.tsx`
   - Add `onAttemptStateChange` callback prop.
   - Entry card header: centered logo + subtitle.
   - Internal states: keep existing title/description.
4. `web/src/features/teacher/teacher-mode.tsx`
   - Add `onAuthStateChange` callback prop.
   - Login card header: centered logo + subtitle.
   - Internal states: keep existing dashboard headings.
5. `web/src/assets/branding/logo-vocabpal.png`
   - New bundled branding asset used by shell + mode screens.

## Acceptance Criteria
1. Hero container is removed from the background layout.
2. Student entry card contains centered 250px logo and centered `Vocabulary Baseline Test` subtitle.
3. Teacher login card contains centered 250px logo and centered `Vocabulary Baseline Test` subtitle.
4. On student active and teacher authenticated screens, a 200px logo appears left in the utility row.
5. Utility row controls are ordered: `Sound` first, `Student/Teacher` second.
6. Existing student and teacher workflows remain functional.

## Regression Checklist
1. `npm --prefix web run typecheck`
2. `npm --prefix web run lint`
3. `npm --prefix web run build`
4. Visual checks:
   - `/` student entry
   - `/` student active
   - `/` teacher login
   - `/` teacher internal
5. Config error alert still renders in missing-env state.

## Rollback Notes
1. Revert app shell to previous hero card implementation in `web/src/components/app-shell.tsx`.
2. Remove callback wiring in `web/src/App.tsx`, `student-mode.tsx`, and `teacher-mode.tsx`.
3. Remove `web/src/assets/branding/logo-vocabpal.png` if no other feature references it.
