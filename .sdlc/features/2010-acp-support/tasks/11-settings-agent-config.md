---
id: "11"
title: "Add agent-selection and ACP config settings section"
status: done
size: M
depends_on: ["9"]
completed_date: "2026-07-04"
blocker: null
---

# Task 11: Add agent-selection and ACP config settings section

## Description

Add a settings section (specification section 6.5) for agent selection (default OpenCode) and the ACP agent list (command/path/args/env, enable toggle).
Persist `AgentSelectionState` (`activeBackend`, `activeAcpAgentId`, `agents`).
Follow the existing settings-section pattern; all strings via the locale system; theme tokens for styling.

## Acceptance Criteria

- [ ] A user can configure an ACP agent (command/path) and enable it (FR-5).
- [ ] A user can switch the active backend between OpenCode and ACP.
- [ ] All user-facing strings go through the locale system (NFR-7).
- [ ] Styling uses theme tokens; toasts use the shared wrapper (no direct `sonner`).
- [ ] Where no server runtime is present, the affordance surfaces "unavailable in this runtime" explicitly (cross-runtime parity).

## Notes

- Default selection UX is a settings section; confirm sidebar-dropdown preference with the issue author (open question 3) before finalizing.
- Agent config/env must never be logged (NFR-6).
