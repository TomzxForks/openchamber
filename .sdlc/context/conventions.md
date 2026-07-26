# Conventions

## General (from base AGENTS.md)

- Be concise.
- Do not use em-dashes; use commas or parentheses instead.
- One sentence per line.

## Architecture patterns (binding for this project)

- Thin entrypoints, focused modules: keep `index.js`, bridge files, bootstrap files thin; move logic into focused modules.
- Strong source of truth: prefer deterministic state over heuristics; use live server/session state for live activity.
- Live state vs historical state: derive live UI behavior from live state channels; use history only to restore context.
- Cross-runtime parity: if web defines a contract shared UI depends on, keep desktop and VS Code parity; do not ship a web-only assumption into shared UI.
- Partial-failure-safe flows: multi-entity operations must tolerate partial failure; prefer per-item results or rollback over all-or-nothing.
- Distinguish fetch failure from empty success: authoritative client API methods must throw on failure or return `T | null`, never swallow to `[]`.

## Development rules

- Keep diffs tight; avoid drive-by refactors.
- Follow local precedent; inspect nearby code before introducing new patterns.
- Backend changes: keep web, desktop, and VS Code behavior consistent when they share contracts.
- TypeScript: avoid `any`, blind casts, and shape guessing.
- React: prefer function components + hooks; use classes only when required.
- Control flow: prefer early returns and explicit branching over nested ternaries.
- Styling: Tailwind v4; typography via `packages/ui/src/lib/typography.ts`; theme vars via `packages/ui/src/lib/theme/`.
- Shared UI patterns: reuse shared primitives before introducing feature-local markup.
- Toasts: use the wrapper from `@/components/ui`; do not import `sonner` directly.
- No new deps unless asked.
- Never add secrets or log sensitive data.

## Performance rules (binding for sync/UI work)

- Treat common stores as render fanout boundaries; do not put high-frequency state in broadly consumed stores.
- Zustand referential equality: select leaf values, not containers; preserve references on merge.
- Split stores by change frequency and subscriber set.
- Event pipeline: gate expensive operations on the hot path; skip no-op updates; coalesce by key.
- Optimistic updates: use the shadow Map pattern; pass client-generated IDs to the server; rollback on error.
- Never use `await waitForFrames()` for scroll preservation; use `useLayoutEffect`.

## Documentation formatting

- One sentence per line (for prose/markdown artifacts).
- Lowercase, hyphenated slugs, no special characters.
