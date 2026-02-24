# Master Plan: VocabPal Baseline Prototype (500-Student Pilot, Ahmedabad)

## 1. Summary
This plan defines a decision-complete, Codex-only build for a baseline vocabulary assessment app.
Students enter first name, last name, and class, then complete the full PDF-style baseline (5 stages, 10 scored items).
Teachers control test availability and view detailed results (correct/wrong, score band, time per item).
Frontend deploys on Vercel. Backend/data/auth logic runs on Supabase. Google TTS provides Indian English female voice prompts.

## 2. Locked Decisions
1. Assessment format: PDF style, full attempt (no early stop on wrong answers).
2. Test structure: 5 stages, each with 2 scored items (MCQ + dictation), total score out of 10.
3. Placement mapping:
1. 0-2 => Stage 0
2. 3-4 => Stage 1
3. 5-6 => Stage 2
4. 7-8 => Stage 3
5. 9-10 => Stage 4
4. Student auth: no passwords; identity by first name + last name + class.
5. Teacher auth: full name + shared passcode (`vocabpal5002026`) via session token.
6. Retake policy: one lifetime baseline attempt per student/class identity unless teacher manually reopens.
7. Stars: 1 star per correct answer (max 10), shown at end of test.
8. Connectivity: online-first with retry queue.
9. Deployment: frontend on Vercel, backend on Supabase.
10. Git host: GitHub.
11. Delivery model: Codex multi-agent only (no Claude).

## 3. Goals and Success Criteria
1. Every student attempt and every item response is stored correctly.
2. Teacher dashboard always reflects DB truth.
3. Same-name and class separation are clear and auditable.
4. Per-question timing is accurate and reportable.
5. Tablet UX remains lightweight and stable for pilot conditions.
6. QA evidence proves scoring, placement, and reporting correctness.

## 4. Architecture
1. Student web app and teacher web app are served from Vercel (single codebase, role-based routes).
2. All sensitive logic runs in Supabase Edge Functions.
3. Postgres in Supabase stores students, attempts, responses, windows, and audit logs.
4. Google TTS is called server-side only; audio is cached in Supabase Storage.
5. Student clients never get privileged DB credentials.
6. Teacher dashboard reads via protected APIs with teacher session auth.

## 5. User Flows

### 5.1 Student Flow
1. Enter first name, last name, class.
2. System checks active test window and retake eligibility.
3. Start attempt and load item 1 of 10.
4. Submit each answer; response and timing are saved immediately.
5. Complete all 10 items.
6. Show final stars and completion summary.

### 5.2 Teacher Flow
1. Login using full name + passcode.
2. Open baseline for all students or allowlist only.
3. Monitor attempts and filter by class/student.
4. View per-attempt detail:
1. Score out of 10
2. Placement stage
3. Correct/wrong count
4. Time per item
5. Manually reopen baseline for a specific student if needed.

## 6. Data Model (Public Interface + Storage Contract)

### 6.1 Tables
1. `classes(id, name, created_at)`
2. `students(id, first_name, last_name, class_id, first_name_norm, last_name_norm, identity_key, created_at)`
3. `tests(id, code, name, version, is_active)`
4. `question_items(id, test_id, stage_no, item_no, item_type, prompt_text, options_json, answer_key, tts_text, display_order)`
5. `test_windows(id, test_id, is_open, scope, start_at, end_at, created_by_teacher_name, created_at)`
6. `window_allowlist(id, window_id, first_name_norm, last_name_norm, class_name_norm)`
7. `teacher_reopens(id, student_id, test_id, reopened_by_teacher_name, reason, created_at)`
8. `attempts(id, student_id, test_id, window_id, status, started_at, ended_at, total_correct, total_wrong, total_score_10, stars, placement_stage)`
9. `responses(id, attempt_id, question_item_id, stage_no, item_no, submitted_answer, is_correct, shown_at, answered_at, response_time_ms, server_received_at)`
10. `teacher_sessions(id, teacher_name, token_hash, expires_at, created_at, revoked_at)`
11. `teacher_audit_events(id, teacher_name, event_type, event_payload, created_at)`

