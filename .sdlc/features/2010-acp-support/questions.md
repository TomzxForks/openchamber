# Open Questions — FEAT-2010 (ACP support)

Running log of open questions surfaced by review phases.
Promote high-risk questions to formal assumptions via `/create-assumption`.

## From review-needs-assessment (2026-07-04)

These originate in the needs-assessment open questions and must be resolved before or during `create-requirements`:

1. **Single vs parallel clients.** Does ACP support target one agent client at a time (swappable globally) or multiple agent clients running in parallel? This shapes the whole abstraction (swappable transport vs multi-tenant registry), the store model (global vs per-client providers/models/skills/commands), and the sidebar model (unified merged list vs per-client with filter).
2. **Mid-session client switching.** In scope, or is a session permanently bound to one agent (as the ACP spec suggests)? Affects session lifecycle and store design.
3. **Configuration + selection UX.** Where does ACP agent configuration live alongside the existing provider config, and what is the selection UX (sidebar dropdown vs settings section)?
4. **Transport scope for first milestone.** Local stdio only (per "Must" criteria), or local + remote (HTTP/WebSocket) together? Remote is listed as "Should".

## From review-requirements (2026-07-04)

5. **Subprocess bridge location.** Where should the ACP subprocess be spawned and bridged: inside the web server (Express, `packages/web/server`) and proxied to the UI over the existing runtime transport, or as a desktop-only capability in `packages/electron`? Determines cross-runtime availability and the UI-access path. (NFR-5; to be resolved in codebase-analysis/specification.)
6. **Selection UX for FR-5.** Sidebar dropdown or settings section? (UX detail; a default should be chosen in specification.)
7. **ACP client library choice.** Use an existing ACP/JSON-RPC client library, or hand-roll JSON-RPC over stdio? (Resolve in existing-solutions.)

**Resolved during the design phases (Stage 3-4):**
- Q1 (single vs parallel clients): resolved to **single-client-at-a-time** — decision `1-single-acp-client-swappable.md`.
- Q2 (mid-session switching): **out of scope** — a session is bound to its creating client (decision 1).
- Q4 (transport scope): **local stdio only** for Must; remote is Should (decision 1, spec section 11).
- Q7 (ACP library): **adopt `@agentclientprotocol/sdk`** (existing-solutions recommendation).

**Still open (deferred to implementation / author):**
- Q3 (selection UX): settings section is the spec default; awaiting author confirmation before plan milestone M6.
- Q5 (subprocess bridge location): resolved to **server-side** (web server), proxied to UI (spec section 3/9); browser-only runtimes surface "unavailable" explicitly.
- Q6 (selection UX detail): merged with Q3.
- Spec OQ1: does `@agentclientprotocol/sdk`'s `ClientSideConnection` allow server-side stdio with our managed child? Resolve at plan milestone M2.
- Telemetry/observability OQs: confirm existing telemetry + structured-logging/metrics sinks at implementation.
