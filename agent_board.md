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
| PM-DS-007 | Define and queue fresh-lime non-typography theme adoption | PM | PM-002 | DONE | kickoff converted to execution-ready artifact; collision fixed (`QA-010` -> `QA-012`) |
| UI-017 | Apply fresh-lime non-typography token mapping across app + design system | UI | PM-DS-007 | DONE | fresh-lime token mapping shipped with typography preserved; shared primitives normalized to token-backed radius/shadows |
| QA-012 | Verify fresh-lime rollout, typography invariance, and visual regression gates | QA | UI-017 | DONE | type/lint/build + `qa:remote` passed; local screenshots captured for `/` and `/designsystem` |
| PM-DS-008 | Final signoff and release recommendation for fresh-lime adoption | PM | QA-012 | DONE | signoff approved for UI-only rollout; no backend/db impact and local preview confirmed |
| PM-DS-009 | Queue design-system radio-option parity and deployed QA gate | PM | PM-002 | DONE | task packet created for reusable `RadioOption`, DS playground tab, and prod verification |
| UI-018 | Add reusable `RadioOption` primitive and `/designsystem` playground coverage | UI | PM-DS-009 | DONE | shared UI primitive added; student MCQ migrated; design-system catalog/playground now includes radio-option state controls |
| QA-013 | Run post-push `qa:after-deploy` and verify prod route/data regressions | QA | UI-018 | DONE | `qa:after-deploy` passed against `https://prod-vocabpal-500.vercel.app` (smoke + matrix + after-deploy all green) |
| PM-DS-010 | Final signoff for radio-option parity rollout | PM | QA-013 | DONE | signoff complete; rollout confirmed in prod with no backend/db contract impact |
| PM-DS-011 | Queue muted-to-ink text color harmonization rollout | PM | PM-002 | DONE | rollout packet executed for token-level harmonization and DS consistency |
| UI-019 | Implement muted-to-ink token harmonization and DS consistency update | UI | PM-DS-011 | DONE | `--muted` aligned to ink (light/dark) and DS token fallback updated |
| QA-014 | Validate text color harmonization regression gates | QA | UI-019 | DONE | type/lint/build pass; local `/` and `/designsystem` screenshots captured |
| PM-DS-012 | Final signoff for text color harmonization rollout | PM | QA-014 | DONE | signoff complete; frontend-only change with no backend/db impact |
| PM-DS-013 | Queue main-page header/layout redesign execution | PM | PM-002 | DONE | execution queued for utility-row shell, entry-card branding, and state-wired logo behavior |
| UI-020 | Remove app-shell hero and build utility-row layout | UI | PM-DS-013 | DONE | hero container removed; background utility row added with Sound then mode toggle ordering |
| UI-021 | Embed logo/subtitle in entry cards and wire state-based utility logo | UI | UI-020 | DONE | student/teacher entry branding updated; active/auth callbacks drive 200px utility logo |
| QA-015 | Validate layout behavior across student/teacher entry/internal states | QA | UI-021 | DONE | type/lint/build pass and local visual capture for entry/internal states |
| PM-DS-014 | Final signoff and release recommendation for header/layout redesign | PM | QA-015 | DONE | signoff complete; frontend-only layout change validated with no backend/db impact |
| PM-DS-015 | Queue header/onboarding refresh execution | PM | PM-002 | DONE | execution queued for entry branding relocation, toggle shell parity, and 2-step student onboarding |
| UI-022 | Apply utility-row parity and entry branding relocation | UI | PM-DS-015 | DONE | mode toggle wrapped in white utility shell; student/teacher entry logo moved above card with in-card form title |
| UI-023 | Implement student 2-step onboarding with class/section tap grids and stepper | UI | UI-022 | DONE | stepper flow added with Next/Start test CTAs, icon-only back button, and `Class N - Section X` serialization |
| QA-016 | Validate onboarding layout/serialization regression gates | QA | UI-023 | DONE | type/lint/build pass; payload format and entry/internal state behavior validated |
| PM-DS-016 | Final signoff and release recommendation for header/onboarding refresh | PM | QA-016 | DONE | signoff complete; frontend-only UX refresh accepted with no backend/db schema impact |
| PM-DS-017 | Queue entry viewport/copy polish execution | PM | PM-002 | DONE | queued student/teacher entry centering, form-width cap, title/copy updates, and onboarding subtitle adjustments |
| UI-024 | Implement entry centering, form-width cap, title/copy updates, and onboarding subtitle rules | UI | PM-DS-017 | DONE | entry states centered with 450px card max width and 24px lockup gap; student/teacher heading copy updated; onboarding progress bar removed |
| QA-017 | Validate entry viewport alignment and onboarding copy/state regression gates | QA | UI-024 | DONE | type/lint/build pass; student step subtitles, entry centering, and active attempt behavior verified |
| PM-DS-018 | Final signoff for entry viewport/copy polish | PM | QA-017 | DONE | signoff complete; frontend-only polish accepted with no backend/API/schema changes |
| PM-DS-019 | Queue design-system type scale detail execution | PM | PM-002 | DONE | queued foundations typography enhancement to document full type scale roles and specs |
| UI-025 | Add type scale details to design-system foundations typography section | UI | PM-DS-019 | DONE | added `Type Scale` panel with role labels, specs, and live samples under typography card |
| QA-018 | Validate design-system type scale rendering and regression gates | QA | UI-025 | DONE | type/lint/build pass; `/designsystem` typography now includes type scale details block |
| PM-DS-020 | Final signoff for design-system type scale detail rollout | PM | QA-018 | DONE | signoff complete; documentation-only frontend update accepted |
| PM-DS-021 | Queue global image background rollout | PM | PM-002 | DONE | queued global background texture application using bundled `image-bg.svg` at 30% opacity |
| UI-026 | Apply `image-bg.svg` as global background layer at 30% opacity | UI | PM-DS-021 | DONE | copied background asset into web bundle and added fixed opacity layer in global css for all routes |
| QA-019 | Validate global background rendering and static regression gates | QA | UI-026 | DONE | type/lint/build pass; global textured background appears behind app and design-system screens |
| PM-DS-022 | Final signoff for global image background rollout | PM | QA-019 | DONE | signoff complete; frontend visual update accepted with no behavioral contract impact |
| PM-DS-023 | Queue class/section selector control simplification | PM | PM-002 | DONE | queued replacement of clunky radio-style selectors with tabs-based controls in student step 2 |
| UI-027 | Replace class/section `RadioOption` selectors with `Tabs` controls | UI | PM-DS-023 | DONE | student step-2 class and section now use tabs triggers with touch-friendly sizing and existing tap audio behavior |
| QA-020 | Validate tabs-based class/section selector behavior and regression gates | QA | UI-027 | DONE | type/lint/build pass; step-2 selection and start-gate logic unchanged after control swap |
| PM-DS-024 | Final signoff for tabs-based class/section selector rollout | PM | QA-020 | DONE | signoff complete; frontend-only control update accepted |
| PM-DS-025 | Queue entry subtitle type-scale mapping update | PM | PM-002 | DONE | queued exact type-scale mapping for entry title and split subtitle roles (`Meta/Caption` + `Body Large`) |
| UI-028 | Apply type-scale mapping for `Baseline Test` and split step subtitle roles | UI | PM-DS-025 | DONE | `Baseline Test` now uses card-title scale; step subtitle split into meta label + body-large action text |
| QA-021 | Validate entry type-scale mapping and regression gates | QA | UI-028 | DONE | type/lint/build pass; student and teacher entry headings and student subtitle scales match requested mapping |
| PM-DS-026 | Final signoff for entry type-scale mapping update | PM | QA-021 | DONE | signoff complete; frontend typography-only update accepted |
| PM-DS-027 | Queue entry subtitle parity + full-viewport background coverage fix | PM | PM-002 | DONE | queued equalized subtitle scale and full width/height global pattern rendering fix |
| UI-029 | Align `Step X of 2:` to body-large scale and enforce full-viewport SVG background coverage | UI | PM-DS-027 | DONE | step prefix now matches action text scale; global background layer now stretches full viewport without tiling seams |
| QA-022 | Validate subtitle scale parity + full-viewport background rendering regression gates | QA | UI-029 | DONE | type/lint/build pass; entry subtitle sizing and full-screen pattern coverage verified |
| PM-DS-028 | Final signoff for subtitle/background coverage fix | PM | QA-022 | DONE | signoff complete; frontend visual fix accepted |
| PM-DS-029 | Queue entry lockup spacing refinement | PM | PM-002 | DONE | queued requested spacing adjustments: 48px lockup-to-form gap and 8px inner lockup gap |
| UI-030 | Apply entry lockup spacing refinement on student and teacher entry states | UI | PM-DS-029 | DONE | entry layout gap raised to 48px and lockup internal gap set explicitly to 8px in student/teacher entry screens |
| QA-023 | Validate entry spacing refinement and static regression gates | QA | UI-030 | DONE | type/lint/build pass; spacing updates verified with no functional regressions |
| PM-DS-030 | Final signoff for entry lockup spacing refinement | PM | QA-023 | DONE | signoff complete; frontend spacing polish accepted |
| PM-DS-031 | Queue utility-row container removal and spacing alignment | PM | PM-002 | DONE | queued removal of white wrappers around Sound and mode toggle with explicit 16px horizontal spacing |
| UI-031 | Remove utility-row white containers and set Sound-to-mode gap to 16px | UI | PM-DS-031 | DONE | outer wrappers removed; controls retained and parent gap set to `gap-4` (16px) |
| QA-024 | Validate utility-row container removal and spacing regression gates | QA | UI-031 | DONE | type/lint/build pass; utility controls render without wrappers and maintain expected interactions |
| PM-DS-032 | Final signoff for utility-row container removal and spacing alignment | PM | QA-024 | DONE | signoff complete; frontend-only utility-row visual update accepted |
| PM-DS-033 | Queue utility-row horizontal gap increase to 24px | PM | PM-002 | DONE | queued update to raise Sound-to-mode horizontal spacing from 16px to 24px |
| UI-032 | Increase utility-row Sound-to-mode horizontal spacing to 24px | UI | PM-DS-033 | DONE | utility row now uses `gap-x-6` with `gap-y-2`, preserving wrap behavior while setting 24px horizontal spacing |
| QA-025 | Validate utility-row 24px gap update and static regression gates | QA | UI-032 | DONE | type/lint/build pass; horizontal spacing class reflects 24px requirement |
| PM-DS-034 | Final signoff for utility-row 24px gap update | PM | QA-025 | DONE | signoff complete; frontend spacing-only update accepted |
| PM-DS-035 | Queue question-screen visual refresh execution | PM | PM-002 | DONE | queued question-screen copy removal, counter/progress relocation, iconography update, and MCQ tile-option styling |
| UI-033 | Apply question-screen layout/copy/type-scale/icon updates | UI | PM-DS-035 | DONE | active question screens updated: header copy removed, progress shell moved above card, counter now `Question N of 10`, play/star icons wired, submit right-aligned content-fit with `Submit answer` |
| UI-034 | Implement MCQ big-square one-row answer variant and design-system sync | UI | UI-033 | DONE | `RadioOption` now supports `tile` variant; MCQ options render in one row tile controls; design-system playground/catalog updated with variant support |
| QA-026 | Validate question-screen UX regression and QA harness alignment | QA | UI-034 | DONE | type/lint/build pass; QA matrix selectors/regex aligned to new counter and button hooks |
| PM-DS-036 | Final signoff and release recommendation for question-screen refresh | PM | QA-026 | DONE | signoff complete; frontend-only changes accepted with no backend/db contract impact |
| PM-DS-037 | Queue question CTA/state polish and question-line formatting update | PM | PM-002 | DONE | queued CTA icon state behavior, prompt container removal, `Qn:` prefixing, and sentence-case option rendering |
| UI-035 | Implement submit CTA icon-state polish and question/answer text formatting updates | UI | PM-DS-037 | DONE | submit icon now hidden during waiting/loading, star rendered as filled ink mask with larger size, CTA vertical padding increased, prompt container removed, prompts prefixed with `Qn:`, option labels rendered sentence case |
| QA-027 | Validate CTA state rendering and question/option formatting regressions | QA | UI-035 | DONE | typecheck/lint/build pass; submit icon visibility tied to ready state and question/option formatting verified in student active screens |
| PM-DS-038 | Final signoff for question CTA/state polish and formatting update | PM | QA-027 | DONE | signoff complete; frontend-only interaction/copy polish accepted with no API/schema impact |
| PM-DS-039 | Queue question-shell spacing and left-aligned collect-counter update | PM | PM-002 | DONE | queued explicit vertical spacing changes and left-aligned question + collect counter row with separator |
| UI-036 | Implement question-shell spacing, left-aligned counter row, and collect-star indicator | UI | PM-DS-039 | DONE | added deterministic spacing (48/8/48), left-aligned `Question X of 10`, vertical separator, and `Collect X` indicator with star icon |
| QA-028 | Validate question-shell spacing/counter layout and static regression gates | QA | UI-036 | DONE | typecheck/lint/build pass; spacing and counter-row behavior verified in active question screens |
| PM-DS-040 | Final signoff for question-shell spacing and collect-counter rollout | PM | QA-028 | DONE | signoff complete; frontend-only layout polish accepted with no backend/API/schema impact |
| PM-DS-041 | Queue Q1/Q2 lottie visual mapping update | PM | PM-002 | DONE | queued Q1/Q2 visual remap to bundled `.lottie` assets with shared two-column media layout |
| UI-037 | Implement Q1/Q2 lottie visuals and shared media layout in student question flow | UI | PM-DS-041 | DONE | added lottie player support, remapped question visuals (Q1 cat lottie, Q2 dog lottie), and reused two-column media layout for Q1 MCQ + Q2 dictation |
| QA-029 | Validate lottie rendering, asset bundling, and static regression gates | QA | UI-037 | DONE | typecheck/lint/build pass; `.lottie` bundling validated after vite `assetsInclude` update |
| PM-DS-042 | Final signoff for Q1/Q2 lottie visual update | PM | QA-029 | DONE | signoff complete; frontend-only media update accepted with no API/schema impact |
| PM-DS-043 | Queue sentence-reading pre-screen for question-set 3/4/5 | PM | PM-002 | DONE | queued staged pre-screen flow for comprehension questions with dedicated sentence artwork and `Show question` CTA |
| UI-038 | Implement sentence pre-screen (image + H3 sentence + CTA) before questions 3/4/5 | UI | PM-DS-043 | DONE | added reading-prelude mapping and flow gate: pre-screen renders before target questions; `Show question` reveals actual question/answer screen |
| QA-030 | Validate pre-screen flow gating and static regression gates | QA | UI-038 | DONE | typecheck/lint/build pass; pre-screen appears only on configured questions and question view unlock works via CTA |
| PM-DS-044 | Final signoff for question 3/4/5 pre-screen rollout | PM | QA-030 | DONE | signoff complete; frontend-only flow enhancement accepted with no backend/db/schema impact |
| PM-DS-045 | Queue Q1 single-column media-layout and asset remap update | PM | PM-002 | DONE | queued Q1-specific single-column layout with media placement between audio and answer options and asset remap to `image-question1.lottie` |
| UI-039 | Implement Q1 single-column media placement + full-width lottie render and asset remap | UI | PM-DS-045 | DONE | remapped Q1 visual to `image-question1.lottie`; Q1 MCQ now renders single-column with image between audio button and options, full available width |
| QA-031 | Validate Q1 layout remap and static regression gates | QA | UI-039 | DONE | typecheck/lint/build pass; Q1 order/layout behavior verified with full-width media render between audio and options |
| PM-DS-046 | Final signoff for Q1 single-column media-layout rollout | PM | QA-031 | DONE | signoff complete; frontend-only layout/asset update accepted with no API/schema impact |
| PM-DS-047 | Queue progress-row icon/label typography cleanup | PM | PM-002 | DONE | queued star rendering fix, `Collected` copy update, typography alignment with question badge, and separator removal |
| UI-040 | Implement progress-row star render fix and collected-label style alignment | UI | PM-DS-047 | DONE | replaced masked star with image icon, switched copy to `Collected X`, matched badge typography, and removed separator |
| QA-032 | Validate progress-row icon/label regression gates | QA | UI-040 | DONE | typecheck/lint/build pass; progress row now renders filled star icon and aligned badge style |
| PM-DS-048 | Final signoff for progress-row icon/label cleanup | PM | QA-032 | DONE | signoff complete; frontend-only visual/copy polish accepted with no backend/API impact |
| PM-DS-049 | Queue question 2 single-column parity with Q1 and cat-lottie remap | PM | PM-002 | DONE | queued Q2-specific layout parity (single-column order) and visual remap to bundled `image-cat.lottie` |
| UI-041 | Implement Q2 single-column dictation layout and `image-cat.lottie` mapping | UI | PM-DS-049 | DONE | Q2 dictation now renders `prompt -> play audio -> full-width visual -> answer`; visual map switched from dog to cat lottie |
| QA-033 | Validate Q2 single-column layout parity and static regression gates | QA | UI-041 | DONE | typecheck/lint/build pass; Q2 now matches Q1 single-column sequencing while other dictation screens remain unchanged |
| PM-DS-050 | Final signoff for Q2 single-column + cat-lottie rollout | PM | QA-033 | DONE | signoff complete; frontend-only layout/asset update accepted with no backend/API/schema impact |
| PM-DS-051 | Queue utility speaker icon color token correction | PM | PM-002 | DONE | queued icon color fix to align Sound speaker glyph with `ink` token across enabled/disabled states |
| UI-042 | Apply `ink` color to enabled speaker icon in utility Sound control | UI | PM-DS-051 | DONE | changed enabled `Volume2` icon from `brand-700` to `ink` in app shell utility row |
| QA-034 | Validate speaker icon token update and static regression gates | QA | UI-042 | DONE | typecheck/lint/build pass; Sound speaker glyph now uses `ink` token in enabled state |
| PM-DS-052 | Final signoff for speaker icon color correction | PM | QA-034 | DONE | signoff complete; frontend-only token correction accepted with no backend/API/schema impact |
| PM-DS-053 | Queue Q8 dictation image removal and single-column layout update | PM | PM-002 | DONE | queued Q8-specific dictation UX update: remove picture clue and keep single-column interaction flow |
| UI-043 | Implement Q8 single-column dictation layout without image | UI | PM-DS-053 | DONE | Q8 dictation now uses single-column flow with no visual block; Q2 single-column image flow remains intact |
| QA-035 | Validate Q8 image removal/single-column update and static regression gates | QA | UI-043 | DONE | typecheck/lint/build pass; Q8 renders without image and no regressions in dictation flow |
| PM-DS-054 | Final signoff for Q8 dictation image removal and single-column rollout | PM | QA-035 | DONE | signoff complete; frontend-only question-layout update accepted with no backend/API/schema impact |
| PM-DS-055 | Queue Q4 single-column parity and dog-lottie remap | PM | PM-002 | DONE | queued Q4-specific dictation layout parity with Q1-style single-column flow and visual remap to `image-dog.lottie` |
| UI-044 | Implement Q4 single-column dictation structure and `image-dog.lottie` mapping | UI | PM-DS-055 | DONE | Q4 dictation now renders single-column with image block between audio and answer; Q4 visual switched from dog SVG to dog lottie |
| QA-036 | Validate Q4 single-column layout + dog-lottie remap regression gates | QA | UI-044 | DONE | typecheck/lint/build pass; Q4 now matches requested single-column structure with lottie visual |
| PM-DS-056 | Final signoff for Q4 single-column + dog-lottie rollout | PM | QA-036 | DONE | signoff complete; frontend-only question-layout/media update accepted with no backend/API/schema impact |
| PM-DS-057 | Queue sentence-reading prelude single-column and instruction copy update | PM | PM-002 | DONE | queued prelude layout refresh: single-column stack, full-fill image, instruction line format, and CTA placement/style alignment |
| UI-045 | Implement sentence-reading prelude single-column structure and CTA style parity | UI | PM-DS-057 | DONE | prelude screens now render image-first single column, `QX. Read this sentence: <sentence>` text, and `Show question` CTA below sentence with submit-style type/padding |
| QA-037 | Validate sentence-prelude layout/copy/CTA styling regression gates | QA | UI-045 | DONE | typecheck/lint/build pass; prelude screens show single-column full-fill imagery and updated instruction/CTA hierarchy |
| PM-DS-058 | Final signoff for sentence-prelude layout and CTA style refresh | PM | QA-037 | DONE | signoff complete; frontend-only prelude UX update accepted with no backend/API/schema impact |
| PM-DS-059 | Queue Q6 dictation image removal and single-column layout update | PM | PM-002 | DONE | queued Q6-specific dictation UX update to remove image and enforce single-column structure |
| UI-046 | Implement Q6 single-column dictation layout without image | UI | PM-DS-059 | DONE | Q6 moved to single-column dictation flow with no image block; existing Q2/Q4 image variants preserved |
| QA-038 | Validate Q6 no-image single-column update and static regression gates | QA | UI-046 | DONE | typecheck/lint/build pass; Q6 no longer renders image and uses single-column structure without regressions |
| PM-DS-060 | Final signoff for Q6 no-image single-column rollout | PM | QA-038 | DONE | signoff complete; frontend-only question-layout update accepted with no backend/API/schema impact |
| PM-DS-061 | Queue Q10 dictation image removal and single-column layout update | PM | PM-002 | DONE | queued Q10-specific dictation UX update to remove image and enforce single-column structure |
| UI-047 | Implement Q10 single-column dictation layout without image | UI | PM-DS-061 | DONE | Q10 moved to single-column dictation flow with no image block; existing Q2/Q4 image variants preserved |
| QA-039 | Validate Q10 no-image single-column update and static regression gates | QA | UI-047 | DONE | typecheck/lint/build pass; Q10 no longer renders image and uses single-column structure without regressions |
| PM-DS-062 | Final signoff for Q10 no-image single-column rollout | PM | QA-039 | DONE | signoff complete; frontend-only question-layout update accepted with no backend/API/schema impact |
| PM-DS-063 | Queue completion-state card redesign and completion-background swap | PM | PM-002 | DONE | queued completion-screen refresh: centered single-column card, copy/content updates, completion artwork, and completion-specific tiled background |
| UI-048 | Implement completion card redesign, completion artwork, and completion-only background override | UI | PM-DS-063 | DONE | completion screen now uses centered single-column 450px card with `Baseline Complete`, subtitle, star+collected line, image banner, and completion-only tiled `bg-complete.svg` body background |
| QA-040 | Validate completion-screen redesign and static regression gates | QA | UI-048 | DONE | typecheck/lint/build pass; completion state layout/content/background override validated without flow regressions |
| PM-DS-064 | Final signoff for completion-screen redesign rollout | PM | QA-040 | DONE | signoff complete; frontend-only completion UI refresh accepted with no backend/API/schema impact |
| PM-DS-065 | Queue brand asset refresh and favicon update | PM | PM-002 | DONE | queued replacement of bundled app logo from local assets and favicon swap to `favicon-vocabpal.png` |
| UI-049 | Replace bundled logo asset and wire favicon to `favicon-vocabpal.png` | UI | PM-DS-065 | DONE | updated `web/src/assets/branding/logo-vocabpal.png`, added `web/public/favicon-vocabpal.png`, and switched `web/index.html` favicon link to PNG |
| QA-041 | Validate brand asset refresh/fav icon update and static regression gates | QA | UI-049 | DONE | typecheck/lint/build pass; favicon link resolves to new PNG and app compiles with updated logo asset |
| PM-DS-066 | Final signoff for brand asset refresh and favicon rollout | PM | QA-041 | DONE | signoff complete; frontend-only brand asset update accepted with no backend/API/schema impact |
| PM-DS-067 | Queue progress-row collected badge alignment/spacing refinement | PM | PM-002 | DONE | queued right-alignment of collected badge and icon-label spacing reduction to 4px |
| UI-050 | Right-align collected badge and reduce icon-label gap to 4px | UI | PM-DS-067 | DONE | set collected badge to `ml-auto` for right alignment and reduced star/text gap from 8px to 4px |
| QA-042 | Validate collected-badge alignment/spacing tweak and static regression gates | QA | UI-050 | DONE | typecheck/lint/build pass; collected badge right-aligned and icon-text spacing reduced per spec |
| PM-DS-068 | Final signoff for collected-badge alignment/spacing update | PM | QA-042 | DONE | signoff complete; frontend-only spacing/alignment polish accepted with no backend/API/schema impact |
| PM-DS-069 | Queue teacher dashboard simplification and analytics refactor | PM | PM-002 | DONE | queued removal of legacy session/reopen cards and replacement with status toggle, searchable attempts, sticky detail, and class-level visuals |
| BE-010 | Add backend support for latest baseline status and attempt archive | Backend | PM-DS-069 | DONE | `teacher-windows` now supports GET; added `teacher-attempt-archive` function to archive attempt and reopen access |
| UI-051 | Refactor teacher dashboard layout, filters, sticky detail, and archive flow | UI | BE-010 | DONE | removed averages/session/reopen cards, added paused/in-progress toggle, search+class filter, sticky detail, class visual analytics, and archive confirmation |
| QA-043 | Validate teacher dashboard refactor and static regression gates | QA | UI-051 | DONE | typecheck/lint/build pass after backend+UI refactor |
| PM-DS-070 | Final signoff for teacher dashboard refactor rollout | PM | QA-043 | DONE | signoff complete; requested teacher dashboard behavior delivered with no schema migration impact |
| PM-DS-071 | Queue student question width cap and entry logo scale increase | PM | PM-002 | DONE | queued student-only sizing update: question surfaces max width 850px and entry logo width 350px |
| UI-052 | Apply 850px max-width for question screens and 350px entry logo width | UI | PM-DS-071 | DONE | constrained student active-question container to 850px (utility row unchanged) and updated entry logo width to 350px |
| QA-044 | Validate question-width/logo-size update and static regression gates | QA | UI-052 | DONE | typecheck/lint/build pass after sizing change |
| PM-DS-072 | Final signoff for question-width/logo-size update | PM | QA-044 | DONE | signoff complete; frontend-only sizing update accepted with no backend/API/schema impact |
| PM-DS-073 | Queue multi-select archive workflow for teacher attempts | PM | PM-002 | DONE | queued backend+UI+QA rollout for multi-select archive with confirmation dialog and dashboard-metric refresh |
| BE-011 | Extend archive API to support one-or-many attempt IDs | Backend | PM-DS-073 | DONE | `teacher-attempt-archive` now accepts `attemptIds[]` and archives in bulk with student summary in response |
| UI-053 | Add attempts multi-select + archive-selected controls in teacher dashboard | UI | BE-011 | DONE | added checkbox selection per attempt, select-visible/clear-visible controls, and archive-selected CTA with same confirmation dialog |
| QA-045 | Validate multi-select archive flow and dashboard metric refresh behavior | QA | UI-053 | DONE | typecheck/lint/build pass; archive paths trigger refresh so counts/averages/class visuals recompute from latest data |
| PM-DS-074 | Final signoff for teacher multi-select archive rollout | PM | QA-045 | DONE | signoff complete; requested bulk archive behavior delivered with no schema migration impact |
| PM-DS-075 | Queue teacher mobile UX optimization | PM | PM-002 | DONE | queued mobile-only IA split (`Attempts`/`Detail`) and compact header strategy for <=768px |
| UI-054 | Implement mobile Attempts/Detail split architecture | UI | PM-DS-075 | DONE | added mobile panel tabs, panel state persistence, and select-attempt auto-switch to detail |
| UI-055 | Implement compact mobile header and contextual bulk-action bar | UI | UI-054 | DONE | compacted mobile teacher header controls and made bulk-action controls contextual on mobile selection |
| UI-056 | Implement mobile detail sticky action row and auto-switch behavior | UI | UI-055 | DONE | mobile detail panel now has sticky top actions (`Back to attempts`, `Archive`) with preserved grouped detail content |
| QA-051 | Mobile responsive/interaction regression for teacher dashboard | QA | UI-056 | DONE | typecheck/lint/build pass; validated mobile panel switching, selection flow, and desktop/tablet layout parity |
| QA-052 | Data/action parity checks for archive, selection, pagination, filter in mobile mode | QA | QA-051 | DONE | validated archive and list controls preserve totals/filter/pagination state across mobile panel switches |
| PM-DS-076 | Final signoff and release recommendation for mobile teacher UX optimization | PM | QA-052 | DONE | signoff complete; mobile-only UX optimization accepted with no backend/API/schema changes |
| PM-DS-077 | Queue mobile teacher icon-only sheet-flow redesign | PM | PM-002 | DONE | queued and executed mobile teacher redesign packet (icon-only controls, full-sheet detail, filter bottom sheet) |
| UI-057 | Implement mobile width/surface restructure and non-sticky attempts stream | UI | PM-DS-077 | DONE | mobile attempts/search/filter/actions/pagination moved outside cards on page background; non-sticky list stream implemented |
| UI-058 | Implement icon-only mobile controls + filter bottom sheet + top utility icon mapping | UI | UI-057 | DONE | mobile teacher/top utility controls switched to icon-only using bundled local icons; class filter now opens bottom sheet picker |
| UI-059 | Implement full-screen detail sheet with icon-only back/archive and state persistence | UI | UI-058 | DONE | mobile attempt row now opens fixed full-screen detail sheet with icon-only back/archive and preserved list/filter/page context |
| QA-053 | Mobile UX/interaction regression for teacher dashboard | QA | UI-059 | DONE | validated phone layout density, icon-only affordances, search/filter/sheet navigation, and desktop/tablet parity gates |
| QA-054 | Data/action parity checks for archive, selection, pagination, filter, totals in mobile mode | QA | QA-053 | DONE | release-gate suite passed (remote/matrix/data/after-deploy); archive single+bulk and totals/pagination/filter parity confirmed |
| PM-DS-078 | Final signoff and release recommendation for PM-DS-077 rollout | PM | QA-054 | DONE | signoff complete; mobile-only teacher UX overhaul accepted with no backend/API/schema changes |
| PM-DS-079 | Queue adaptive utility bar variant architecture rollout | PM | PM-002 | DONE | queued explicit context/viewport/presentation contract for top utility to cover student, teacher, login, completion, and narrow devices |
| UI-060 | Implement adaptive utility variants in app shell with deterministic narrow-screen behavior | UI | PM-DS-079 | DONE | added `UtilityContext`, viewport buckets, presentation variants, and deterministic icon/collapse handling that no longer depends on logo visibility for narrow layouts |
| UI-061 | Wire app/state context into utility shell across student and teacher flows | UI | UI-060 | DONE | `App.tsx` now passes explicit utility context; student mode emits entry/attempt/completion state for utility variant selection |
| QA-055 | Validate utility-bar responsiveness across 350px, 375px, tablet, and desktop states | QA | UI-061 | DONE | typecheck/lint/build passed; narrow-screen utility now renders icon/collapsed variants without wrapping regressions |
| PM-DS-080 | Final signoff and release recommendation for adaptive utility architecture | PM | QA-055 | DONE | signoff complete; top utility contract now explicit and robust across all core app contexts |
| PM-DS-081 | Queue mobile utility polish pass (icon alignment + spacing + filter sheet icon semantics) | PM | PM-002 | DONE | scoped narrow-screen polish for top utility and teacher filter sheet action clarity |
| UI-062 | Fix teacher mobile filter sheet action icon semantics and pause/play icon centering | UI | PM-DS-081 | DONE | close/cancel/confirm now use distinct icons and session-status icon buttons are centered within their containers |
| UI-063 | Apply 8px mobile shell side padding and improve top utility icon spacing/centering | UI | UI-062 | DONE | base shell mobile padding now 8px and icon-mode top utility triggers use explicit centered 44px targets with improved spacing |
| QA-056 | Validate mobile utility and filter sheet polish across student and teacher contexts | QA | UI-063 | DONE | typecheck/lint/build passed; reviewed top utility icon alignment and filter action affordances on mobile |
| PM-DS-082 | Final signoff for mobile utility polish pass | PM | QA-056 | DONE | signoff complete for mobile utility polish without backend/API/schema changes |
| PM-DS-083 | Queue desktop teacher padding normalization to 16px side gutters | PM | PM-002 | DONE | scoped desktop-only teacher dashboard gutter correction to preserve 8px mobile / 16px desktop breakpoint behavior |
| UI-064 | Remove duplicate desktop horizontal inset inside teacher dashboard wrapper | UI | PM-DS-083 | DONE | changed teacher dashboard inner wrapper from `px-2` to `px-2 md:px-0` so desktop uses shell-level 16px gutters only |
| QA-057 | Validate teacher dashboard spacing parity across mobile and desktop breakpoints | QA | UI-064 | DONE | typecheck/lint/build passed; desktop now aligns to 16px shell padding while mobile keeps 8px side inset |
| PM-DS-084 | Final signoff for desktop teacher gutter normalization | PM | QA-057 | DONE | signoff complete; spacing fix is UI-only with no API/schema/behavioral impact |
| PM-DS-085 | Queue teacher shell width-cap removal for true 16px desktop side gutters | PM | PM-002 | DONE | identified remaining desktop side gap root cause as `max-w-[850px]` shell cap and scoped full-width teacher shell fix |
| UI-065 | Remove teacher app-shell max width cap while preserving breakpoint padding contract | UI | PM-DS-085 | DONE | changed teacher shell width from `max-w-[850px]` to `max-w-full` so content spans available width with `md:px-4` gutters |
| QA-058 | Validate teacher shell width and side gutter behavior across desktop/tablet/mobile | QA | UI-065 | DONE | typecheck/lint/build passed; desktop now honors 16px side gutters without centered narrow-column cap |
| PM-DS-086 | Final signoff for teacher shell width-cap removal | PM | QA-058 | DONE | signoff complete; desktop spacing now matches intent with no API/schema changes |
| PM-ANL-001 | Queue Microsoft Clarity student-journey instrumentation rollout | PM | PM-002 | DONE | queued script-based Clarity integration, strict event/tag taxonomy, alias-based attempt linking, and no-PII policy |
| UI-066 | Add Clarity loader/env-gating/client wrapper and app-root context tagging | UI | PM-ANL-001 | DONE | added `web/src/lib/clarity.ts`, global typings, app-root `initClarity` call, and context tags for mode/motion/sound/student view state |
| UI-067 | Instrument student funnel milestones and key question actions/tags | UI | UI-066 | DONE | added student entry/start/question/audio/submit/completion events + tags with per-question dedupe and attempt aliasing |
| QA-059 | Validate Clarity event/tag emission and no-PII contract | QA | UI-067 | DONE | local static gates passed; verified instrumentation uses class/section primitives + hashed attempt alias and no student name fields |
| QA-060 | Validate journey reconstruction readiness and rollout env docs | QA | QA-059 | DONE | funnel taxonomy documented for Clarity; env keys added to `.env.example` for production gating (`VITE_CLARITY_ENABLED`, `VITE_CLARITY_PROJECT_ID`) |
| PM-ANL-002 | Final signoff for Clarity student journey rollout | PM | QA-060 | DONE | signoff complete; frontend-only analytics instrumentation accepted pending Vercel env configuration checkpoint |
| PM-ANL-003 | Queue Clarity masking policy adjustment (mask name fields only) | PM | PM-ANL-002 | DONE | scoped selective masking: unmask app surfaces and explicitly mask name-entry/search fields |
| UI-068 | Apply Clarity mask/unmask attributes across app shell and name fields | UI | PM-ANL-003 | DONE | added `data-clarity-unmask` at shell root and `data-clarity-mask` on student/teacher name fields and teacher name-search fields |
| QA-061 | Validate Clarity masking behavior and static regression gates | QA | UI-068 | DONE | typecheck/lint/build pass; verified attributes present on target nodes with no runtime regressions |
| PM-ANL-004 | Final signoff for Clarity masking policy adjustment | PM | QA-061 | DONE | signoff complete; masking policy implemented with documented Clarity input-field limitation |
| PM-ANL-009 | Queue full AI removal and artifact purge | PM | PM-ANL-004 | DONE | scoped and executed full AI purge across runtime code, backend functions, design system docs/catalog, env/config, and historical AI artifacts |
| BE-017 | Remove AI backend endpoints/modules/config | Backend | PM-ANL-009 | DONE | deleted `teacher-ai-query` function and AI shared modules, and removed AI function wiring from Supabase config |
| UI-077 | Remove AI from teacher runtime UI/state | UI | BE-017 | DONE | removed teacher AI tab/panel logic and restored attempts/detail-only IA across desktop/tablet/mobile |
| UI-078 | Remove AI from design system/types/catalog | UI | UI-077 | DONE | removed AI component/type references and AI sections from `/designsystem` catalog/playground/guidance |
| PM-ANL-010 | Purge AI historical artifacts from plans/handoffs/board | PM | UI-078 | DONE | deleted AI-specific plans and handoffs and removed legacy AI rows/checkpoints from board records |
| QA-070 | Runtime regression + static gates after AI removal | QA | PM-ANL-010 | DONE | typecheck/lint/build pass and runtime search confirms no AI endpoint/UI references in active code paths |
| QA-071 | Post-deploy verification + endpoint absence checks | QA | QA-070 | DONE | release-gate and after-deploy checks completed with no AI route usage and no teacher dashboard regressions |
| PM-ANL-011 | Final signoff for full AI purge | PM | QA-071 | DONE | signoff complete; AI feature fully removed from runtime, docs, and in-repo historical artifacts |
| PM-QA-016 | Queue baseline session-status stability fix for teacher dashboard | PM | PM-QA-015 | DONE | scoped production status drift fix: prefer latest non-ended window and avoid QA leaving paused latest window |
| BE-012 | Update teacher-windows GET to prioritize latest non-ended window | Backend | PM-QA-016 | DONE | `teacher-windows` now scans recent windows and returns latest non-ended window before falling back to latest ended window |
| QA-062 | Align remote smoke session cleanup to end (not pause) and validate static gates | QA | BE-012 | DONE | `qa/remote_smoke.mjs` now ends its QA session; typecheck/lint/build passed |
| PM-QA-017 | Final signoff for baseline session-status stability fix | PM | QA-062 | DONE | signoff complete; build-triggered QA windows no longer force dashboard into paused via latest-window selection |
| PM-QA-018 | Queue strict manual-pause enforcement so baseline never auto-pauses | PM | PM-QA-017 | DONE | scoped follow-up guardrails: no paused default/fallback state and no creating paused windows from implicit flows |
| BE-013 | Enforce manual pause semantics in teacher-windows function | Backend | PM-QA-018 | DONE | no-window GET now reports `ended`, POST rejects paused creation, PATCH pause requires explicit window id and non-ended state |
| UI-069 | Remove ended->paused coercion and block pause action when no active window | UI | BE-013 | DONE | teacher dashboard now preserves true session status and surfaces explicit error if pause is attempted without an active window |
| QA-063 | Validate manual-pause-only behavior and static regression gates | QA | UI-069 | DONE | typecheck/lint/build passed; verified no automatic paused fallback in backend or teacher UI status mapping |
| PM-QA-019 | Final signoff for manual-pause-only enforcement | PM | QA-063 | DONE | signoff complete; paused state now appears only after explicit teacher pause action on an active session |
| PM-QA-020 | Queue pause/resume functional verification hardening for student-entry gate | PM | PM-QA-019 | DONE | scoped enforcement so paused teacher state blocks student start, and added smoke coverage for pause->resume transition |
| BE-014 | Make student-start window resolution honor latest non-ended window state | Backend | PM-QA-020 | DONE | `getOpenWindowForStudent` now evaluates latest non-ended window (open/paused/allowlist) instead of any historical open window |
| QA-064 | Add remote smoke pause/resume assertions and run static gates | QA | BE-014 | DONE | `qa/remote_smoke.mjs` now validates pause blocks student start and resume re-enables flow; typecheck/lint/build passed locally |
| PM-QA-021 | Final signoff for pause/resume functional reliability | PM | QA-064 | DONE | signoff complete; pause/resume now validated at both API logic and QA smoke contract levels |
| PM-DS-087 | Queue destructive-button icon contrast fix across app and design system | PM | PM-002 | DONE | scoped shared style fix so destructive button icons render white consistently without per-screen overrides |
| UI-070 | Enforce white icon rendering in destructive button variant contract | UI | PM-DS-087 | DONE | updated shared destructive button variant to force child icon image filter to white across Button and MotionButton usage |
| QA-065 | Validate destructive icon contrast in teacher dashboard and design system playground | QA | UI-070 | DONE | typecheck/lint/build passed; shared variant contract now guarantees white icon treatment in destructive controls |
| PM-DS-088 | Final signoff for destructive icon contrast fix | PM | QA-065 | DONE | signoff complete for UI-only contrast update with no backend/schema impact |
| PM-QA-010 | Queue post-push release-gate validation and CI checkpoint closure | PM | PM-002 | DONE | scoped QA harness alignment and rerun of `qa:after-deploy` after main push |
| QA-010 | Align matrix harness with audio-end submit gate and rerun release gate | QA | PM-QA-010 | DONE | updated submit selector + mock audio `onended`; `qa:matrix` and `qa:after-deploy` passed |
| PM-QA-011 | Sign off post-push QA recovery and checkpoint closure | PM | QA-010 | DONE | verified green after-deploy report and cleared CP-07 via GitHub secrets |
| PM-QA-012 | Queue CI lockfile remediation after remote workflow failure | PM | PM-QA-011 | DONE | isolated GitHub failure to `npm ci` lockfile drift and routed lock sync fix |
| QA-011 | Sync workspace lockfile for CI parity and rerun after-deploy gate | QA | PM-QA-012 | DONE | refreshed root lockfile via `npm install`; local `npm ci` and `qa:after-deploy` passed |
| PM-QA-013 | Final signoff for remote CI status-check recovery | PM | QA-011 | DONE | GitHub `QA After Deploy` run `22375759854` passed; required status-check path recovered |
| PM-QA-014 | Define comprehensive hard-gate QA execution path | PM | PM-002 | DONE | comprehensive QA program execution packet completed (hard-gate + phased load) |
| QA-046 | Expand automated gate coverage across UI/UX/data/code paths | QA | PM-QA-014 | DONE | added `qa:release-gate`, updated matrix onboarding flow, and after-deploy data-audit stage |
| QA-047 | Add UX stability and visual consistency checks | QA | QA-046 | DONE | matrix suite now validates current student 2-step onboarding and core interaction stability |
| QA-048 | Add data-integrity audit pack for attempts/classes/archive/reopen/time invariants | QA | QA-046 | DONE | implemented `qa/data_integrity_audit.mjs` and integrated report artifacts |
| QA-049 | Integrate hard release gate policy into CI and local release checklist | QA | QA-046, QA-047, QA-048 | DONE | QA workflow now runs `qa:release-gate`; README and report schema coverage updated |
| QA-050 | Implement phased 500-student load validation track with weekly cadence | QA | QA-049 | DONE | added `qa:load-500` script and scheduled weekly GitHub Actions workflow |
| PM-QA-015 | Final QA signoff and pilot readiness recommendation | PM | QA-050 | DONE | PM review completed with hard-gate and weekly-load governance in place |
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
| CP-08-CLARITY-PROJECT | Before first production Clarity collection | Create/get Microsoft Clarity project ID | PM-ANL-001 onward | PENDING |
| CP-09-VERCEL-ENV-CLARITY | Before releasing Clarity instrumentation | Add `VITE_CLARITY_ENABLED=true` and `VITE_CLARITY_PROJECT_ID` in Vercel Production env | PM-ANL-002 | PENDING |

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
