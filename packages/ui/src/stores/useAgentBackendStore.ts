// Agent backend selection store. Per decision FEAT-2010-DEC-1, one backend is
// active at a time (OpenCode default). Selecting ACP constructs an AcpClient
// from the configured agent and installs it as the active agent client; the
// create/prompt seams (session-actions, session-ui-store) then route to it.

import { create } from 'zustand';
import { AcpClient } from '@/lib/agent/acp-client';
import { setActiveAgentClient } from '@/lib/agent/active-client';
import type { AgentBackendType, AcpAgentConfig } from '@/lib/agent/config';

const STORAGE_KEY = 'openchamber.agent-backend.v1';

type PersistedState = {
  activeBackend: AgentBackendType;
  activeAcpAgentId: string | null;
  agents: AcpAgentConfig[];
};

const loadPersisted = (): PersistedState => {
  if (typeof localStorage === 'undefined') {
    return { activeBackend: 'opencode', activeAcpAgentId: null, agents: [] };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { activeBackend: 'opencode', activeAcpAgentId: null, agents: [] };
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      activeBackend: parsed.activeBackend === 'acp' ? 'acp' : 'opencode',
      activeAcpAgentId: typeof parsed.activeAcpAgentId === 'string' ? parsed.activeAcpAgentId : null,
      agents: Array.isArray(parsed.agents) ? parsed.agents.filter(isValidAgentConfig) : [],
    };
  } catch {
    return { activeBackend: 'opencode', activeAcpAgentId: null, agents: [] };
  }
};

const isValidAgentConfig = (value: unknown): value is AcpAgentConfig =>
  !!value && typeof value === 'object' && typeof (value as AcpAgentConfig).command === 'string';

const persist = (state: PersistedState) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Best-effort persistence.
  }
};

// Resolve the active ACP agent config, if any.
const resolveActiveAcpAgent = (state: PersistedState): AcpAgentConfig | null => {
  if (state.activeBackend !== 'acp' || !state.activeAcpAgentId) return null;
  return state.agents.find((a) => a.id === state.activeAcpAgentId && a.enabled) ?? null;
};

// Apply the selection to the active-client selector. Called on every change.
const applySelection = (state: PersistedState) => {
  const acpAgent = resolveActiveAcpAgent(state);
  if (acpAgent) {
    setActiveAgentClient(
      new AcpClient({
        command: acpAgent.command,
        args: acpAgent.args,
        env: acpAgent.env,
        agentId: acpAgent.id,
      }),
    );
  } else {
    // OpenCode default (or ACP selected but no valid agent configured).
    setActiveAgentClient(null);
  }
};

type AgentBackendStore = PersistedState & {
  setBackend: (backend: AgentBackendType) => void;
  selectAcpAgent: (agentId: string | null) => void;
  addAgent: (agent: Omit<AcpAgentConfig, 'id'>) => string;
  updateAgent: (id: string, patch: Partial<AcpAgentConfig>) => void;
  removeAgent: (id: string) => void;
};

const initialState = loadPersisted();
// Apply the persisted selection on module load so a reload keeps the backend.
applySelection(initialState);

const commit = (next: PersistedState): Partial<AgentBackendStore> => {
  persist(next);
  applySelection(next);
  return next;
};

export const useAgentBackendStore = create<AgentBackendStore>((set, get) => ({
  ...initialState,

  setBackend: (backend) => {
    const current = get();
    commit({ ...current, activeBackend: backend });
    set({ activeBackend: backend });
  },

  selectAcpAgent: (agentId) => {
    const current = get();
    commit({ ...current, activeAcpAgentId: agentId });
    set({ activeAcpAgentId: agentId });
  },

  addAgent: (agent) => {
    const current = get();
    const id = `acp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const newAgent: AcpAgentConfig = { ...agent, id };
    const next = { ...current, agents: [...current.agents, newAgent] };
    commit(next);
    set({ agents: next.agents });
    return id;
  },

  updateAgent: (id, patch) => {
    const current = get();
    const next = {
      ...current,
      agents: current.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    };
    commit(next);
    set({ agents: next.agents });
  },

  removeAgent: (id) => {
    const current = get();
    const next = {
      ...current,
      agents: current.agents.filter((a) => a.id !== id),
      activeAcpAgentId: current.activeAcpAgentId === id ? null : current.activeAcpAgentId,
    };
    commit(next);
    set({ agents: next.agents, activeAcpAgentId: next.activeAcpAgentId });
  },
}));
