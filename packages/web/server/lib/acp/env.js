// ACP (Agent Client Protocol) server-side environment configuration.
//
// Centralizes the ACP feature flag and any ACP env knobs so later modules
// (agent-process-manager, acp-event-source, routes) have a single import
// point. OpenCode remains the default backend; ACP is opt-in.

const isEnvFlagEnabled = (value) => {
  if (value === true || value === 1) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
};

/**
 * Whether ACP backend support is enabled. Defaults to off so the OpenCode
 * backend remains the default and fully functional (FR-2, NFR-1).
 */
export const isAcpEnabled = () =>
  isEnvFlagEnabled(process.env.OPENCHAMBER_ACP_ENABLED);

/**
 * Directory holding per-pid JSON records for spawned ACP agent subprocesses.
 * Mirrors the OpenCode managed-process registry layout (one file per pid to
 * avoid cross-runtime write contention).
 */
export const resolveAcpRegistryDir = () => {
  const override = process.env.OPENCHAMBER_ACP_AGENT_REGISTRY;
  if (override && override.trim()) return override.trim();
  return null;
};

/**
 * Startup ACP agent configuration from environment variables. When
 * OPENCHAMBER_ACP_COMMAND is set, the server initializes the agent connection
 * at boot (no need to wait for the first session creation from the UI).
 * Returns null if no command is configured.
 */
export const getStartupAcpConfig = () => {
  const command = process.env.OPENCHAMBER_ACP_COMMAND;
  if (typeof command !== 'string' || command.trim().length === 0) return null;
  const argsRaw = process.env.OPENCHAMBER_ACP_ARGS;
  return {
    command: command.trim(),
    args: typeof argsRaw === 'string' && argsRaw.trim().length > 0
      ? argsRaw.split(',').map((a) => a.trim()).filter(Boolean)
      : undefined,
    agentName: (typeof process.env.OPENCHAMBER_ACP_AGENT_NAME === 'string' && process.env.OPENCHAMBER_ACP_AGENT_NAME.trim()) || undefined,
    agentId: 'acp-startup',
    cwd: (typeof process.env.OPENCHAMBER_ACP_CWD === 'string' && process.env.OPENCHAMBER_ACP_CWD.trim()) || undefined,
  };
};
