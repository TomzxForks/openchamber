---
id: "12"
title: "Surface ACP failures as visible error states"
status: pending
size: S
depends_on: ["8", "10"]
completed_date: null
blocker: null
---

# Task 12: Surface ACP failures as visible error states

## Description

Surface initialize and streaming failures as visible, non-success error states (FR-6).
On a mid-turn connection drop, preserve prior streamed content and enter an explicit error state (NFR-4).
Ensure ACP failure never mutates global state and OpenCode remains fully functional.

## Acceptance Criteria

- [ ] Spawn/handshake failure shows a visible error (FR-6).
- [ ] Mid-turn drop preserves prior content and shows an error state (NFR-4).
- [ ] ACP failure is scoped to the ACP session; OpenCode sessions are unaffected (FR-6 failure isolation).
- [ ] The app never enters a broken global state on ACP failure.

## Notes

- Error states use the locale system for messaging (NFR-7).
- Failure must be distinguished from empty success throughout (partial-failure-safe rule).
