# Agent Coordination Board (Single-Chat, Codex-Only)

## 0. Global Policy
This policy applies to all future requests, changes, and modifications in this repository.
1. All work must run through this coordination system.
2. PM scheduling and state transitions must follow `state_machine_rules.md`.
3. User intervention is limited to explicit checkpoints in this board and `checkpoint_playbook.md`.
4. Any new task must be added to this board before implementation.

## 1. Purpose
This board coordinates six virtual agents in one chat thread:
1. PM
2. Backend
3. UI
4. QA
5. UX Research
6. Market Research

The PM agent is the scheduler. Only PM changes task state.

## 2. Operating Mode
1. One active task at a time in this chat unless PM explicitly runs parallel-safe tasks.
2. Each task must have:
1. Inputs
2. Outputs
3. Dependencies
4. Acceptance criteria
3. Any blocked task must include a blocker reason and unblock condition.
4. User intervention is requested only at explicit checkpoints in section 5.

## 3. State Lanes

### 3.1 Allowed States
1. `TODO`: Captured but not dependency-ready.
2. `READY`: Dependencies done, can start.
3. `RUNNING`: Active in current chat turn.
4. `BLOCKED`: Waiting on explicit checkpoint or missing artifact.
5. `REVIEW`: Implemented, waiting on PM verification.
6. `DONE`: Verified complete.

### 3.2 Board Snapshot
| Task ID | Title | Owner | Depends On | State | Notes |
|---|---|---|---|---|---|
| PM-001 | Initialize repo workflow docs | PM | - | DONE | Created board, rules, templates |
| BE-001 | Scaffold Supabase project structure | Backend | PM-001 | DONE | Vite app, root scripts, Supabase init completed |
| BE-002 | Create DB schema + migrations | Backend | BE-001 | DONE | Remote migration + seed pushed and verified |
| BE-003 | Implement teacher session auth API | Backend | BE-002 | DONE | login/me/logout deployed and smoke-tested |
| BE-004 | Implement student attempt APIs | Backend | BE-002 | DONE | start/submit/complete deployed and smoke-tested |
| BE-005 | Implement scoring + placement engine | Backend | BE-004 | DONE | scoring/placement live-validated; dictation normalization bug fixed |
| BE-006 | Implement Google TTS edge integration + cache | Backend | BE-004 | DONE | CP-03 cleared; live synth + cache-hit validated |
| BE-007 | Implement teacher window control APIs | Backend | BE-003 | DONE | create/close windows and allowlist support live |
| BE-008 | Implement teacher reporting APIs | Backend | BE-003, BE-004, BE-005 | DONE | summary/list/detail endpoints live |
| BE-009 | Implement teacher reopen API | Backend | BE-003, BE-004 | DONE | auditable reopen grants + policy migration live |
| UI-001 | Student app shell and identity form | UI | BE-004 | DONE | tablet-first student shell implemented |
| UI-002 | Student question flow (10 items) | UI | UI-001, BE-004 | DONE | 10-item flow with progress, audio, completion summary |
| UI-003 | Teacher dashboard and filters | UI | BE-003, BE-008 | DONE | summary, attempts, detail, class-aware display |
| UI-004 | Window control and reopen UI | UI | BE-003, BE-009 | DONE | open/close windows + reopen form implemented |
| QA-001 | Unit tests for scoring and timing | QA | BE-005 | READY | pending dedicated local unit suite |
| QA-002 | Integration tests for DB persistence | QA | BE-004, BE-005 | DONE | `qa/remote_smoke.mjs` validates storage and class separation |
| QA-003 | E2E tests for student and teacher flows | QA | UI-004, BE-006 | REVIEW | API-level end-to-end smoke complete incl. TTS path |
| QA-004 | Load test pilot profile (500 students) | QA | QA-003 | TODO | concurrency + dashboard read |
| UXR-001 | Tablet usability review checklist | UX Research | UI-002 | TODO | classroom constraints |
| UXR-002 | Apply UX recommendations backlog | UX Research | UXR-001 | TODO | scoped design fixes |
| MKT-001 | Comparable baseline tool scan | Market Research | PM-001 | TODO | risks and constraints memo |
| PM-002 | Weekly status and risk reporting | PM | all active | RUNNING | tracking active checkpoints and risks |
| REL-001 | Vercel deployment wiring | PM/Backend/UI | UI-003, QA-003 | BLOCKED | pending CP-05, CP-06 and UI E2E signoff |
| REL-002 | Pilot readiness checklist signoff | PM | QA-004, UXR-002 | TODO | final go/no-go |

## 4. Task Dependency Rules
1. A task can move to `READY` only when every dependency is `DONE`.
2. A task can move from `RUNNING` to `REVIEW` only with a handoff file entry.
3. A task can move from `REVIEW` to `DONE` only when acceptance criteria are verified.
4. Tasks cannot skip directly from `TODO` to `RUNNING`.

## 5. Explicit User Checkpoints (Intervention Required)
Only these checkpoints pause autonomous flow for user input/credentials.

| Checkpoint ID | Trigger | Required User Action | Blocking Tasks | Status |
|---|---|---|---|---|
| CP-01-SUPABASE-LINK | Before first remote Supabase operation | Run `supabase login` and `supabase link --project-ref <REF>` | BE-002 onward requiring remote | CLEARED |
| CP-02-SUPABASE-PUSH | Before applying remote migrations | Confirm `supabase db push` execution | BE-002 verification | CLEARED |
| CP-03-GCP-TTS | Before first live TTS call/pre-generation | Run GCP auth and enable TTS API, set `GOOGLE_TTS_API_KEY` secret | BE-006 | CLEARED |
| CP-04-GITHUB-PUSH | Before first remote push/PR | Ensure GitHub remote auth and run push | PM-002, REL-001 | CLEARED |
| CP-05-VERCEL-LINK | Before first preview/prod deploy | Run `vercel login` and `vercel link` | REL-001 | PENDING |
| CP-06-VERCEL-ENV | Before deploy uses runtime vars | Add required `VITE_*` env vars in Vercel | REL-001 | PENDING |
| CP-07-CI-SECRETS | Before enabling fully automated CI deploy | Add Supabase/Vercel secrets in GitHub Actions | REL-001 | PENDING |

## 6. Autonomous Run Loop
1. PM selects next `READY` task with highest dependency priority.
2. Assigned virtual agent executes the task in this chat.
3. Agent posts handoff using `templates/handoff_template.md`.
4. PM verifies acceptance criteria and updates board state.
5. Repeat until blocked or all planned tasks are `DONE`.
6. If blocked by non-checkpoint ambiguity, PM asks one focused question, then resumes.

## 7. File Conventions
1. Task definitions use `templates/task_template.md`.
2. Handoffs use `templates/handoff_template.md`.
3. Checkpoint asks use `templates/checkpoint_request_template.md`.
4. State transitions must follow `state_machine_rules.md`.
