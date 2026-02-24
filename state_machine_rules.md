# State Machine Rules (Agent Orchestration)

This rule set is mandatory for all future requests and modifications in this repository.

## 1. Ownership
1. PM is the only authority allowed to change task states.
2. Specialist agents can propose a state change inside handoff notes.
3. Final state update is committed by PM in `agent_board.md`.

## 2. States
1. `TODO`
2. `READY`
3. `RUNNING`
4. `BLOCKED`
5. `REVIEW`
6. `DONE`

## 3. Allowed Transitions
1. `TODO -> READY`
2. `READY -> RUNNING`
3. `RUNNING -> REVIEW`
4. `RUNNING -> BLOCKED`
5. `BLOCKED -> READY`
6. `REVIEW -> DONE`
7. `REVIEW -> RUNNING` (rework required)
8. `DONE -> RUNNING` (only if PM opens a regression fix task reference)

## 4. Transition Guards

### 4.1 TODO -> READY
1. All dependencies are `DONE`.
2. Inputs are listed and available.
3. Acceptance criteria are defined.

### 4.2 READY -> RUNNING
1. No higher-priority blocking task is waiting.
2. Required checkpoint is already cleared, if applicable.
3. Owner agent is assigned.

### 4.3 RUNNING -> REVIEW
1. Work output is complete and documented.
2. Handoff is recorded using `templates/handoff_template.md`.
3. Evidence is attached (tests, commands, screenshots, notes).

### 4.4 RUNNING -> BLOCKED
1. Blocker reason is concrete and reproducible.
2. Unblock condition is explicit.
3. Blocker is either:
1. one of the explicit checkpoints in `agent_board.md`
2. a missing dependency artifact.

### 4.5 BLOCKED -> READY
1. Unblock condition has been verified.
2. Required credentials/decisions/artifacts are present.

### 4.6 REVIEW -> DONE
1. PM validates all acceptance criteria.
2. No open P0/P1 defect tied to this task.
3. Downstream dependency links are updated.

### 4.7 REVIEW -> RUNNING
1. Rework scope is listed.
2. Missing acceptance criteria are listed.
3. A new handoff is required after rework.

## 5. Parallelism Rules (Single Chat)
1. Default mode is serial execution in this thread.
2. PM may declare parallel-safe tasks only when they are independent and non-overlapping.
3. If one parallel task blocks, the other may continue if no dependency conflict exists.

## 6. Definition of Blocked
A task is `BLOCKED` if any of the following is true:
1. A required explicit checkpoint is pending.
2. A dependency output is missing.
3. A hard environment failure prevents progress.
4. A locked decision from `master_plan.md` is unclear or contradictory.

## 7. Checkpoint Protocol
1. Use `templates/checkpoint_request_template.md`.
2. One checkpoint request must include:
1. checkpoint id
2. exact commands for user
3. expected success signal
4. affected tasks.
3. After checkpoint completion, PM updates blocked tasks to `READY`.

## 8. Audit Log Convention
Each completed task should append a short entry in the handoff:
1. task id
2. files changed
3. tests run
4. residual risks
5. next recommended task id.

## 9. Failure Escalation
1. If a task re-enters `RUNNING` more than 2 times, PM must open a root-cause note.
2. If a checkpoint stays pending for more than 1 day, PM marks schedule risk in status report.
3. If test failures are flaky, QA must isolate and tag them before proceeding.
