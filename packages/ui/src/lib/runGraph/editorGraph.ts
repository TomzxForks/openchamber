import type {
  MultiRunSessionLink,
  RunGraphDefinition,
  RunGraphEdge,
  RunGraphFormField,
  RunGraphFormNode,
  RunGraphNode,
  RunGraphNodeInput,
  RunGraphPosition,
  RunGraphRunNode,
  RunGraphWorktree,
  RunModelInstance,
} from '@/types/runGraph';
import { createRunGraphEntityId } from './ids';

export const touchRunGraph = (graph: RunGraphDefinition, now: number): RunGraphDefinition => ({
  ...graph,
  updatedAt: now,
});

export const pickGraphForSession = (
  graphs: RunGraphDefinition[],
  sessionIndex: Record<string, MultiRunSessionLink>,
  currentSessionId: string | null | undefined,
): { graph: RunGraphDefinition; link: MultiRunSessionLink } | null => {
  if (!currentSessionId) return null;
  const link = sessionIndex[currentSessionId];
  if (!link) return null;
  const graph = graphs.find((entry) => entry.id === link.graphId);
  if (!graph) return null;
  return { graph, link };
};

export const listNodeSessions = (
  sessionIndex: Record<string, MultiRunSessionLink>,
  nodeId: string,
): Array<{ sessionId: string; link: MultiRunSessionLink }> => {
  const sessions: Array<{ sessionId: string; link: MultiRunSessionLink }> = [];
  for (const [sessionId, link] of Object.entries(sessionIndex)) {
    if (link.nodeId === nodeId) sessions.push({ sessionId, link });
  }
  return sessions.sort((left, right) => right.link.at - left.link.at);
};

export const createEmptyRunGraph = (name: string, now: number): RunGraphDefinition => ({
  id: createRunGraphEntityId('graph'),
  name,
  nodes: [],
  worktrees: [],
  edges: [],
  nodeWorktreeBindings: {},
  createdAt: now,
  updatedAt: now,
});

export const createRunGraphNode = (title: string, position: RunGraphPosition): RunGraphRunNode => ({
  kind: 'run',
  id: createRunGraphEntityId('node'),
  title,
  instances: [],
  inputs: [],
  promptTemplate: '',
  position,
});

export const createRunGraphNodeInput = (name: string): RunGraphNodeInput => ({
  id: createRunGraphEntityId('input'),
  name,
});

export const createRunGraphFormField = (title: string, type: RunGraphFormField['type']): RunGraphFormField => ({
  id: createRunGraphEntityId('field'),
  title,
  type,
});

export const createRunGraphFormNode = (title: string, position: RunGraphPosition): RunGraphFormNode => ({
  kind: 'form',
  id: createRunGraphEntityId('node'),
  title,
  fields: [],
  position,
});

const replaceInputs = (
  graph: RunGraphDefinition,
  nodeId: string,
  inputs: RunGraphNodeInput[],
): RunGraphDefinition =>
  replaceNodes(
    graph,
    graph.nodes.map((node): RunGraphNode =>
      node.id === nodeId && node.kind === 'run' ? { ...node, inputs } : node,
    ),
  );

export const withNodeInput = (
  graph: RunGraphDefinition,
  nodeId: string,
  input: RunGraphNodeInput,
): RunGraphDefinition => {
  const node = graph.nodes.find((entry) => entry.id === nodeId);
  if (!node || node.kind !== 'run') return graph;
  return replaceInputs(graph, nodeId, [...node.inputs, input]);
};

export const withUpdatedNodeInput = (
  graph: RunGraphDefinition,
  nodeId: string,
  inputId: string,
  patch: Partial<Pick<RunGraphNodeInput, 'name'>>,
): RunGraphDefinition => {
  const node = graph.nodes.find((entry) => entry.id === nodeId);
  if (!node || node.kind !== 'run') return graph;
  return replaceInputs(
    graph,
    nodeId,
    node.inputs.map((input) => (input.id === inputId ? { ...input, ...patch } : input)),
  );
};

export const withoutNodeInput = (
  graph: RunGraphDefinition,
  nodeId: string,
  inputId: string,
): RunGraphDefinition => {
  const node = graph.nodes.find((entry) => entry.id === nodeId);
  if (!node || node.kind !== 'run') return graph;
  const inputs = node.inputs.filter((input) => input.id !== inputId);
  if (inputs.length === node.inputs.length) return graph;
  return {
    ...replaceInputs(graph, nodeId, inputs),
    edges: graph.edges.filter((edge) => edge.targetInputId !== inputId),
  };
};

