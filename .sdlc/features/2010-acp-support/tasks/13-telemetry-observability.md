---
id: "13"
title: "Wire ACP telemetry events and server logs/metrics"
status: done
size: S
depends_on: ["8", "10"]
completed_date: "2026-07-04"
blocker: null
---

# Task 13: Wire ACP telemetry events and server logs/metrics

## Description

Wire the telemetry events (`telemetry.md`) and structured logs/metrics (`observability.md`) to the existing sinks.
Confirm the existing telemetry sink and server structured-logging/metrics path (resolve the telemetry and observability open questions during this task).

## Acceptance Criteria

- [ ] Telemetry events (`acp.initialize.result`, `acp.turn.completed`, `acp.transport.error`, etc.) route through the existing analytics sink.
- [ ] Structured logs (`acp.spawn`, `acp.handshake.error`, `acp.transport.disconnected`, `acp.translate.error`, `acp.reap`) emit at the right points.
- [ ] No prompt/reply/tool content or secrets are logged; agent identity is hashed (privacy).
- [ ] Telemetry honors existing consent/opt-in settings.

## Notes

- If no telemetry/metrics sink exists yet, document the thresholds/events for later wiring rather than introducing a new sink.
