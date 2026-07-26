---
artifact: needs-assessment.md
verdict: approved
reviewed_at: 2026-07-04
---

## Evidence Rigor

One sharpening finding (non-blocking):

- The headline "Strong" evidence (152 files importing the SDK, 182 referencing opencode) measures **architectural coupling**, not **user need**.
  Coupling depth justifies *why the work is hard* and *why there is no code-free alternative*, but it is not itself evidence that anyone wants ACP.
  The actual need-evidence (registry traction, author intent) is Moderate, and external demand is genuinely Weak, confirmed by a search of the issue tracker (no prior ACP requests, no requests for Claude Code/Gemini as agents).
  The document already acknowledges this ("assumption-led bet"), but the Evidence table's "Strong" row could mislead a reader into thinking demand is strong.
  Recommendation: relabel the coupling row as an architectural indicator rather than need-evidence, or add an explicit note that it is not a demand signal.

## Stakeholder Coverage

No issues found.
The three stakeholder groups (end users, maintainers, agent ecosystem) are appropriate and cover who is inconvenienced today.

## Alternative-Path Completeness

No issues found.
Four alternatives are considered, including the only real non-build option (stay coupled) and the speculative "OpenCode ships an ACP bridge" path.
The fair assessment that none can meet the need without new code is correct given the 150+-file coupling.

## Verdict Soundness

No blocking findings.

The "Needed" verdict is sound: strategic alignment is Strong, no code-free alternative exists, and the feature serves a core use case.
The verdict rests primarily on strategic alignment rather than demonstrated demand, which is an acceptable basis for a maintainer-driven architectural decision, and the rationale states this honestly.

The conditions to proceed are specific and actionable (resolve single-vs-parallel-client decision before requirements; bound scope to "Must" criteria).
This is exactly the right gate to impose before downstream phases.