const edgePortKey = (edge: Pick<RunGraphEdge, 'source' | 'sourceInstanceId' | 'sourceFieldId' | 'target' | 'targetFieldId' | 'targetInputId'>): string =>
  `${edge.source}|${edge.sourceInstanceId ?? ''}|${edge.sourceFieldId ?? ''}|${edge.target}|${edge.targetFieldId ?? ''}|${edge.targetInputId ?? ''}`;

export const createRunGraphWorktree = (title: string, position: RunGraphPosition): RunGraphWorktree => ({
  id: createRunGraphEntityId('wt'),
  title,
  kind: 'new',
  name: '',
  position,
});

const replaceNodes = (graph: RunGraphDefinition, nodes: RunGraphNode[]): RunGraphDefinition => ({
  ...graph,
  nodes: nodes.map((node) => node),
});

export const withNode = (graph: RunGraphDefinition, node: RunGraphNode): RunGraphDefinition =>
  replaceNodes(graph, [...graph.nodes, node]);

export const withUpdatedNode = (
  graph: RunGraphDefinition,
  nodeId: string,
  patch: Partial<RunGraphRunNode>,
): RunGraphDefinition =>
  replaceNodes(
    graph,
    graph.nodes.map((node): RunGraphNode => {
      if (node.id !== nodeId || node.kind !== 'run') return node;
      return { ...node, ...patch };
    }),
  );

export const withUpdatedFormNode = (
  graph: RunGraphDefinition,
  nodeId: string,
  patch: Partial<Pick<RunGraphFormNode, 'title'>>,
): RunGraphDefinition =>
  replaceNodes(
    graph,
    graph.nodes.map((node): RunGraphNode => {
      if (node.id !== nodeId || node.kind !== 'form') return node;
      return { ...node, ...patch };
    }),
  );

const replaceFormFields = (
  graph: RunGraphDefinition,
  nodeId: string,
  fields: RunGraphFormField[],
): RunGraphDefinition =>
  replaceNodes(
    graph,
    graph.nodes.map((node): RunGraphNode => (node.id === nodeId && node.kind === 'form' ? { ...node, fields } : node)),
  );

export const withFormField = (
  graph: RunGraphDefinition,
  nodeId: string,
  field: RunGraphFormField,
): RunGraphDefinition => {
  const node = graph.nodes.find((entry) => entry.id === nodeId);
  if (!node || node.kind !== 'form') return graph;
  return replaceFormFields(graph, nodeId, [...node.fields, field]);
};

export const withUpdatedFormField = (
  graph: RunGraphDefinition,
  nodeId: string,
  fieldId: string,
  patch: Partial<RunGraphFormField>,
): RunGraphDefinition => {
  const node = graph.nodes.find((entry) => entry.id === nodeId);
  if (!node || node.kind !== 'form') return graph;
  return replaceFormFields(
    graph,
    nodeId,
    node.fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
  );
};

export const withoutFormField = (
  graph: RunGraphDefinition,
  nodeId: string,
  fieldId: string,
): RunGraphDefinition => {
  const node = graph.nodes.find((entry) => entry.id === nodeId);
  if (!node || node.kind !== 'form') return graph;
  const fields = node.fields.filter((field) => field.id !== fieldId);
  if (fields.length === node.fields.length) return graph;
  return {
    ...replaceFormFields(graph, nodeId, fields),
    edges: graph.edges.filter(
      (edge) => edge.sourceFieldId !== fieldId && edge.targetFieldId !== fieldId,
    ),
  };
};

export const withMovedNode = (
  graph: RunGraphDefinition,
  nodeId: string,
  position: RunGraphPosition,
): RunGraphDefinition =>
  replaceNodes(
    graph,
    graph.nodes.map((node): RunGraphNode => {
      if (node.id !== nodeId) return node;
      return node.kind === 'run' ? { ...node, position } : { ...node, position };
    }),
  );

export const withoutNode = (graph: RunGraphDefinition, nodeId: string): RunGraphDefinition => {
  const nodes = graph.nodes.filter((node) => node.id !== nodeId);
  if (nodes.length === graph.nodes.length) return graph;
  return {
    ...graph,
    nodes,
    edges: graph.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    nodeWorktreeBindings: Object.fromEntries(
      Object.entries(graph.nodeWorktreeBindings).filter(([boundNodeId]) => boundNodeId !== nodeId),
    ),
  };
};

export const withNodeBinding = (
  graph: RunGraphDefinition,
  nodeId: string,
  worktreeId: string | null,
): RunGraphDefinition => {
  const bindings = { ...graph.nodeWorktreeBindings };
  if (worktreeId) {
    bindings[nodeId] = worktreeId;
  } else {
    delete bindings[nodeId];
  }
  return { ...graph, nodeWorktreeBindings: bindings };
};

