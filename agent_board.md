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
| PM-UI-005 | Prepare UI modernization board/tasks/handoffs | PM | PM-002 | DONE | plan section, board tasks, kickoff handoff finalized |
| UI-005 | Install shadcn foundation and core primitives | UI | PM-UI-005 | DONE | Tailwind/Vite setup + reusable UI primitive layer |
| UI-006 | Refactor app into feature modules and shadcn surfaces | UI | UI-005 | DONE | student/teacher shell split and shared types/api libs |
| UI-007 | Add event-based SFX with global mute persistence | UI | UI-006 | DONE | curated SFX, global toggle, persistence, interaction guard |
| UI-008 | Add low-impact Motion transitions and micro animations | UI | UI-006 | DONE | reduced-motion policy and subtle transitions integrated |
| UI-009 | Non-core migration and secondary state polish | UI | UI-007, UI-008 | DONE | secondary states, notices, lists, and layout polish completed |
| QA-001 | Unit tests for scoring and timing | QA | BE-005 | READY | pending dedicated local unit suite |
| QA-002 | Integration tests for DB persistence | QA | BE-004, BE-005 | DONE | `qa/remote_smoke.mjs` validates storage and class separation |
| QA-003 | E2E tests for student and teacher flows | QA | UI-004, BE-006 | REVIEW | API-level end-to-end smoke complete incl. TTS path |
| QA-005 | UI regression + responsive + audio behavior verification | QA | UI-007, UI-008 | DONE | deployed `qa:remote`, `qa:matrix`, `qa:after-deploy` all passed |
| QA-006 | UX/data-collection risk validation under degraded conditions | QA | QA-005 | DONE | 3x3 matrix pass with persistence + reduced-motion assertions |
| QA-004 | Load test pilot profile (500 students) | QA | QA-003 | TODO | concurrency + dashboard read |
| UXR-001 | Tablet usability review checklist | UX Research | UI-002 | TODO | classroom constraints |
| UXR-002 | Apply UX recommendations backlog | UX Research | UXR-001 | TODO | scoped design fixes |
| MKT-001 | Comparable baseline tool scan | Market Research | PM-001 | TODO | risks and constraints memo |
| PM-002 | Weekly status and risk reporting | PM | all active | RUNNING | tracking active checkpoints and risks |
| PM-UI-006 | Final UI modernization signoff and release recommendation | PM | QA-006 | DONE | signoff complete; release recommended for pilot UI scope |
| PM-DS-001 | Define and queue design system page tasks | PM | PM-002 | DONE | board tasks and handoff sequencing created for `/designsystem` execution |
| UI-010 | Route plumbing + `/designsystem` shell | UI | PM-DS-001 | DONE | pathname route switch added with isolated design-system shell |
| UI-011 | Foundations inventory section | UI | UI-010 | DONE | runtime token inventory (colors/type/spacing/radius/shadow/motion) added |
| UI-012 | Components catalog + full playground controls | UI | UI-011 | DONE | interactive catalog/playground added for core primitives and states |
| UI-013 | Motion/SFX documentation and interaction panel | UI | UI-012 | DONE | reduced-motion and SFX event panels added with live controls |
| QA-007 | Design-system route/functionality regression | QA | UI-013 | DONE | type/lint/build pass; `qa:remote` pass incl `/designsystem`; matrix local blocked by Supabase CORS |
| PM-DS-002 | Final signoff and release note for `/designsystem` | PM | QA-007 | DONE | signoff complete with deployment follow-up note for route verification on prod |
| PM-DS-005 | Define vertical layout stability fix execution path | PM | PM-002 | DONE | locked no-layout-shift UX rule and submit-label gate behavior |
| UI-016 | Remove transient audio notice and enforce submit unlock only after audio end | UI | PM-DS-005 | DONE | replaced alert toggle with stable submit-label states and stricter audio gate |
| QA-009 | Validate no vertical shift in student question audio gate state changes | QA | UI-016 | DONE | type/lint/build pass + mocked headless UX check confirms stable layout behavior |
| PM-DS-006 | Final signoff for layout-stability audio gate change | PM | QA-009 | DONE | signoff complete with no backend/API impact |
| PM-QA-010 | Queue post-push release-gate validation and CI checkpoint closure | PM | PM-002 | DONE | scoped QA harness alignment and rerun of `qa:after-deploy` after main push |
| QA-010 | Align matrix harness with audio-end submit gate and rerun release gate | QA | PM-QA-010 | DONE | updated submit selector + mock audio `onended`; `qa:matrix` and `qa:after-deploy` passed |
| PM-QA-011 | Sign off post-push QA recovery and checkpoint closure | PM | QA-010 | DONE | verified green after-deploy report and cleared CP-07 via GitHub secrets |
| PM-QA-012 | Queue CI lockfile remediation after remote workflow failure | PM | PM-QA-011 | DONE | isolated GitHub failure to `npm ci` lockfile drift and routed lock sync fix |
| QA-011 | Sync workspace lockfile for CI parity and rerun after-deploy gate | QA | PM-QA-012 | DONE | refreshed root lockfile via `npm install`; local `npm ci` and `qa:after-deploy` passed |
| PM-QA-013 | Final signoff for remote CI status-check recovery | PM | QA-011 | DONE | GitHub `QA After Deploy` run `22375759854` passed; required status-check path recovered |
| REL-001 | Vercel deployment wiring | PM/Backend/UI | UI-003, QA-003 | DONE | main push + auto-deploy + after-deploy QA gate passed |
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
| CP-05-VERCEL-LINK | Before first preview/prod deploy | Run `vercel login` and `vercel link` | REL-001 | CLEARED |
| CP-06-VERCEL-ENV | Before deploy uses runtime vars | Add required `VITE_*` env vars in Vercel | REL-001 | CLEARED |
| CP-07-CI-SECRETS | Before enabling fully automated CI deploy | Add Supabase/Vercel secrets in GitHub Actions | REL-001 | CLEARED |

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
