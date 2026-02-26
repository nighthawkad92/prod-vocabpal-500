# Linear Issue Templates

## Request (`type:request`)
Title:
`REQ | <short request title>`

Body:
```md
## Context

## User / Stakeholder Need

## Success Criteria

## Constraints

## Linked Story
- (add once created)
```

## Story (`type:story`)
Title:
`STORY | <scope title>`

Body:
```md
## Parent Request
Parent Request: <REQ-KEY>

## Scope

## Acceptance Criteria

## Out of Scope

## Implementation Tasks
- <TASK-KEY>
```

## Task (`type:task`)
Title:
`<TASK_ID> | <implementation title>`

Body:
```md
## Objective

## Parent Story
Parent Story: <STORY-KEY>

## Parent Request
Parent Request: <REQ-KEY>

## Implementation Notes

## Tests

## Risks

## Requested PM Action
```

## Bug (`type:bug`)
Title:
`BUG | <symptom>`

Body:
```md
## Repro Steps

## Parent Story
Parent Story: <STORY-KEY>

## Parent Request
Parent Request: <REQ-KEY>

## Expected vs Actual

## Impact

## Fix Scope

## Validation
```

## Decision (`type:decision`)
Title:
`DECISION | <decision statement>`

Body:
```md
## Decision

## Options Considered

## Rationale

## Tradeoffs

## Impacted Issues
- <STORY/TASK KEYS>
```

## Incident (`type:incident`)
Title:
`INCIDENT | <env> | <event>`

Body:
```md
## Source Event
- source:
- eventType:
- url:

## Impact

## Mitigation

## Follow-up Actions
- <BUG/RELEASE KEYS>
```

## Build Event (`type:build-event`)
Title:
`BUILD | <env> | <status> | <sha short>`

Body:
```md
## Event Payload
- source:
- eventType:
- environment:
- status:
- sha:
- url:
- timestamp:

## Notes
```

## Release (`type:release`)
Title:
`RELEASE | prod | <YYYY-MM-DD> | <sha short>`

Body:
```md
## Release Metadata
- SHA:
- Environment: prod
- Source: github
- Run URL:

## Release Checklist
Included Issues:
QA Report:
PM Approval: PENDING
QA Approval: PENDING
Override: NO

## Override Record (Required when gate:override present)
Override approved by PM:
Override approved by QA:
Follow-up Issue:
Rationale:

## Changelog
- Pending generation
```

## Insight (`type:insight`)
Title:
`INSIGHT | <weekly/cycle> | <date>`

Body:
```md
## Summary

## KPI Snapshot

## Risks

## Recommended Actions
```