### 6.2 Identity and Duplicate Handling
1. `identity_key = lower(trim(first_name)) + '|' + lower(trim(last_name)) + '|' + class_id`
2. Same name, different class => different identity.
3. Same name, same class => same identity (retake restricted unless reopened by teacher).

## 7. Core Logic Rules
1. Score item as correct/incorrect on submit.
2. `total_score_10 = count(correct responses)`
3. `stars = total_score_10`
4. `total_wrong = 10 - total_correct`
5. Placement stage computed only at completion.
6. Dictation grading normalizes input by:
1. trim
2. lowercase
3. punctuation strip
4. multiple-space collapse
7. Out-of-order or duplicate item submissions are rejected.
8. Attempts can end as `completed`, `abandoned`, or `expired`.

## 8. Time Per Question Design
1. Persist `shown_at`, `answered_at`, and `response_time_ms` on each response.
2. `response_time_ms = answered_at - shown_at` in milliseconds.
3. Server validates `response_time_ms >= 0` and caps extreme values (e.g., 10 minutes).
4. Teacher dashboard supports:
1. time per item
2. average time by stage
3. average time by class
4. outlier detection.

## 9. Public APIs / Interfaces / Types

### 9.1 Endpoints
1. `POST /api/teacher/login`
2. `POST /api/teacher/logout`
3. `GET /api/teacher/me`
4. `POST /api/teacher/windows`
5. `PATCH /api/teacher/windows/:windowId`
6. `POST /api/teacher/reopen`
7. `GET /api/teacher/dashboard/summary`
8. `GET /api/teacher/dashboard/attempts`
9. `GET /api/teacher/dashboard/attempts/:attemptId`
10. `POST /api/student/start-attempt`
11. `POST /api/student/submit-response`
12. `POST /api/student/complete-attempt`
13. `GET /api/student/question-audio/:questionItemId`

### 9.2 Required DTOs
```ts
type StageNo = 0 | 1 | 2 | 3 | 4;
type ItemNo = 1 | 2;

interface StudentStartAttemptReq {
  firstName: string;
  lastName: string;
  className: string;
}

interface SubmitResponseReq {
  attemptId: string;
  questionItemId: string;
  stageNo: StageNo;
  itemNo: ItemNo;
  answer: string;
  shownAtIso: string;
  answeredAtIso: string;
}

interface CompleteAttemptRes {
  attemptId: string;
  totalScore10: number;
  totalCorrect: number;
  totalWrong: number;
  stars: number;
  placementStage: StageNo;
  instructionalNeed: string;
}

interface TeacherLoginReq {
  fullName: string;
  passcode: string;
}
```

## 10. TTS Integration (Google)
1. Language/voice target: `en-IN` female natural voice.
2. Generate audio in backend only.
3. Cache by hash of `voice + speed + text`.
4. Pre-generate all fixed test prompts and dictation words.
5. Return signed storage URL to client.
6. Preload next item audio for smoother flow.

## 11. Security and Access Control
1. RLS default deny.
2. Student cannot query other students or teacher datasets.
3. Teacher-only dashboard APIs require valid teacher session.
4. Shared passcode stored as hash in secret config, not plain text.
5. Audit events logged for:
1. teacher login/logout
2. window open/close
3. reopen actions.
6. No secrets in frontend bundle or git history.

## 12. UX and Performance Constraints
1. Lightweight interface suitable for tablet hardware.
2. Animation budget:
1. micro-animations only
2. transform/opacity transitions
3. no heavy runtime effects.
3. Media budget:
1. compressed images
2. lazy loading
3. no unnecessary large assets.
4. Input UX optimized for young learners:
1. large tap targets
2. clear progress 1/10 to 10/10
3. simple language.
5. Student sees stars only; no teacher analytics shown to student.

## 13. Codex Multi-Agent Plan

