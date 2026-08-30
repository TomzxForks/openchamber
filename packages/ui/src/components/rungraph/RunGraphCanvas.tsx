import React from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type {
  RunGraphDefinition,
  RunGraphEdge,
  RunGraphEdgeSource,
  RunGraphFormNode,
  RunGraphRunNode,
  RunGraphWorktree,
} from '@/types/runGraph';
import type { RunFormRuntime, RunGraphRunState, RunInstancePhase, RunWorktreeRuntime } from '@/lib/runGraph/executor';
import { useRunGraphStore } from '@/stores/useRunGraphStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useUIStore } from '@/stores/useUIStore';

interface RunNodeFlowData extends Record<string, unknown> {
  node: RunGraphRunNode;
  statuses: Record<string, RunInstancePhase | undefined>;
  boundWorktreeTitle: string | null;
}

interface FormNodeFlowData extends Record<string, unknown> {
  node: RunGraphFormNode;
  runtime: RunFormRuntime | undefined;
}

interface WorktreeNodeFlowData extends Record<string, unknown> {
  worktree: RunGraphWorktree;
  runtime: RunWorktreeRuntime | undefined;
}

type RunFlowNode = Node<RunNodeFlowData, 'runNode'>;
type FormFlowNode = Node<FormNodeFlowData, 'formNode'>;
type WorktreeFlowNode = Node<WorktreeNodeFlowData, 'worktreeNode'>;
type RunGraphFlowNode = RunFlowNode | FormFlowNode | WorktreeFlowNode;

const phaseDotClass = {
  pending: 'bg-muted-foreground/40',
  starting: 'bg-status-warning',
  running: 'bg-status-warning animate-pulse',
  done: 'bg-status-success',
  failed: 'bg-status-error',
  blocked: 'bg-muted-foreground',
  skipped: 'bg-muted-foreground/40',
} satisfies Record<RunInstancePhase, string>;

const openRunSession = (instanceId: string): void => {
  const activeRun = useRunGraphStore.getState().activeRun;
  const runtime = activeRun?.instances[instanceId];
  if (!runtime?.sessionId) return;
  useSessionUIStore.getState().setCurrentSession(runtime.sessionId, runtime.directory ?? null);
  useUIStore.getState().setActiveMainTab('chat');
};

