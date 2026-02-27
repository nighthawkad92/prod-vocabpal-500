# UXR-002 UX Recommendations Backlog

Date: 2026-02-27  
Source: Pilot feedback synthesis + current production behavior review.

## Prioritization Model
- P0: Integrity/compliance blockers for pilot.
- P1: Critical classroom UX friction.
- P2: Efficiency and readability improvements.
- P3: Nice-to-have polish.

## Backlog (Implementation-Ready)

### P0
1. Student session lock during active attempt and completion.
- Problem: students can exit or context-switch mid-assessment.
- Recommendation: hide/disable non-essential utility controls in active/completion states.
- Acceptance: no path to mode/menu/close during attempt/completion.
- Status: Implemented.

2. Dictation anti-memory hardening on shared tablets.
- Problem: keyboard suggestions can leak prior answers.
- Recommendation: enforce `autocomplete=off`, `autocorrect=off`, `autocapitalize=none`, `spellcheck=false` on answer fields.
- Acceptance: no prior-answer suggestion leakage in baseline answer fields.
- Status: Implemented.

3. QA noise isolation from teacher reporting.
- Problem: QA attempts pollute instructional decisions.
- Recommendation: source-tag QA attempts and exclude from default teacher queries; enforce cleanup.
- Acceptance: teacher dashboard defaults to real-student attempts only.
- Status: Implemented.

### P1
4. Audio clarity + pacing for dictation words.
- Problem: difficult words (e.g., minimal-pair pronunciations) are unclear/too fast.
- Recommendation: tune TTS rate and use dictation-specific SSML for pronunciation clarity.
- Acceptance: pilot comprehension spot-check pass on sensitive dictation words.
- Status: Implemented baseline tuning; continue classroom validation.

5. Audio loading state clarity.
- Problem: students are unsure when audio is loading vs playing vs complete.
- Recommendation: keep explicit status text adjacent to audio trigger with deterministic states.
- Acceptance: state progression visible and stable with no layout shift.
- Status: Implemented.

6. Stage-first teacher overview row.
- Problem: teacher cannot quickly identify largest stage cohort.
- Recommendation: add stage cards above class rows and allow click-to-filter attempts.
- Acceptance: one-tap stage filter with accurate counts by completed attempts.
- Status: Implemented.

### P2
7. Student MCQ option readability uplift.
- Problem: option text too small at classroom viewing distance.
- Recommendation: move option labels to card-title-equivalent size with balanced tile spacing.
- Acceptance: options readable at tablet arm’s-length without zoom.
- Status: Implemented.

8. Teacher mobile attempt review loop simplification.
- Problem: long scroll to move between list and detail.
- Recommendation: list-first mobile IA with full-screen detail sheet and clear back action.
- Acceptance: teacher can inspect one attempt and return to same list state without long scroll.
- Status: Implemented.

### P3
9. Classroom ops checklist institutionalization.
- Problem: improvements decay without periodic operational review.
- Recommendation: adopt recurring pre-pilot checklist run (audio, integrity, cleanup, stage signals).
- Acceptance: checklist executed and logged before each classroom batch.
- Status: Pending process adoption.

## Recommended Next Sprint Focus
1. Convert audio clarity validation into measured A/B classroom check (same word list, revised SSML variants).
2. Fix legacy `qa:data` archive contract assertions to keep QA evidence fully green.
3. Add teacher-facing “Data freshness / last sync” badge to reduce confusion during live test sessions.
