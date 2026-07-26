---
artifact: existing-solutions.md
verdict: approved
reviewed_at: 2026-07-04
---

## Coverage

No issues found.
All five source categories were searched (internal codebase, open-source, commercial/SaaS, standards/protocols, reference material), with concrete queries recorded.
The most relevant candidates were surfaced, including the official SDK, two internal reuse targets, the canonical editor reference (Zed), and several direct-predecessor products (Codeg, ACP UI).

## Evaluation Rigor

One non-blocking note:

- The Zed license is stated as "GPL/AGPL" without citing the specific component license.
  This is acceptable because Zed is used as design reference only (no code reuse), but the survey should avoid implying a precise license it did not verify.
  Recommendation: treat Zed strictly as "read-only design reference; do not copy code regardless of license," which the survey already does.

All evaluated candidates include strengths, weaknesses, integration effort, cost, risks, and forward compatibility, which is the required rigor.

## Recommendation Soundness

No issues found.
The hybrid recommendation is sound and tightly tied to requirements:
- The wire protocol (official SDK) and process lifecycle (internal registry) are correctly identified as solved problems to adopt.
- The OpenChamber-specific abstraction, OpenCode thin adapter, ACP adapter, and sync-layer bridge are correctly identified as build items with no off-the-shelf fit.
- The decision not to adopt an external ACP UI kit is consistent with FR-4 (map onto existing renderers) and the no-new-deps constraint.

The two open questions (SDK transport pluggability for a server-side bridge; bundle size/tree-shaking) are correctly deferred to specification/implementation with a clear validation path.