const RunNodeCard: React.FC<NodeProps<RunFlowNode>> = ({ data, selected }) => {
  const { t } = useI18n();
  const { node, statuses, boundWorktreeTitle } = data;
  const statusLabel = (phase: RunInstancePhase): string =>
    t(`rungraph.status.${phase}` as const);

  return (
    <div
      className={cn(
        'min-w-52 max-w-64 rounded-lg border bg-card text-card-foreground shadow-sm transition-colors',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      <div className="flex items-center gap-1.5 px-2.5 h-[30px] border-b border-border bg-muted/50 rounded-t-lg">
        <span className="truncate text-xs font-medium">{node.title}</span>
        {node.agent && (
          <span className="ml-auto shrink-0 rounded bg-interactive-selection px-1.5 py-0.5 text-[10px] text-interactive-selection-foreground">
            {node.agent}
          </span>
        )}
      </div>
      <div className="relative py-0.5">
        {node.inputs.map((input) => (
          <div
            key={input.id}
            className="relative flex items-center gap-1.5 h-[22px] pl-2.5 pr-2 text-[11px] text-muted-foreground"
          >
            <Handle
              type="target"
              position={Position.Left}
              id={input.id}
              className="!static !m-0 !size-2.5 shrink-0 !-translate-x-1/2 !transform-none !border-2"
            />
            <span className="min-w-0 flex-1 truncate font-mono" title={input.name}>
              {`{{${input.name}}}`}
            </span>
          </div>
        ))}
        {node.inputs.length > 0 && node.instances.length > 0 && (
          <div className="mx-2.5 my-0.5 border-t border-border/60" />
        )}
        {node.instances.map((instance) => {
          const phase = statuses[instance.id] ?? 'pending';
          return (
            <div
              key={instance.id}
              className="relative flex items-center gap-1.5 h-[26px] pl-2.5 text-xs"
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-interactive-hover"
                onClick={() => openRunSession(instance.id)}
                title={t('rungraph.openSession')}
              >
                <span className={cn('size-1.5 shrink-0 rounded-full', phaseDotClass[phase])} />
                <span className="truncate">
                  {instance.displayName || `${instance.providerID}/${instance.modelID}`}
                </span>
                <span className="ml-auto shrink-0 pr-1.5 text-[10px] text-muted-foreground">
                  {statusLabel(phase)}
                </span>
              </button>
              <Handle
                type="source"
                position={Position.Right}
                id={instance.id}
                className="!static !m-0 !size-2.5 shrink-0 !translate-x-1/2 !transform-none !border-2"
              />
            </div>
          );
        })}
      </div>
      {boundWorktreeTitle && (
        <div className="px-2.5 pb-1.5 text-[10px] text-muted-foreground truncate">
          {t('rungraph.editor.worktree')}: {boundWorktreeTitle}
        </div>
      )}
    </div>
  );
};

const formRuntimeDotClass = {
  'waiting-input': 'bg-status-warning animate-pulse',
  submitted: 'bg-status-success',
  failed: 'bg-status-error',
  skipped: 'bg-muted-foreground/40',
} satisfies Record<RunFormRuntime['phase'], string>;

const FormCard: React.FC<NodeProps<FormFlowNode>> = ({ data, selected }) => {
  const { t } = useI18n();
  const { node, runtime } = data;

  return (
    <div
      className={cn(
        'min-w-52 max-w-64 rounded-lg border bg-card text-card-foreground shadow-sm transition-colors',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      <div className="flex items-center gap-1.5 px-2.5 h-[30px] border-b border-border bg-muted/50 rounded-t-lg">
        <span className={cn('size-1.5 shrink-0 rounded-full', formRuntimeDotClass[runtime?.phase ?? 'submitted'])} />
        <span className="truncate text-xs font-medium">{node.title}</span>
        <span className="ml-auto shrink-0 rounded bg-interactive-selection px-1.5 py-0.5 text-[10px] text-interactive-selection-foreground">
          {t('rungraph.form.badge')}
        </span>
      </div>
      <div className="relative py-0.5">
        {node.fields.length === 0 && (
          <div className="px-2.5 py-1.5 text-[10px] text-muted-foreground">{t('rungraph.form.noFields')}</div>
        )}
        {node.fields.map((field) => (
          <div key={field.id} className="relative flex items-center gap-1.5 h-[26px] pl-2.5 text-xs">
            <Handle
              type="target"
              position={Position.Left}
              id={field.id}
              className="!static !m-0 !size-2.5 shrink-0 !-translate-x-1/2 !transform-none !border-2"
            />
            <span className="min-w-0 flex-1 truncate" title={field.title}>
              {field.title}
            </span>
            <span className="ml-auto shrink-0 pr-1.5 text-[10px] text-muted-foreground">
              {t(`rungraph.form.fieldType.${field.type}` as const)}
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id={field.id}
              className="!static !m-0 !size-2.5 shrink-0 !translate-x-1/2 !transform-none !border-2"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

const WorktreeCard: React.FC<NodeProps<WorktreeFlowNode>> = ({ data, selected }) => {
  const { t } = useI18n();
  const { worktree, runtime } = data;
  const phase = runtime?.phase ?? 'pending';

  return (
    <div
      className={cn(
        'w-52 rounded-lg border bg-muted/30 text-card-foreground shadow-sm',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      <div className="flex items-center gap-1.5 px-2.5 h-[30px] border-b border-border rounded-t-lg">
        <span className="truncate text-xs font-medium">{worktree.title}</span>
        <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {worktree.kind === 'existing' ? t('rungraph.worktree.kindExisting') : t('rungraph.worktree.kindNew')}
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            phase === 'ready' && 'bg-status-success',
            phase === 'failed' && 'bg-status-error',
            (phase === 'pending' || phase === 'resolving') && 'bg-status-warning animate-pulse',
          )}
        />
        <span className="truncate text-[10px] text-muted-foreground" title={worktree.path ?? worktree.name}>
          {worktree.kind === 'existing' ? worktree.path : worktree.name}
        </span>
      </div>
      <Handle type="source" position={Position.Right} id="wt" className="!size-2.5 !border-2" />
    </div>
  );
};

const nodeTypes = { runNode: RunNodeCard, formNode: FormCard, worktreeNode: WorktreeCard } as const;

const nodeTitleOf = (flowId: string): string => flowId.replace(/^[^:]+:/, '');

const isWorktreeFlowId = (flowId: string): boolean => flowId.startsWith('wt:');

const isFieldEdge = (edge: RunGraphEdge): boolean => !!edge.sourceFieldId;

const isDefaultEdge = (edge: RunGraphEdge): boolean => !!edge.targetFieldId;

interface RunGraphCanvasProps {
  draft: RunGraphDefinition;
  activeRun: RunGraphRunState | null;
  onSelect: (flowId: string | null) => void;
}

export const RunGraphCanvas: React.FC<RunGraphCanvasProps> = (props) => (
  <ReactFlowProvider>
    <RunGraphCanvasInner {...props} />
  </ReactFlowProvider>
);

const RunGraphCanvasInner: React.FC<RunGraphCanvasProps> = ({ draft, activeRun, onSelect }) => {
  const connectDraftNodes = useRunGraphStore((state) => state.connectDraftNodes);
  const disconnectDraftEdge = useRunGraphStore((state) => state.disconnectDraftEdge);
  const setDraftNodeBinding = useRunGraphStore((state) => state.setDraftNodeBinding);
  const moveDraftNode = useRunGraphStore((state) => state.moveDraftNode);
  const updateDraftWorktree = useRunGraphStore((state) => state.updateDraftWorktree);
  const removeDraftNode = useRunGraphStore((state) => state.removeDraftNode);
  const removeDraftWorktree = useRunGraphStore((state) => state.removeDraftWorktree);

  const worktreeTitleById = React.useMemo(() => {
    const titles = new Map<string, string>();
    for (const worktree of draft.worktrees) titles.set(worktree.id, worktree.title);
    return titles;
  }, [draft.worktrees]);

  const flowNodes = React.useMemo<RunGraphFlowNode[]>(() => {
    const runNodes: RunFlowNode[] = [];
    const formNodes: FormFlowNode[] = [];
    for (const node of draft.nodes) {
      if (node.kind === 'run') {
        const statuses: Record<string, RunInstancePhase | undefined> = {};
        for (const instance of node.instances) {
          statuses[instance.id] = activeRun?.instances[instance.id]?.phase;
        }
        const boundId = draft.nodeWorktreeBindings[node.id];
        runNodes.push({
          id: `node:${node.id}`,
          type: 'runNode' as const,
          position: node.position,
          data: {
            node,
            statuses,
            boundWorktreeTitle: boundId ? worktreeTitleById.get(boundId) ?? null : null,
          },
        });
      } else {
        formNodes.push({
          id: `node:${node.id}`,
          type: 'formNode' as const,
          position: node.position,
          data: {
            node,
            runtime: activeRun?.forms[node.id],
          },
        });
      }
    }
    const worktreeNodes: WorktreeFlowNode[] = draft.worktrees.map((worktree) => ({
      id: `wt:${worktree.id}`,
      type: 'worktreeNode' as const,
      position: worktree.position,
      data: {
        worktree,
        runtime: activeRun?.worktrees[worktree.id],
      },
    }));
    return [...runNodes, ...formNodes, ...worktreeNodes];
  }, [draft, activeRun, worktreeTitleById]);

  const flowEdges = React.useMemo<Edge[]>(() => {
    const dataEdges: Edge[] = draft.edges.map((edge) => {
      const phase = isFieldEdge(edge)
        ? activeRun?.forms[edge.source]?.phase
        : activeRun?.instances[edge.sourceInstanceId ?? '']?.phase;
      const isDefault = isDefaultEdge(edge);
      return {
        id: edge.id,
        source: `node:${edge.source}`,
        sourceHandle: edge.sourceFieldId ?? edge.sourceInstanceId,
        target: `node:${edge.target}`,
        targetHandle: edge.targetInputId ?? edge.targetFieldId,
        animated: phase === 'running' || phase === 'starting' || phase === 'waiting-input',
        style: isDefault
          ? { stroke: 'var(--muted-foreground)', strokeWidth: 1.5, strokeDasharray: '4 3' }
          : { stroke: 'var(--primary)', strokeWidth: 1.5 },
      };
    });
    const bindingEdges: Edge[] = Object.entries(draft.nodeWorktreeBindings).map(([nodeId, worktreeId]) => ({
      id: `bind:${worktreeId}:${nodeId}`,
      source: `wt:${worktreeId}`,
      target: `node:${nodeId}`,
      style: { stroke: 'var(--muted-foreground)', strokeWidth: 1.5, strokeDasharray: '6 4' },
    }));
    return [...bindingEdges, ...dataEdges];
  }, [draft, activeRun]);

  const [nodes, setNodes, onNodesChange] = useNodesState<RunGraphFlowNode>(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(flowEdges);

  React.useEffect(() => {
    setNodes(flowNodes);
  }, [flowNodes, setNodes]);

  React.useEffect(() => {
    setEdges(flowEdges);
  }, [flowEdges, setEdges]);

  const handleConnect = React.useCallback(
    (connection: Connection): void => {
      if (!connection.source || !connection.target || !connection.sourceHandle) return;
      if (isWorktreeFlowId(connection.source)) {
        const targetNode = draft.nodes.find((node) => node.id === nodeTitleOf(connection.target ?? ''));
        if (targetNode?.kind !== 'run') return;
        setDraftNodeBinding(nodeTitleOf(connection.target), nodeTitleOf(connection.source));
        return;
      }
      if (isWorktreeFlowId(connection.target)) return;
      const sourceNode = draft.nodes.find((node) => node.id === nodeTitleOf(connection.source ?? ''));
      const targetNode = draft.nodes.find((node) => node.id === nodeTitleOf(connection.target ?? ''));
      if (!sourceNode || !targetNode) return;
      const sourcePort: RunGraphEdgeSource | null = sourceNode.kind === 'form'
        ? { kind: 'field', fieldId: connection.sourceHandle }
        : { kind: 'instance', instanceId: connection.sourceHandle };
      if (!connection.targetHandle) return;
      const targetPort = targetNode.kind === 'form'
        ? { kind: 'field' as const, fieldId: connection.targetHandle }
        : { kind: 'input' as const, inputId: connection.targetHandle };
      connectDraftNodes(sourceNode.id, sourcePort, targetNode.id, targetPort);
    },
    [connectDraftNodes, setDraftNodeBinding, draft.nodes],
  );

  const handleNodeDragStop = React.useCallback(
    (_event: MouseEvent | TouchEvent | React.MouseEvent, node: RunGraphFlowNode): void => {
      if (isWorktreeFlowId(node.id)) {
        updateDraftWorktree(nodeTitleOf(node.id), { position: node.position });
      } else {
        moveDraftNode(nodeTitleOf(node.id), node.position);
      }
    },
    [moveDraftNode, updateDraftWorktree],
  );

  const handleNodesDelete = React.useCallback(
    (deleted: RunGraphFlowNode[]): void => {
      for (const node of deleted) {
        if (isWorktreeFlowId(node.id)) {
          removeDraftWorktree(nodeTitleOf(node.id));
        } else {
          removeDraftNode(nodeTitleOf(node.id));
        }
      }
    },
    [removeDraftNode, removeDraftWorktree],
  );

  const handleEdgesDelete = React.useCallback(
    (deleted: Edge[]): void => {
      for (const edge of deleted) {
        if (edge.id.startsWith('bind:')) {
          const [, worktreeId, nodeId] = edge.id.split(':');
          if (worktreeId && nodeId && draft.nodeWorktreeBindings[nodeId] === worktreeId) {
            setDraftNodeBinding(nodeId, null);
          }
          continue;
        }
        disconnectDraftEdge(edge.id);
      }
    },
    [disconnectDraftEdge, draft.nodeWorktreeBindings, setDraftNodeBinding],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={handleConnect}
      onNodeDragStop={handleNodeDragStop}
      onNodesDelete={handleNodesDelete}
      onEdgesDelete={handleEdgesDelete}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15, duration: 250 }}
      minZoom={0.2}
      onNodeClick={(_event, node) => onSelect(node.id)}
      onPaneClick={() => onSelect(null)}
      className="run-graph-canvas h-full w-full"
      deleteKeyCode={['Backspace', 'Delete']}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--border)" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
};
