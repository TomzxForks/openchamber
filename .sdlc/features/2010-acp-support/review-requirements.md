---
artifact: requirements.md
verdict: approved
reviewed_at: 2026-07-04
---

## Clarity

No issues found.
Requirements are unambiguous; vague terms are avoided; "full prompt turn" and content-block mappings are concretely defined in the acceptance criteria.

## Completeness

One non-blocking note:

- FR-7 through FR-12 (the "Should" items) intentionally have no acceptance criteria because they are deferred follow-up milestones per decision FEAT-2010-DEC-1.
  This is acceptable, but they should gain their own ACs when promoted into a later milestone's requirements.

Happy-path, edge, and error cases are covered for all Must requirements.
Non-functional requirements span compatibility, maintainability, performance, reliability, and security.

## Testability

No issues found.
Each Must requirement has observable, scenario-based acceptance criteria (happy path, edge, error).
NFR-2 (future-registry boundary) has a reviewer-inspection criterion that is as objective as a maintainability requirement can be.

## Feasibility

One finding (addressed below in Conflicts, since it is a feasibility/contract tension):

- FR-1 asks for an OpenCode client that implements the new `AgentClient` interface.
  The existing OpenCode client (`packages/ui/src/lib/opencode/client.ts`, 1855 lines) is depended on by 152 files, so a deep retrofit to the new interface is high-risk and tensions with NFR-1 (no OpenCode regression).
  Resolution: FR-1 is refined so the OpenCode client is a **thin adapter** wrapping the existing client, not a rewrite.

## Conflicts

| Requirements | Type | Description | Suggested Resolution |
|---|---|---|---|
| FR-1, NFR-1, NFR-2 | Functional vs non-functional tension | A full retrofit of OpenCode onto the new `AgentClient` interface maximizes abstraction cleanliness (NFR-2) but maximizes regression risk (NFR-1). | Refine FR-1: the OpenCode client is a thin adapter over the existing client, exposing the interface without rewriting the 1855-line integration. Resolve open question 2 toward the adapter approach. |

Resolution applied: FR-1 wording clarified to mandate a thin adapter; open question 2 resolved in favor of the adapter approach to minimize regression risk.
