# MKT-001 Comparable Baseline Tool Scan

Date: 2026-02-27  
Scope: Comparable literacy/baseline assessment patterns relevant to VocabPal pilot operations (500 students, tablet-constrained deployment).

## 1. Market Snapshot (Comparable Systems)

### A) Renaissance Star (Reading / Early Literacy)
- Pattern: Computer-adaptive screening with broad reporting for growth and grouping.
- Early literacy specifics include audio supports, graphics, and short test length (~10–15 min average per Star Early Literacy assessment).
- Positioning strength: linked progress reporting across grades and teacher-facing instructional grouping.
- Source:
  - https://www.renaissance.com/products/star-assessments/
  - https://www.renaissance.com/products/star-early-literacy/
  - https://www.renaissance.com/products/star-reading/

### B) DIBELS 8th Edition / Amplify mCLASS
- Pattern: Universal screening + progress monitoring with strong intervention framing and benchmark goals.
- Key operational trait: one-on-one/teacher-administered observational approach (mCLASS digital support), explicit “do not use for grading” guidance.
- Positioning strength: intervention readiness, benchmark categories, immediate report feedback.
- Source:
  - https://dibels.amplify.com/assessment/
  - https://dibels.amplify.com/assessment/index/material/
  - https://amplify.com/programs/mclass/
  - https://dibels.uoregon.edu/faqs

### C) NWEA MAP Growth
- Pattern: CAT universal screening and growth measurement on a stable scale across administrations.
- Positioning strength: multi-level reporting (student-to-district), RTI/MTSS support, placement signal for instructional decisions.
- Source:
  - https://www.nwea.org/map-growth/
  - https://www.nwea.org/resource-center/resource/map-growth-reading-assessment-fact-sheet/

### D) Curriculum Associates i-Ready (rebranding to i-Ready Inform)
- Pattern: adaptive diagnostic used for instructional planning and growth checks; vendor messaging highlights actionable reporting and upcoming shorter form option (2026–27).
- Positioning strength: instructional coupling (diagnostic + instruction), high adoption claims.
- Source:
  - https://www.curriculumassociates.com/about/press-releases/2025/10/i-ready-inform

## 2. Comparable Design Signals Relevant to VocabPal
1. Benchmark cadence over one-shot testing:
- Most comparables emphasize repeated checkpoints (often BOY/MOY/EOY) plus progress monitoring.
2. Teacher decision support > raw score display:
- Common output: grouping, intervention readiness, trend/progress views.
3. Fast-administered student interaction:
- Vendors highlight short windows and quick result turnaround to reduce instructional disruption.
4. Strong reporting hierarchy:
- Student, class, school, district views are first-class in comparable products.

## 3. Risks for VocabPal (Pilot + Scale)
1. Audio intelligibility risk:
- Dictation quality/pacing is a core reliability lever; weak audio undermines score validity.
2. Latency trust risk:
- Slow audio start looks like app failure; students/teachers may mistrust scoring fairness.
3. Data-noise risk:
- QA/test attempts mixed with student attempts can distort class/stage distribution decisions.
4. Shared-device integrity risk:
- Keyboard memory/autofill can contaminate independent response quality.
5. Pilot-to-production readiness risk:
- Blocked load gate (QA-004) leaves concurrency confidence incomplete for 500-student scale.

## 4. Constraints Memo (What to Preserve)
1. Keep baseline operationally lightweight on tablets:
- Maintain low rendering overhead and deterministic interaction states.
2. Preserve scoring transparency:
- Keep stage mapping explainable (score-to-stage bands) for teacher trust.
3. Preserve “completed-only” aggregation for instructional planning:
- Avoid in-progress noise in stage/class-level decision rows.
4. Preserve strict QA isolation:
- Continue attempt-source tagging and cleanup as non-negotiable.

## 5. Practical Positioning Opportunity
VocabPal can differentiate against heavier benchmark suites by:
1. Faster teacher action loop (stage-first row + attempt detail).
2. Lower operational complexity for baseline administration.
3. Strong classroom integrity controls on shared tablets.

The tradeoff is maintaining high reliability under load and sustained audio quality parity for dictation items.
