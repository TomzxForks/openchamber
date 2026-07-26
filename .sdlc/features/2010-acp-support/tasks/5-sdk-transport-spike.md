---
id: "5"
title: "Spike: SDK ClientSideConnection transport ownership"
status: done
size: S
depends_on: ["4"]
completed_date: "2026-07-04"
blocker: null
---

# Task 5: Spike: SDK ClientSideConnection transport ownership

## Verdict

**The SDK does NOT own subprocess spawn.** This is the ideal outcome: our agent-process-manager (task 3) fully owns spawning and lifecycle.

The SDK's transport model (verified against `@agentclientprotocol/sdk@1.3.0`):

- `Stream<Message>` is a web-streams interface: `{ writable: WritableStream, readable: ReadableStream }`.
- `ndJsonStream(output: WritableStream<Uint8Array>, input: ReadableStream<Uint8Array>): Stream` creates an ACP stream from a pair of newline-delimited JSON byte streams — "the typical way to handle ACP connections over stdio".
- `ClientApp.connectWith(stream, op)` (and `ClientSideConnection`) consume that `Stream`; they do not spawn.

## Implication for task 6

1. Spawn the stdio agent subprocess via the agent-process-manager (Node `child_process`).
2. Convert the child's Node `stdout`/`stdin` to web streams (Node 22 provides `Readable.toWeb` / `Writable.toWeb`).
3. Build the ACP stream: `ndJsonStream(stdinWeb, stdoutWeb)`.
4. Run the connection: `clientApp.connectWith(stream, async (ctx) => { ... })` or construct a `ClientSideConnection` over the stream.

Our process manager owns the subprocess; the SDK owns JSON-RPC framing. No coordination conflict — the SDK never touches spawn.

## Specification OQ1 resolution

Spec OQ1 ("does `ClientSideConnection` allow server-side stdio with our managed child, or does the SDK own spawn?") is resolved: **SDK does not own spawn; we feed managed stdio to the SDK.**
