---
issue: "#2010"
title: "Add Agent Client Protocol (ACP) support"
status: approved
---

# Telemetry: Add Agent Client Protocol (ACP) support

> Review: approved (2026-07-04). Events are measurable, funnel isolates the FR-6 spawn/handshake failure point and the FR-3 streaming failure point, privacy excludes all prompt/reply/tool content, and the single open question (existing telemetry sink) is correctly deferred to implementation.

# Telemetry: Add Agent Client Protocol (ACP) support

## Overview

Telemetry for ACP support measures adoption (how often ACP is selected vs OpenCode), reliability (handshake/streaming success rates), and the protocol-translation surface (events emitted per turn), without logging prompts, replies, tool inputs, or any secret/config content.

## Events

| Event | When | Properties | PII |
|---|---|---|---|
| `acp.feature_flag` | App boot; reports whether the ACP feature flag is enabled | `enabled: boolean` | None |
| `acp.agent.selected` | User changes the active backend or ACP agent | `backend: "opencode"\|"acp"`, `agentIdHash: string` (hash, not name) | None (agentId hashed) |
| `acp.initialize.start` | `/api/agent/acp/initialize` invoked | `agentIdHash` | None |
| `acp.initialize.result` | Handshake completes or fails | `outcome: "success"\|"error"`, `errorCode?: string`, `durationMs: number` | None |
| `acp.session.created` | ACP `session/new` succeeds | `agentIdHash` | None |
| `acp.prompt.submitted` | ACP prompt sent | `agentIdHash`, `messageId` (client-generated, opaque) | None |
| `acp.turn.completed` | `session/prompt` returns a stopReason | `stopReason: "end_turn"\|"cancelled"\|"max_tokens"\|…`, `durationMs`, `chunkCount` | None |
| `acp.transport.error` | Dropped connection / stdio error mid-turn | `errorCode: string`, `phase: "initialize"\|"stream"\|"prompt"` | None |

## Funnel

```
feature_flag enabled
  → agent.selected (acp)
    → initialize.start
      → initialize.result (success)
        → session.created
          → prompt.submitted
            → turn.completed (success) | transport.error
```

Drop-off between `initialize.start` and `initialize.result(success)` isolates spawn/handshake failures (FR-6).
Drop-off between `prompt.submitted` and `turn.completed` isolates streaming/translation failures.

## Success Metrics

| Metric | Target | Why |
|---|---|---|
| ACP handshake success rate (`initialize.result` success / start) | >= 95% for valid agent configs | FR-2/FR-6 reliability |
| Turn completion rate (`turn.completed` / `prompt.submitted`) | >= 95% excluding user cancels | FR-3 reliability |
| OpenCode regression rate | 0% change in existing OpenCode turn metrics when ACP is off | NFR-1 |
| ACP adoption (selections of `acp` backend) | Baseline + trending (no fixed target) | Strategic validation of the needs-assessment bet |

## Privacy

- No prompt text, reply text, tool inputs/outputs, file paths, or agent command lines are logged.
- Agent identity is hashed, not stored in cleartext.
- Telemetry honors the existing OpenChamber telemetry opt-in/consent settings.

## Open Questions

1. Does OpenChamber already have a telemetry/analytics sink to route these events through, or does this feature require introducing one? Resolve at implementation by checking for an existing analytics module.
