# REL-002 Pilot Readiness Checklist

Date: 2026-02-27  
Decision scope: Go/No-Go signoff for pilot readiness.

## 1. Dependency Gate Status

| Dependency | Linear Issue | Status | Notes |
|---|---|---|---|
| E2E student/teacher flows | DES-13 | DONE | Completed earlier with handoff evidence |
| Unit scoring/timing coverage | DES-12 | DONE | Deterministic contract suite added and passing |
| Tablet usability checklist | DES-15 | DONE | Checklist complete |
| UX recommendations backlog | DES-16 | DONE | Prioritized backlog complete |
| Market comparable scan | DES-17 | DONE | Risks/constraints memo complete |
| 500-student load profile | DES-14 | BLOCKED | Thresholds failing |
| Prod migration incident ticket | DES-140 | TODO | Untriaged incident artifact |

## 2. Load Gate Snapshot (Blocking)
From `qa/reports/latest_load_profile_500.json`:
- Error rate: `3.57%` (threshold <= `1%`) -> FAIL
- Student start p95: `18847ms` (threshold <= `2500ms`) -> FAIL
- First submit p95: `10212ms` (threshold <= `3000ms`) -> FAIL
- Dashboard read p95: `1355ms` (threshold <= `2200ms`) -> PASS
- Archive p95: `1463ms` (threshold <= `3500ms`) -> PASS

## 3. Readiness Decision
- Current recommendation: **NO-GO (BLOCKED)**.
- Rationale:
  1. Core load thresholds for student start/submit are not met.
  2. Incident ticket `DES-140` remains unresolved and should be explicitly dispositioned.

## 4. Required Exit Conditions
1. Remediate or explicitly waive `DES-14` with documented PM+QA approval.
2. Resolve `DES-140` (close as false artifact or assign owner + resolution note).
3. Re-run hard release evidence:
   - `npm run qa:release-gate`
   - `npm run qa:after-deploy`
4. Attach final passing (or approved waiver) evidence to `DES-139`.
