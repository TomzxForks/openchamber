---
artifact: specification.md
verdict: approved
reviewed_at: 2026-07-04
---

## Ambiguities

No blocking issues.
Two open questions are correctly flagged (SDK `ClientSideConnection` transport ownership; final selection UX) and both have clear resolution paths at implementation start / with the issue author.
The `AgentClient` interface, data model, and API contracts are concrete enough to implement against.

## Inconsistencies

No issues found.
The design is internally consistent: server-side event translation (5.2) matches the reused-sync-layer claim (section 2 validation), the `AcpClient.prompt()` contract (returns message id immediately, streams via 5.2) matches the OpenCode adapter contract, and the agent-process-manager generalization (6.2) is consistent with the data model (4.3) and the existing-solutions recommendation.

## Gaps / Implementability

No blocking issues.

- Assumption #1 is validated via a concrete shape diff (section 2), satisfying the feasibility go-condition.
- Error handling and failure isolation (section 8) cover spawn failure, mid-turn drop, global isolation, and orphan reaping, matching FR-6 and NFR-4.
- Cross-runtime parity (section 9) explicitly handles the browser-cannot-spawn-subprocess constraint rather than silently failing, consistent with the partial-failure-safe rule.
- Out-of-scope (section 11) is explicit and aligns with decision FEAT-2010-DEC-1 and the Should criteria.

One non-blocking note: the SDK transport-ownership question (OQ1) should be resolved at the very start of implementation since it affects how 6.1 holds the connection; if the SDK owns spawn, 6.2's process manager may need to coordinate with rather than own the subprocess. Flagged, not blocking.
