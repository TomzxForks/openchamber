import React from 'react';
import '@xyflow/react/dist/style.css';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { validateRunGraph } from '@/lib/runGraph/validate';
import { createRunGraphFormNode, createRunGraphNode, createRunGraphWorktree, pickGraphForSession } from '@/lib/runGraph/editorGraph';
import { useRunGraphStore } from '@/stores/useRunGraphStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useUIStore } from '@/stores/useUIStore';
import { Button } from '@/components/ui/button';
import { RunGraphCanvas } from '@/components/rungraph/RunGraphCanvas';
import { RunGraphFormDialog } from '@/components/rungraph/RunGraphFormDialog';
import { RunGraphInspector, type RunGraphSelection } from '@/components/rungraph/RunGraphInspector';
import { RunGraphToolbar } from '@/components/rungraph/RunGraphToolbar';

export const GraphsView: React.FC<{ onNavigateToSession?: (sessionId: string) => void }> = ({
  onNavigateToSession,
}) => {
  const { t } = useI18n();
  const draft = useRunGraphStore((state) => state.draft);
  const activeRun = useRunGraphStore((state) => state.activeRun);
  const loadGraphs = useRunGraphStore((state) => state.loadGraphs);
  const createDraft = useRunGraphStore((state) => state.createDraft);
  const addDraftNode = useRunGraphStore((state) => state.addDraftNode);
  const addDraftWorktree = useRunGraphStore((state) => state.addDraftWorktree);
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const sessionIndexSize = useRunGraphStore((state) => Object.keys(state.sessionIndex).length);

  const [selection, setSelection] = React.useState<RunGraphSelection | null>(null);

  const loadedRef = React.useRef(false);
  React.useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void loadGraphs().then(() => {
      const state = useRunGraphStore.getState();
      const picked = pickGraphForSession(state.graphs, state.sessionIndex, currentSessionId);
      if (picked) {
        useRunGraphStore.getState().selectGraph(picked.graph.id);
        setSelection({ kind: 'node', id: picked.link.nodeId });
        return;
      }
      if (!state.draft) {
        createDraft();
      }
    });
  }, [loadGraphs, createDraft, currentSessionId]);

  const issues = React.useMemo(() => (draft ? validateRunGraph(draft) : []), [draft]);

  const handleCanvasSelect = React.useCallback((flowId: string | null) => {
    if (!flowId) {
      setSelection(null);
      return;
    }
    if (flowId.startsWith('wt:')) {
      setSelection({ kind: 'worktree', id: flowId.slice('wt:'.length) });
    } else {
      setSelection({ kind: 'node', id: flowId.slice('node:'.length) });
    }
  }, []);

  const handleAddRun = React.useCallback(() => {
    if (!draft) return;
    const node = createRunGraphNode(`Run ${draft.nodes.length + 1}`, { x: 120, y: 90 });
    addDraftNode(node);
    setSelection({ kind: 'node', id: node.id });
  }, [draft, addDraftNode]);

  const handleAddWorktree = React.useCallback(() => {
    if (!draft) return;
    const worktree = createRunGraphWorktree(`Worktree ${draft.worktrees.length + 1}`, { x: 120, y: 300 });
    addDraftWorktree(worktree);
    setSelection({ kind: 'worktree', id: worktree.id });
  }, [draft, addDraftWorktree]);

  const handleAddForm = React.useCallback(() => {
    if (!draft) return;
    const node = createRunGraphFormNode(`Form ${draft.nodes.filter((entry) => entry.kind === 'form').length + 1}`, {
      x: 120,
      y: 520,
    });
    addDraftNode(node);
    setSelection({ kind: 'node', id: node.id });
  }, [draft, addDraftNode]);

  const handleOpenSession = React.useCallback(
    (sessionId: string) => {
      if (onNavigateToSession) {
        onNavigateToSession(sessionId);
        return;
      }
      const directory = useRunGraphStore.getState().sessionIndex[sessionId]?.directory ?? null;
      useSessionUIStore.getState().setCurrentSession(sessionId, directory);
      useUIStore.getState().setActiveMainTab('chat');
    },
    [onNavigateToSession],
  );

  const debugLine = (): string => {
    const buildId = (window as { __OPENCHAMBER_BUILD_ID__?: string }).__OPENCHAMBER_BUILD_ID__ ?? '?';
    const graphs = useRunGraphStore.getState().graphs;
    const error = useRunGraphStore.getState().error;
    const sess = currentSessionId ? `…${currentSessionId.slice(-8)}` : '-';
    return `dbg ${buildId} graphs=${graphs.length} nodes=${draft?.nodes.length ?? '-'} wt=${draft?.worktrees.length ?? '-'} sel=${selection ? selection.id.slice(0, 10) : '-'} err=${error ?? '-'} sess=${sess} idx=${sessionIndexSize}`;
  };

  if (!draft) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
        <span>{t('rungraph.editor.selectNodeHint')}</span>
        <span className="font-mono text-[10px] opacity-70">{debugLine()}</span>
      </div>
    );
  }

  const isEmpty = draft.nodes.length === 0 && draft.worktrees.length === 0;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <RunGraphFormDialog />
      <RunGraphToolbar onSelect={setSelection} />
      <div className="border-b border-border bg-background px-3 py-0.5 font-mono text-[10px] leading-tight text-muted-foreground opacity-70">
        {debugLine()}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <RunGraphCanvas draft={draft} activeRun={activeRun} onSelect={handleCanvasSelect} />
          {isEmpty && (
            <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
              <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-lg border border-border bg-card p-5 text-center shadow-lg">
                <span className="typography-ui-label font-medium text-foreground">{t('rungraph.empty.title')}</span>
                <span className="text-xs leading-relaxed text-muted-foreground">{t('rungraph.empty.description')}</span>
                <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                  <Button type="button" size="sm" onClick={handleAddRun}>
                    {t('rungraph.toolbar.addRun')}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={handleAddForm}>
                    {t('rungraph.toolbar.addForm')}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={handleAddWorktree}>
                    {t('rungraph.toolbar.addWorktree')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
        <RunGraphInspector
          draft={draft}
          selection={selection}
          issues={issues}
          onOpenSession={handleOpenSession}
          onClose={selection ? () => setSelection(null) : undefined}
          className={cn(
            'absolute inset-y-0 right-0 z-10 w-[min(20rem,100%)] border-l bg-card shadow-xl',
            selection ? 'flex' : 'hidden',
            'lg:static lg:z-auto lg:w-80 lg:shrink-0 lg:shadow-none',
            'lg:flex',
          )}
        />
      </div>
    </div>
  );
};
