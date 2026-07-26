import type { Session } from "@opencode-ai/sdk/v2/client";

/**
 * Agent backend types. OpenCode is the default; ACP is opt-in behind a feature
 * flag. Per decision FEAT-2010-DEC-1, one backend is active at a time.
 */
export type AgentBackendType = "opencode" | "acp";

/**
 * Parameters for creating a session. Mirrors the OpenCode createSession shape
 * so the OpenCode adapter is a thin pass-through; the ACP adapter maps the
 * fields it needs (title/metadata) onto ACP session/new.
 */
export type CreateSessionParams = {
  parentID?: string;
  title?: string;
  metadata?: Record<string, unknown>;
};

/**
 * A file attachment in a prompt. Backend-neutral; the OpenCode adapter
 * normalizes MIME types, the ACP adapter maps to an ACP resource block.
 */
export type AgentFileInput = {
  id?: string;
  type: "file";
  mime: string;
  filename?: string;
  url: string;
};

/**
 * An @-mention of a sub-agent within a prompt (OpenCode concept; ignored by
 * the ACP adapter in the Must scope).
 */
export type AgentMentionInput = {
  name: string;
  source?: { value: string; start: number; end: number };
};

/**
 * Parameters for sending a prompt (a user message) to a session.
 * Mirrors the OpenCode sendMessage shape so the OpenCode adapter is a thin
 * pass-through. Returns the client-generated message id; the streamed reply
 * arrives over the existing event stream for both backends.
 */
export type SendMessageParams = {
  id: string;
  providerID: string;
  modelID: string;
  text: string;
  prefaceText?: string;
  prefaceTextSynthetic?: boolean;
  agent?: string;
  variant?: string;
  files?: Array<AgentFileInput>;
  /** Additional text/file parts (for batch sending queued messages). */
  additionalParts?: Array<{
    text: string;
    synthetic?: boolean;
    files?: Array<AgentFileInput>;
  }>;
  messageId?: string;
  agentMentions?: Array<AgentMentionInput>;
  delivery?: "steer";
  format?: {
    type: "json_schema";
    schema: Record<string, unknown>;
    retryCount?: number;
  };
  directory?: string | null;
};

/**
 * Capabilities reported by a backend. Minimal for the Must scope; slash
 * commands and other capabilities arrive in the Should milestone.
 */
export type AgentCapabilities = {
  /** Whether this backend can cancel an in-flight turn. */
  canCancel: boolean;
  /** Backend-reported slash command names, if any (Should milestone). */
  commands?: string[];
};

/**
 * The agent-transport abstraction. Implementations:
 *   - OpenCodeAdapter (thin wrapper over the existing @opencode-ai/sdk client)
 *   - AcpClient (JSON-RPC over stdio via the server's /api/agent/acp/* endpoints)
 *
 * The interface is deliberately backend-neutral (NFR-2): it must not encode
 * single-client-only assumptions that would block a future multi-client
 * registry. Method shapes mirror the existing OpenCode surface so the OpenCode
 * adapter is a true thin pass-through.
 */
export interface AgentClient {
  /** Backend identifier. */
  readonly backend: AgentBackendType;
  /** Create a session bound to this backend. */
  createSession(params?: CreateSessionParams, directory?: string | null): Promise<Session>;
  /** Send a prompt; returns the client-generated message id. */
  sendMessage(params: SendMessageParams): Promise<string>;
  /** Cancel the in-flight turn for a session (best-effort). */
  abortSession(id: string): Promise<boolean>;
  /** Reported capabilities. */
  capabilities(): AgentCapabilities;
}
