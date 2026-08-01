import { useEffect } from 'react';
import type { Session } from '@opencode-ai/sdk/v2/client';
import { useAgentBackendStore } from '@/stores/useAgentBackendStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { getActiveAgentClient } from './active-client';

// On mount (and when the backend switches to ACP), fetch the agent's existing
// sessions so the sidebar populates. The server's activeSource persists across
// page refreshes (the agent process keeps running), so this works even after a
// reload — as long as /initialize was called at least once in the server's
// lifetime. Sessions that don't exist yet (first load, no connection) return
// an empty list (harmless).
export function useAcpSessionBootstrap() {
  const activeBackend = useAgentBackendStore((s) => s.activeBackend);

  useEffect(() => {
    if (activeBackend !== 'acp') return;
    const client = getActiveAgentClient();
    if (!client.listSessions) return;

    let cancelled = false;
    const run = async () => {
      try {
        const sessions = await client.listSessions!();
        if (cancelled) return;
        const now = Date.now();
        for (const s of sessions) {
          useGlobalSessionsStore.getState().upsertSession({
            id: s.id,
            slug: s.id,
            projectID: '',
            directory: '',
            title: s.title ?? 'ACP session',
            version: 'acp',
            time: { created: now, updated: now },
          } as Session);
        }
      } catch {
        // No active connection yet — harmless (empty sidebar until first session).
      }
    };
    void run();

    return () => { cancelled = true; };
  }, [activeBackend]);
}
