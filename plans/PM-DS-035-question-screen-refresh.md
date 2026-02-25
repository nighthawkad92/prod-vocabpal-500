# PM-DS-035 Question Screen Visual Refresh (Counter, Type Scale, Icons, Option Layout)

## Locked Decisions
1. Play icon source: `assets/icons/play.svg` bundled to `web/src/assets/icons/play.svg`.
2. Submit icon source: `assets/icons/star.svg` bundled to `web/src/assets/icons/star.svg`.
3. MCQ answer layout: always one row with large tile-style options.
4. Submit labels: keep audio-gate waiting states; ready state uses `Submit answer`.
5. Scope limited to student active question screens and shared UI primitive/docs updates.

## File-Level Implementation Map
1. `web/src/features/student/student-mode.tsx`
1. remove active-question header copy (`Student Baseline Test`, `Audio must be played before submit.`)
2. move question counter + progress above question card
3. update counter copy to `Question N of 10`
4. apply type-scale mapping for prompt, answers, and submit CTA
5. add bundled play/star icons to audio + submit controls
6. right-align submit CTA with content-fit width
2. `web/src/components/ui/radio-option.tsx`
1. add reusable visual variant: `default | tile`
2. keep default behavior for existing consumers
3. `web/src/features/design-system/components-section.tsx`
1. expose `RadioOption` variant control in playground
2. preview tile variant behavior
4. `web/src/lib/design-system.ts`
1. update catalog variants for `RadioOption`
5. `qa/matrix_ui_network.mjs`
1. update question-counter selector/regex to `Question N of 10`
2. align selectors to question audio/submit test ids

## QA Gates
1. `npm --prefix web run typecheck`
2. `npm --prefix web run lint`
3. `npm --prefix web run build`
4. `npm run qa:remote`
5. `npm run qa:matrix`

## Rollback Notes
1. Revert `student-mode.tsx` question shell and button/counter markup.
2. Revert `radio-option.tsx` variant extension and DS playground variant controls.
3. Revert QA matrix selector/regex updates if UI changes are rolled back.
4. Remove bundled `play.svg` and `star.svg` from `web/src/assets/icons` only if no other feature depends on them.
