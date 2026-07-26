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
