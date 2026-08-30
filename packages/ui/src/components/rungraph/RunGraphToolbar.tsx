import React from 'react';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui';
import { createRunGraphFormNode, createRunGraphNode, createRunGraphWorktree } from '@/lib/runGraph/editorGraph';
import { useRunGraphStore } from '@/stores/useRunGraphStore';
import type { RunGraphSelection } from './RunGraphInspector';

interface RunGraphToolbarProps {
  onSelect: (selection: RunGraphSelection | null) => void;
  className?: string;
}

export const RunGraphToolbar: React.FC<RunGraphToolbarProps> = ({ onSelect, className }) => {
  const { t } = useI18n();
  const draft = useRunGraphStore((state) => state.draft);
  const graphs = useRunGraphStore((state) => state.graphs);
  const selectedGraphId = useRunGraphStore((state) => state.selectedGraphId);
  const activeRun = useRunGraphStore((state) => state.activeRun);

  const createDraft = useRunGraphStore((state) => state.createDraft);
  const selectGraph = useRunGraphStore((state) => state.selectGraph);
  const saveDraft = useRunGraphStore((state) => state.saveDraft);
  const deleteGraph = useRunGraphStore((state) => state.deleteGraph);
  const renameDraft = useRunGraphStore((state) => state.renameDraft);
  const addDraftNode = useRunGraphStore((state) => state.addDraftNode);
  const addDraftWorktree = useRunGraphStore((state) => state.addDraftWorktree);
  const runDraft = useRunGraphStore((state) => state.runDraft);
  const stopRun = useRunGraphStore((state) => state.stopRun);

  const isRunning = activeRun?.status === 'running';

  const handleNew = (): void => {
    createDraft();
    onSelect(null);
  };

  const handleSave = async (): Promise<void> => {
    const ok = await saveDraft();
    if (ok) {
      toast.success(t('rungraph.toolbar.saved'));
    } else {
      toast.error(t('rungraph.toolbar.saveFailed'));
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!selectedGraphId) return;
    await deleteGraph(selectedGraphId);
    onSelect(null);
  };

  const handleAddRun = (): void => {
    if (!draft) return;
    const node = createRunGraphNode(`Run ${draft.nodes.length + 1}`, {
      x: 80 + (draft.nodes.length + draft.worktrees.length) * 40,
      y: 60 + (draft.nodes.length + draft.worktrees.length) * 36,
    });
    addDraftNode(node);
    onSelect({ kind: 'node', id: node.id });
  };

  const handleAddWorktree = (): void => {
    if (!draft) return;
    const worktree = createRunGraphWorktree(`Worktree ${draft.worktrees.length + 1}`, {
      x: 80 + (draft.nodes.length + draft.worktrees.length) * 40,
      y: 320 + (draft.nodes.length + draft.worktrees.length) * 24,
    });
    addDraftWorktree(worktree);
    onSelect({ kind: 'worktree', id: worktree.id });
  };

  const handleAddForm = (): void => {
    if (!draft) return;
    const node = createRunGraphFormNode(`Form ${draft.nodes.filter((entry) => entry.kind === 'form').length + 1}`, {
      x: 80 + (draft.nodes.length + draft.worktrees.length) * 40,
      y: 560 + (draft.nodes.length + draft.worktrees.length) * 24,
    });
    addDraftNode(node);
    onSelect({ kind: 'node', id: node.id });
  };

  const handleRun = async (): Promise<void> => {
    if (isRunning) {
      await stopRun();
      return;
    }
    const result = await runDraft();
    if (!result.ok) {
      toast.error(t('rungraph.toolbar.validation'));
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2 ${className ?? ''}`}>
      <Select
        value={graphs.some((graph) => graph.id === selectedGraphId) ? (selectedGraphId ?? undefined) : undefined}
        onValueChange={(value) => {
          selectGraph(value);
          onSelect(null);
        }}
      >
        <SelectTrigger className="h-8 w-44">
          <SelectValue placeholder={t('layout.mainTab.graphs')}>
            {graphs.find((graph) => graph.id === selectedGraphId)?.name}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {graphs.map((graph) => (
            <SelectItem key={graph.id} value={graph.id}>
              {graph.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button type="button" variant="outline" size="sm" onClick={handleNew} disabled={!draft && graphs.length === 0}>
        {t('rungraph.toolbar.new')}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => void handleSave()} disabled={!draft}>
        {t('rungraph.toolbar.save')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void handleDelete()}
        disabled={!selectedGraphId || !graphs.some((graph) => graph.id === selectedGraphId)}
      >
        {t('rungraph.toolbar.delete')}
      </Button>

      {draft && (
        <Input
          value={draft.name}
          onChange={(event) => renameDraft(event.target.value)}
          className="h-8 w-44"
          aria-label={t('layout.mainTab.graphs')}
        />
      )}

      <div className="ml-auto flex items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={handleAddRun} disabled={!draft}>
          {t('rungraph.toolbar.addRun')}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={handleAddForm} disabled={!draft}>
          {t('rungraph.toolbar.addForm')}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={handleAddWorktree} disabled={!draft}>
          {t('rungraph.toolbar.addWorktree')}
        </Button>
        <Button
          type="button"
          variant={isRunning ? 'destructive' : 'default'}
          size="sm"
          onClick={() => void handleRun()}
          disabled={!draft || draft.nodes.length === 0}
        >
          {isRunning ? t('rungraph.toolbar.stop') : t('rungraph.toolbar.run')}
        </Button>
      </div>
    </div>
  );
};
