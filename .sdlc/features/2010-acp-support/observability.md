---
issue: "#2010"
title: "Add Agent Client Protocol (ACP) support"
status: approved
---

# Observability: Add Agent Client Protocol (ACP) support

> Review: approved (2026-07-04). Logging is structured and excludes secrets; metrics isolate spawn, streaming, and orphan-reap health; the absence of an existing APM sink is noted rather than assumed.

## Overview

ACP support is primarily server-side (subprocess + JSON-RPC + event translation), so observability concentrates on server-side agent lifecycle health, translation correctness, and failure surfacing.
No new infra is introduced in the Must scope; logging and metrics use whatever structured-logging and metrics path the server already uses.

## Logging

Structured logs (no secrets, no prompt/reply/tool content) at these points:

| Log event | Level | Fields | Notes |
|---|---|---|---|
| `acp.spawn` | info | `agentIdHash`, `pid` | Agent subprocess started |
| `acp.handshake.complete` | info | `agentIdHash`, `durationMs`, `capabilities` (names only) | initialize done |
| `acp.handshake.error` | error | `agentIdHash`, `errorCode`, `message` | FR-6 failure surface |
| `acp.session.new` | info | `agentIdHash`, `sessionId` (opaque) | |
| `acp.transport.disconnected` | warn | `agentIdHash`, `phase`, `errorCode` | Mid-turn drop; NFR-4 |
| `acp.translate.error` | error | `agentIdHash`, `notificationType`, `message` | Translation failure at the event seam |
| `acp.reap` | info | `pid`, `reason: "orphan"\|"shutdown"` | Orphan reaper activity |

Secrets/config (`AcpAgentConfig.env`, command args) are never logged; only `agentIdHash`.

## Metrics

| Metric | Type | Purpose |
|---|---|---|
| `acp_agents_active` | gauge | Live ACP subprocesses |
| `acp_handshake_total{outcome}` | counter | Spawn/handshake success vs error (FR-6) |
| `acp_turn_total{stopReason}` | counter | Turn outcomes |
| `acp_transport_errors_total{phase}` | counter | Connection drops by phase |
| `acp_translate_errors_total` | counter | Event-translation failures |
| `acp_orphan_reaped_total` | counter | Orphan-reap activity |
| `acp_event_emit_duration_ms` | histogram | Translation throughput on the hot path |

## Alerts

| Alert | Condition | Severity |
|---|---|---|
| ACP handshake failure spike | `rate(acp_handshake_total{outcome="error"}) / rate(acp_handshake_total) > 0.2` over 10m | Warning |
| Translation error spike | `rate(acp_translate_errors_total) > 0.05/s` over 5m | Warning |
| Orphan accumulation | `acp_agents_active` far exceeds expected live sessions for 15m | Warning |

Alerts are defined only where an existing alerting sink exists; otherwise these are documented thresholds to wire when a sink is introduced.

## Tracing

Where distributed/request tracing is available: span the `/api/agent/acp/*` request through handshake → `session/new` → prompt → first streamed event → stopReason, so end-to-end ACP latency is attributable.

## Open Questions

1. Confirm the server's existing structured-logging and metrics path (structlog-equivalent / prometheus-equivalent) so these log events and metrics route through it rather than introducing a new sink. Resolve at implementation.