### 13.1 Agents
1. PM Agent: backlog, sequencing, status reporting.
2. Backend Agent: schema, APIs, auth, scoring, TTS, RLS.
3. UI Agent: student and teacher interfaces.
4. QA Agent: test automation and quality gates.
5. UX Research Agent: classroom usability findings.
6. Market Research Agent: pilot benchmarks and risk context.

### 13.2 Branching
1. `codex/pm/*`
2. `codex/backend/*`
3. `codex/ui/*`
4. `codex/qa/*`
5. `codex/uxr/*`
6. `codex/market/*`

### 13.3 Merge Gates
1. Lint passes.
2. Unit tests pass.
3. Integration tests pass.
4. E2E smoke passes.
5. Migration checks pass.

## 14. Delivery Timeline (3 Weeks)

### Week 1
1. Project skeleton and CI baseline.
2. Schema/migrations and seeded PDF question set.
3. Teacher login/session APIs.
4. Student start/submit APIs.
5. Unit tests for scoring/placement/timing.

### Week 2
1. Student test UI and retry queue behavior.
2. Teacher dashboard UI and filters.
3. TTS integration with cache/pre-generation.
4. Integration tests for persistence and reporting parity.

### Week 3
1. Full E2E suite.
2. Load testing for pilot concurrency.
3. Security/RLS validation.
4. Bug fixing and pilot runbook.
5. Launch readiness review.

## 15. QA Matrix and Acceptance Scenarios

### 15.1 Must-Pass Scenarios
1. Student details are correctly stored.
2. Class-level grouping is correct.
3. Same-name logic is clear across classes and within same class.
4. All 10 item responses persist accurately.
5. Score and placement computation are exact.
6. Dashboard metrics match DB aggregates exactly.
7. Time per question is correctly recorded and displayed.

### 15.2 Test Layers
1. Unit tests:
1. scoring formula
2. placement boundaries
3. dictation normalization
4. star totals.
2. Integration tests:
1. start/submit/complete APIs
2. reopen policy
3. window scope enforcement.
3. E2E tests:
1. student full attempt
2. teacher controls
3. dashboard detail.
4. Load tests:
1. peak starts
2. concurrent submissions
3. dashboard query performance.

## 16. Deployment and Operations (Vercel + Supabase)
1. Frontend hosted on Vercel.
2. Backend functions, DB, storage on Supabase.
3. Environments:
1. local
2. preview
3. production.
4. Vercel previews from GitHub PRs.
5. Supabase migrations applied via CLI before prod release.
6. Pilot-day ops checklist:
1. window open status
2. TTS cache readiness
3. dashboard live verification.

## 17. Credential Checkpoints (CLI-First, Just-in-Time)

### 17.1 Rules
1. Ask for credentials only when a command requires them.
2. User runs auth commands locally in terminal.
3. Secrets stored only in secret stores (Supabase/Vercel/GitHub), never in repo.

### 17.2 Checkpoints
1. Supabase link:
1. `supabase login`
2. `supabase link --project-ref <REF>`
2. Supabase remote operations:
1. `supabase db push`
2. `supabase migration list`
3. Google TTS setup:
1. `gcloud auth login`
2. `gcloud config set project <PROJECT_ID>`
3. `gcloud services enable texttospeech.googleapis.com`
4. GitHub push:
1. `git push -u origin <branch>`
5. Vercel deploy:
1. `vercel login`
2. `vercel link`
3. `vercel env add VITE_SUPABASE_URL`
4. `vercel env add VITE_SUPABASE_ANON_KEY`
5. `vercel --prod`
6. CI secrets:
1. `SUPABASE_ACCESS_TOKEN`
2. `SUPABASE_PROJECT_REF`
3. `VERCEL_TOKEN`
4. `VERCEL_ORG_ID`
5. `VERCEL_PROJECT_ID`

### 17.3 Env Ownership
1. Frontend (public-safe):
1. `VITE_SUPABASE_URL`
2. `VITE_SUPABASE_ANON_KEY`
2. Backend (private):
1. `GOOGLE_TTS_API_KEY`
2. `GOOGLE_TTS_LANGUAGE_CODE`
3. `GOOGLE_TTS_VOICE_NAME`
4. `GOOGLE_TTS_SPEAKING_RATE`
5. `TTS_STORAGE_BUCKET`
6. `APP_ORIGINS`
2. `TEACHER_PASSCODE_HASH`
3. Local-only:
1. `.env.local` (gitignored)