const replaceWorktrees = (graph: RunGraphDefinition, worktrees: RunGraphWorktree[]): RunGraphDefinition => ({
  ...graph,
  worktrees,
});

export const withWorktree = (graph: RunGraphDefinition, worktree: RunGraphWorktree): RunGraphDefinition =>
  replaceWorktrees(graph, [...graph.worktrees, worktree]);

export const withUpdatedWorktree = (
  graph: RunGraphDefinition,
  worktreeId: string,
  patch: Partial<RunGraphWorktree>,
): RunGraphDefinition =>
  replaceWorktrees(
    graph,
    graph.worktrees.map((worktree) => (worktree.id === worktreeId ? { ...worktree, ...patch } : worktree)),
  );

const stripInstanceWorktree = (instance: RunModelInstance): RunModelInstance => {
  const stripped: RunModelInstance = {
    id: instance.id,
    providerID: instance.providerID,
    modelID: instance.modelID,
  };
  if (instance.variant) stripped.variant = instance.variant;
  if (instance.displayName) stripped.displayName = instance.displayName;
  return stripped;
};

export const withoutWorktree = (graph: RunGraphDefinition, worktreeId: string): RunGraphDefinition => {
  const worktrees = graph.worktrees.filter((worktree) => worktree.id !== worktreeId);
  if (worktrees.length === graph.worktrees.length) return graph;
  return {
    ...graph,
    worktrees,
    nodeWorktreeBindings: Object.fromEntries(
      Object.entries(graph.nodeWorktreeBindings).filter(([, boundId]) => boundId !== worktreeId),
    ),
    nodes: graph.nodes.map((node) => {
      if (node.kind !== 'run') return node;
      return {
        ...node,
        instances: node.instances.map((instance) => {
          if (instance.worktree?.mode === 'pool' && instance.worktree.worktreeId === worktreeId) {
            return stripInstanceWorktree(instance);
          }
          return instance;
        }),
      };
    }),
  };
};

export const withEdge = (
  graph: RunGraphDefinition,
  edge: Omit<RunGraphEdge, 'id'> & { id?: string },
): RunGraphDefinition => {
  const edgeKey = edgePortKey(edge);
  const exists = graph.edges.some((candidate) => edgePortKey(candidate) === edgeKey);
  if (exists) return graph;
  return {
    ...graph,
    edges: [...graph.edges, { id: edge.id ?? createRunGraphEntityId('edge'), ...edge }],
  };
};

export const withoutEdge = (graph: RunGraphDefinition, edgeId: string): RunGraphDefinition => {
  const edges = graph.edges.filter((edge) => edge.id !== edgeId);
  if (edges.length === graph.edges.length) return graph;
  return { ...graph, edges };
};

const replaceInstances = (
  graph: RunGraphDefinition,
  nodeId: string,
  instances: RunModelInstance[],
): RunGraphDefinition =>
  replaceNodes(
    graph,
    graph.nodes.map((node): RunGraphNode =>
      node.id === nodeId && node.kind === 'run' ? { ...node, instances } : node,
    ),
  );

export const withInstance = (
  graph: RunGraphDefinition,
  nodeId: string,
  instance: RunModelInstance,
): RunGraphDefinition => {
  const node = graph.nodes.find((entry) => entry.id === nodeId);
  if (!node || node.kind !== 'run') return graph;
  return replaceInstances(graph, nodeId, [...node.instances, instance]);
};

export const withUpdatedInstance = (
  graph: RunGraphDefinition,
  nodeId: string,
  instanceId: string,
  patch: Partial<RunModelInstance>,
): RunGraphDefinition => {
  const node = graph.nodes.find((entry) => entry.id === nodeId);
  if (!node || node.kind !== 'run') return graph;
  return replaceInstances(
    graph,
    nodeId,
    node.instances.map((instance) => (instance.id === instanceId ? { ...instance, ...patch } : instance)),
  );
};

export const withoutInstance = (
  graph: RunGraphDefinition,
  nodeId: string,
  instanceId: string,
): RunGraphDefinition => {
  const node = graph.nodes.find((entry) => entry.id === nodeId);
  if (!node || node.kind !== 'run') return graph;
  const instances = node.instances.filter((instance) => instance.id !== instanceId);
  if (instances.length === node.instances.length) return graph;
  return {
    ...replaceInstances(graph, nodeId, instances),
    edges: graph.edges.filter((edge) => edge.sourceInstanceId !== instanceId),
  };
};
