# Architecture

## System Overview

```
                          +-----------------+
                          |   VS Code Ext   |
                          | (webview + host)|
                          +--------+--------+
                                   |
                          +--------v--------+
                          |  @openchamber/  |
                          |       ui        |
                          | (shared React)  |
                          +--------+--------+
                                   |
              +--------------------+--------------------+
              |                    |                    |
     +--------v--------+  +-------v--------+  +--------v--------+
     |   Electron App  |  |   Web / PWA    |  | Tauri (legacy)  |
     | (main.mjs boots |  | (Vite SPA via  |  | (sidecar spawns |
     |  server in-proc)|  |  Express)      |  |  server binary) |
     +--------+--------+  +-------+--------+  +--------+--------+
              |                    |                    |
              +--------------------+--------------------+
                                   |
                          +--------v--------+
                          |  Express Server |
                          | (packages/web/  |
                          |  server/index.js|
                          +--------+--------+
                                   |
                    +--------------+--------------+
                    |              |              |
           +-------vv------+ +---v----+ +-------v------+
           | OpenCode SDK  | |  FS /  | |  Terminal     |
           | (SSE + HTTP)  | |  Git   | | (WS + PTY)    |
           +-------+-------+ +--------+ +--------------+
                   |
           +-------v-------+
           |  OpenCode CLI |
           | (external)    |
           +---------------+
```

## Key Components

| Component | Responsibility | Technology |
|---|---|---|
| `packages/ui` | Shared React components, hooks, stores, theme, and sync layer | React 19, TypeScript, Zustand, Tailwind v4, Base UI, CodeMirror |
| `packages/web` | Express server, API routes, CLI, Vite frontend build | Express 5, Node.js >=20, Bun, Vite 7 |
| `packages/web/server` | Backend runtime: OpenCode lifecycle, SSE event pipeline, Git, terminal, tunnels, auth, TTS, notifications, quota | Express, ws, simple-git, bun-pty/node-pty, Cloudflare tunnel |
| `packages/electron` | Forward desktop shell; boots web server in-process, native integrations | Electron 41, electron-builder |
| `packages/desktop` | Legacy Tauri desktop shell (maintenance-only) | Tauri v2, Rust |
| `packages/vscode` | VS Code extension with sidebar webview | VS Code Extension API, esbuild |
| `packages/docs` | Documentation website source | MDX |

## Data Flow

1. **Session lifecycle**: User opens the app (web/desktop/VS Code) which connects to the Express server. The server starts or connects to an OpenCode instance. SSE streams carry real-time session events (message deltas, status updates, permission requests) to the UI via the event pipeline in `packages/ui/src/sync/`.

2. **Chat interaction**: User types a message in the shared UI. It is sent as an HTTP POST to the Express server, which proxies it to the OpenCode SDK. The OpenCode server processes the message and streams back deltas via SSE. The UI event pipeline dispatches these to Zustand stores, which update React components.

3. **Git operations**: UI components call REST endpoints on the Express server. The server uses `simple-git` to interact with the local repository. Results flow back as JSON responses.

4. **Terminal**: The UI opens a WebSocket to the Express server. The server creates a PTY session via `bun-pty` or `node-pty`. Input/output frames are relayed over WebSocket using the ghostty-web renderer in the UI.

5. **Tunnel (remote access)**: The CLI or server spawns a Cloudflare tunnel process. Remote users connect through Cloudflare to the Express server. Authentication uses one-time tokens with QR code onboarding.

6. **Event pipeline (SSE)**: The server subscribes to OpenCode SSE events and rebroadcasts them to connected UI clients via its own SSE endpoint. The client-side event pipeline in `packages/ui/src/sync/event-pipeline.ts` handles reconnect with exponential backoff, coalescing, and state dispatch to Zustand stores.

## Infrastructure

- **CI/CD**: GitHub Actions (`.github/workflows/`)
  - `release.yml`: Builds Electron DMG/zip (macOS arm64), Tauri bundles, and VS Code VSIX on tag push or manual dispatch
  - `build-macos-arm64-dmg.yml`: macOS Electron build
  - `vscode-extension.yml`: VS Code extension build and publish
  - `docs-source.yml`: Documentation site build
  - `oc-integration.yml`, `oc-review.yml`: Integration and review workflows
- **Deployment**: Docker (Dockerfile + docker-compose.yml), systemd user service, npm package for CLI
- **Package manager**: Bun (bun.lock)
- **Build tooling**: Vite 7 for frontend, esbuild for VS Code extension, electron-builder for Electron
- **Hosting**: Self-hosted; users run locally or on their own servers. Cloudflare tunnels for remote access.
- **Reverse proxy**: Caddy config provided (Caddyfile) for HTTPS termination

## Architecture Decisions

- **Electron over Tauri for forward desktop**: Electron boots the web server in-process, eliminating the sidecar subprocess complexity. Tauri is kept only for existing users until auto-update migration completes. See `docs/TAURI_TO_ELECTRON_CUTOVER.md`.
- **Shared UI across all runtimes**: `packages/ui` is consumed as a workspace dependency by web, desktop, and VS Code. Runtime-specific code uses the `__TAURI__` shim exposed by Electron preload so shared UI stays shell-agnostic.
- **Zustand for state management**: Multiple split stores by change frequency and subscriber set. High-frequency streaming state lives in narrow stores to avoid render cascades.
- **Express + SSE over WebSocket for primary data**: SSE for session events; WebSocket reserved for terminal PTY and binary use cases.
- **Theme token system**: All colors use CSS custom properties via theme tokens. No hardcoded values or Tailwind color classes in component code.
