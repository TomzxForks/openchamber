// AcpClient: UI-side AgentClient implementation for the ACP backend. Calls the
// server's /api/agent/acp/* endpoints over the authenticated runtime transport
// (runtimeFetch). The server owns the subprocess and the JSON-RPC connection;
// this adapter only issues HTTP requests and maps responses onto the
// AgentClient contract.
//
// Failure semantics (NFR-4): transport/handshake failures throw — they never
// resolve to an empty success that could masquerade as authoritative state.
// The ACP path does not reuse the OpenCode HTTP provider-circuit.

import type { Session } from "@opencode-ai/sdk/v2/client";
import { runtimeFetch } from "@/lib/runtime-fetch";
import type {
  AgentClient,
  AgentBackendType,
  AgentCapabilities,
  CreateSessionParams,
  SendMessageParams,
} from "./types";

export type AcpAgentRuntimeConfig = {
  /** Agent executable to spawn on the server. */
  command: string;
  /** Args for the executable. */
  args?: string[];
  /** Extra env for the agent subprocess. */
  env?: Record<string, string>;
  /** Stable agent id (links to the server-side process registry). */
  agentId?: string;
  /** Display name (shown in the assistant message footer). */
  name?: string;
};

type InitializeResponse = {
  sessionID: string;
  capabilities?: unknown;
  backend?: string;
};

const JSON_HEADERS = { Accept: "application/json", "Content-Type": "application/json" } as const;

const parseJsonSafe = async (response: Response): Promise<Record<string, unknown> | null> => {
  try {
    const data = await response.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/**
 * Build a Session-shaped object from an ACP initialize response so the existing
 * UI session model (sidebar, stores) can represent an ACP session without
 * changes. Only the SDK-required fields are populated; optional fields are left
 * unset. `id` is the server-returned sessionID.
 */
const buildAcpSession = (sessionID: string, directory: string | null, title: string | undefined): Session => {
  const now = Date.now();
  return {
    id: sessionID,
    slug: sessionID,
    projectID: "",
    directory: directory ?? "",
    title: title && title.trim().length > 0 ? title : "ACP session",
    version: "acp",
    time: { created: now, updated: now },
  };
};

export class AcpClient implements AgentClient {
  readonly backend: AgentBackendType = "acp";
  private readonly config: AcpAgentRuntimeConfig;

  constructor(config: AcpAgentRuntimeConfig) {
    this.config = config;
  }

  async createSession(params?: CreateSessionParams, directory?: string | null): Promise<Session> {
    const body = {
      command: this.config.command,
      args: this.config.args,
      env: this.config.env,
      agentId: this.config.agentId,
      name: this.config.name,
      cwd: directory ?? undefined,
      directory: directory ?? undefined,
    };

    const response = await runtimeFetch("/api/agent/acp/initialize", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await parseJsonSafe(response);
      const message = typeof errorBody?.error === "string" ? errorBody.error : `ACP initialize failed (${response.status})`;
      throw new Error(message);
    }

    const data = (await parseJsonSafe(response)) as InitializeResponse | null;
    if (!data || typeof data.sessionID !== "string" || data.sessionID.length === 0) {
      // Distinguish failure from empty success (NFR-4).
      throw new Error("ACP initialize returned no session id");
    }

    return buildAcpSession(data.sessionID, directory ?? null, params?.title);
  }

  async sendMessage(params: SendMessageParams): Promise<string> {
    if (!params.id) {
      throw new Error("AcpClient.sendMessage requires a session id (params.id)");
    }

    const response = await runtimeFetch("/api/agent/acp/session/prompt", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ sessionID: params.id, text: params.text, userMessageId: params.messageId }),
    });

    if (!response.ok) {
      const errorBody = await parseJsonSafe(response);
      const message = typeof errorBody?.error === "string" ? errorBody.error : `ACP prompt failed (${response.status})`;
      throw new Error(message);
    }

    // The streamed reply arrives over the existing event stream (server-side
    // translation into the normalized event protocol). Resolve with the
    // client-generated message id, matching the OpenCode adapter contract.
    return params.messageId ?? params.id;
  }

  async abortSession(id: string): Promise<boolean> {
    try {
      const response = await runtimeFetch("/api/agent/acp/session/cancel", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ sessionID: id }),
      });
      return response.ok;
    } catch {
      // Cancel is best-effort; never let it mask the in-flight error state.
      return false;
    }
  }

  capabilities(): AgentCapabilities {
    return { canCancel: true };
  }
}
