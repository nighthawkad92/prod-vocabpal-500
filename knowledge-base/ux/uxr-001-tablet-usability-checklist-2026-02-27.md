# UXR-001 Tablet Usability Review Checklist

Date: 2026-02-27  
Scope: Student baseline flow + teacher dashboard on shared classroom tablets.

## 1. Device + Environment Readiness
- Verify portrait baseline on `768x1024`, `810x1080`, and low-width `350-375` phone fallback.
- Verify touch targets are >= 44px for all primary interactions.
- Verify audio output path is set (speaker/headphone) before first student starts.
- Verify network fallback UX appears for delayed/failing function calls.

## 2. Student Flow Checks
- Entry step 1/2: no layout jump; no accidental horizontal scroll.
- Name + class/section completion path works with only touch input.
- On active attempt and completion, utility escape controls are hidden/locked.
- Audio gate states are readable and positioned consistently near Play button.
- Submit state follows audio lifecycle (`loading -> playing -> ready`).
- Dictation fields disable predictive learning/autofill behavior (`autocomplete/autocorrect/spellcheck` hardening).
- MCQ option labels remain legible at classroom distance.

## 3. Assessment Integrity Checks
- Wrong/blank navigation cannot skip required question submission path.
- Student cannot back out to prior setup once attempt is active.
- Completion screen has no back/close path that reopens attempt context.
- Shared-device handoff does not expose previous student answers.

## 4. Teacher Flow Checks
- Teacher login starts blank (no prefilled identity remnants).
- Dashboard query/filter/action path works in <= 3 taps for target attempt.
- Stage summary row is visible and filterable before class rows.
- Archive actions clearly destructive and require confirmation.
- Pagination and totals show true counts, not only current page counts.

## 5. Performance + Feedback Checks
- Audio start latency is signaled explicitly (no ambiguous idle state).
- Page transitions avoid vertical layout shifts in question mode.
- Loading skeletons appear for pause/resume and refresh actions.
- Toast feedback appears top-of-screen and auto-dismisses.

## 6. Data Hygiene + QA Isolation Checks
- QA attempts are tagged (`attempt_source=qa`) and excluded from default teacher views.
- Cleanup script removes QA artifacts after automated runs.
- Student-source attempts remain visible after cleanup.

## 7. Pilot Exit Criteria
- All high-risk integrity items pass.
- No unresolved P0/P1 UX defects for student attempt flow.
- Teacher can locate class-stage distribution and at-risk cohorts in < 30s.
- QA noise does not pollute instructional reporting surfaces.
