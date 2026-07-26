# Architecture

## Runtime architecture

- `Desktop` (Electron) boots the web server in the same Node process as Electron main, then loads the web UI from `http://127.0.0.1:<port>`. No sidecar subprocess.
- Backend/domain logic lives in `packages/web/server/*` (and `packages/vscode/*` for VS Code bridge parity).
- Electron owns the desktop shell/security boundary: windows, menus, dialogs, notifications, updater, deep-links, runtime host switching, local IPC gates, SSH/tunnel management.

## Current agent integration (OpenCode — the coupling ACP would break)

- UI client wrapper: `packages/ui/src/lib/opencode/client.ts` (imports `@opencode-ai/sdk/v2`)
- Sync/event pipeline: app roots mount `SyncProvider` from `packages/ui/src/sync/sync-context.tsx`; OpenCode SSE/WS event handling lives in `packages/ui/src/sync/event-pipeline.ts`
- Web server embeds/starts OpenCode server: `packages/web/server/index.js` (`createOpencodeServer`)
- External server support: `OPENCODE_HOST` / `OPENCODE_PORT` + `OPENCODE_SKIP_START=true` to connect to an existing instance

## Runtime boundaries ACP must fit behind

- Runtime API contracts: `packages/ui/src/lib/api/types.ts`; consumed via `packages/ui/src/hooks/useRuntimeAPIs.ts`
- Runtime transport/auth: `packages/ui/src/lib/runtime-fetch.ts`, `packages/ui/src/lib/runtime-url.ts`, `packages/ui/src/lib/runtime-auth.ts`
- Stores: Zustand stores under `packages/ui/src/stores/` and sync layer under `packages/ui/src/sync/`

## OpenCode SDK entry points used by the UI

- Chat sessions, permissions, tool calls, message parts all route through `@opencode-ai/sdk/v2`.
- These are currently treated as global (single source of truth); ACP with multiple clients would make them per-client.

## Tech stack

- Runtime/tooling: Bun, Node >=22
- UI: React, TypeScript, Vite, Tailwind v4
- State: Zustand
- Server: Express (`packages/web/server/index.js`)
- Desktop: Electron 41
- VS Code: extension + webview