## 18. Risks and Mitigations
1. Shared teacher passcode risk:
1. mitigate with short session TTL + audit logs + planned migration to per-teacher auth post-pilot.
2. Network instability:
1. mitigate with retry queue and idempotent submit endpoints.
3. Same-name ambiguity:
1. mitigate with identity key and attempt timestamp visibility.
4. TTS latency:
1. mitigate with pre-generation and caching.

## 19. Assumptions and Defaults
1. Single pilot cohort context unless expanded later.
2. English-only UI/TTS for v1.
3. PDF content is authoritative and fixed as `BASELINE_V1`.
4. Students use shared tablet/browser sessions safely with attempt-level controls.
5. Teacher is trusted operator for window and reopen controls.

## 20. Definition of Done
1. All required APIs implemented and documented.
2. DB schema/migrations clean from empty state.
3. All quality gates pass.
4. Teacher can control windows and view accurate reports.
5. Student completes full baseline with stable UX and final stars.
6. Pilot readiness report shows no unresolved critical defects.

## Appendix A: PDF Question Set to Seed
1. Stage 0:
1. MCQ: same starting sound as `sun` => `sand`
2. Dictation: `cat`
2. Stage 1:
1. MCQ spoken word `ship` => `ship`
2. Dictation: `dog`
3. Stage 2:
1. Sentence question (`Rita has a red bag`) => `Red`
2. Dictation: `green`
4. Stage 3:
1. Paragraph question (dog plays in park) => `Park`
2. Dictation: `happy`
5. Stage 4:
1. Inference question (why Meena smiled) => `She did well in her test`
2. Dictation: `proud`

## 21. UI Modernization Execution Plan (shadcn + Motion + SFX)
1. Rollout model: sequential hardening.
2. Scope now: migrate core student and teacher surfaces to shadcn components and states.
3. Scope next: migrate non-core surfaces and secondary states in a follow-up phase.
4. Motion policy:
1. use low-impact transitions and micro animations from Motion.
2. respect reduced-motion preferences.
5. Sound policy:
1. enable by default with persistent mute toggle.
2. apply to student and teacher interactions.
3. defer first playback until user interaction to avoid autoplay blocks.
6. Audio asset baseline (curated only):
1. `sound effects/UI/select_2.wav` for tap/click.
2. `sound effects/UI/pop_2.wav` for submit.
3. `sound effects/UI/select_4.wav` for progress.
4. `sound effects/Musical Effects/8_bit_chime_quick.wav` for welcome.
5. `sound effects/Musical Effects/8_bit_positive_long.wav` for end.
7. Frontend contracts:
1. `SfxEvent` event model.
2. `UiPreferences` with persisted sound state and interaction gate.
3. `MotionPolicy` resolved from reduced-motion preference.
4. reusable hooks for preferences and sound effects.
8. Quality gate additions:
1. keep existing `qa:remote`, `qa:matrix`, and `qa:after-deploy` passing.
2. extend matrix checks for sound toggle persistence and reduced-motion behavior.

## 22. UI Modernization Execution Outcome (2026-02-24)
1. Implementation commit:
1. `d52f819` pushed to `main`.
2. Deployment:
1. Vercel production build updated at `https://prod-vocabpal-500.vercel.app`.
3. QA gate status:
1. `qa:remote` passed on deployed URL.
2. `qa:matrix` passed on deployed URL with 9/9 cases.
3. `qa:after-deploy` passed with both smoke and matrix stages green.
4. Added matrix assertions now actively validated:
1. sound toggle persistence via UI + localStorage.
2. reduced-motion policy detection and behavior.
5. Residual note:
1. local-host matrix execution is blocked by Supabase CORS origin policy unless localhost is allowlisted.
