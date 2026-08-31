import { z } from 'zod';
import type {
  MultiRunSessionLink,
  RunGraphDefinition,
  RunGraphEdge,
  RunGraphFileMeta,
  RunGraphFormField,
  RunGraphFormNode,
  RunGraphNode,
  RunGraphNodeInput,
  RunGraphScope,
  RunGraphWorktree,
  RunModelInstance,
} from '@/types/runGraph';
import { MAX_INSTANCES_PER_NODE, RUN_GRAPH_FORM_FIELD_TYPES, RUN_GRAPH_INPUT_NAME_PATTERN } from '@/types/runGraph';
import { createRunGraphEntityId } from './ids';

export const MAX_NODES_PER_GRAPH = 32;
const MAX_WORKTREES_PER_GRAPH = 16;
const MAX_EDGES_PER_GRAPH = 120;
const MAX_TEMPLATE_LENGTH = 20000;
const MAX_GRAPH_TITLE_LENGTH = 120;
const MAX_SETUP_COMMANDS = 10;
const MAX_SETUP_COMMAND_LENGTH = 2000;
const MAX_TEXT_FIELD_LENGTH = 200;
export const MAX_FIELD_OPTIONS = 20;

const boundedText = (maxLength: number) =>
  z.string().trim().transform((value) => value.slice(0, maxLength));

const coordinate = z.number().finite().catch(0);

const positionSchema = z
  .object({ x: coordinate, y: coordinate })
  .catch({ x: 0, y: 0 });

const worktreeOverrideSchema = z
  .union([
    z.object({ mode: z.literal('inherit') }),
    z.object({ mode: z.literal('root') }),
    z.object({ mode: z.literal('dedicated-new') }),
    z.object({ mode: z.literal('pool'), worktreeId: z.string().min(1) }),
  ])
  .optional()
  .catch(undefined);

const instanceSchema = z.object({
  id: z.string().catch(''),
  providerID: boundedText(MAX_TEXT_FIELD_LENGTH).catch(''),
  modelID: boundedText(MAX_TEXT_FIELD_LENGTH).catch(''),
  variant: boundedText(MAX_TEXT_FIELD_LENGTH).optional(),
  displayName: boundedText(MAX_TEXT_FIELD_LENGTH).optional(),
  worktree: worktreeOverrideSchema,
});

const formFieldSchema = z.object({
  id: z.string().catch(''),
  title: boundedText(MAX_TEXT_FIELD_LENGTH).catch(''),
  type: z.enum(RUN_GRAPH_FORM_FIELD_TYPES).catch('text'),
  required: z.boolean().catch(false),
  placeholder: boundedText(MAX_TEXT_FIELD_LENGTH).optional(),
  defaultValue: z.string().transform((value) => value.slice(0, MAX_TEXT_FIELD_LENGTH)).optional(),
  options: z.array(boundedText(MAX_TEXT_FIELD_LENGTH)).optional(),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  step: z.number().finite().optional(),
});

// Non-object entries degrade to this untitled shape, which the field sanitizer drops.
const formFieldEntrySchema = formFieldSchema.catch({ id: '', title: '', type: 'text', required: false });

const nodeInputSchema = z.object({
  id: z.string().catch(''),
  name: boundedText(MAX_TEXT_FIELD_LENGTH).catch(''),
});

const nodeSchema = z.object({
  id: z.string().catch(''),
  kind: z.string().catch('run'),
  title: boundedText(MAX_GRAPH_TITLE_LENGTH).catch(''),
  agent: boundedText(MAX_TEXT_FIELD_LENGTH).optional(),
  instances: z.array(instanceSchema).catch([]),
  inputs: z.array(nodeInputSchema).catch([]),
  promptTemplate: z.string().transform((value) => value.slice(0, MAX_TEMPLATE_LENGTH)).catch(''),
  fields: z.array(formFieldEntrySchema).catch([]),
  position: positionSchema,
});


const worktreeSchema = z.object({
  id: z.string().catch(''),
  title: boundedText(MAX_GRAPH_TITLE_LENGTH).catch(''),
  kind: z.string().catch(''),
  path: boundedText(MAX_TEXT_FIELD_LENGTH * 4).optional(),
  name: boundedText(MAX_TEXT_FIELD_LENGTH).optional(),
  baseBranch: boundedText(MAX_TEXT_FIELD_LENGTH).optional(),
  setupCommands: z.array(z.string()).catch([]),
  position: positionSchema,
});

const edgeSchema = z.object({
  id: z.string().catch(''),
  source: z.string().catch(''),
  sourceInstanceId: z.string().catch('').optional(),
  sourceFieldId: z.string().catch('').optional(),
  target: z.string().catch(''),
  targetInputId: z.string().catch('').optional(),
  targetFieldId: z.string().catch('').optional(),
});

const graphSchema = z.object({
  id: z.string().catch(''),
  name: boundedText(MAX_GRAPH_TITLE_LENGTH).catch(''),
  nodes: z.array(nodeSchema).catch([]),
  worktrees: z.array(worktreeSchema).catch([]),
  edges: z.array(edgeSchema).catch([]),
  nodeWorktreeBindings: z.record(z.string(), z.string()).catch({}),
  baseBranch: boundedText(MAX_TEXT_FIELD_LENGTH).optional(),
  createdAt: z.number().finite().catch(0),
  updatedAt: z.number().finite().catch(0),
});

const MAX_SESSION_LINKS = 200;

const sessionLinkSchema = z.object({
  graphId: z.string().catch(''),
  graphName: boundedText(MAX_GRAPH_TITLE_LENGTH).catch(''),
  nodeId: z.string().catch(''),
  nodeTitle: boundedText(MAX_GRAPH_TITLE_LENGTH).catch(''),
  directory: z.string().catch(''),
  at: z.number().finite().catch(0),
});

const sessionIndexSchema = z.record(z.string(), sessionLinkSchema).catch({});

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,150}$/;

export const sanitizeRunSessionIndex = (value: unknown): Record<string, MultiRunSessionLink> => {
  const parsed = sessionIndexSchema.safeParse(value);
  if (!parsed.success) return {};

  const entries: Array<[string, MultiRunSessionLink]> = [];
  for (const [sessionId, link] of Object.entries(parsed.data)) {
    if (!SESSION_ID_PATTERN.test(sessionId)) continue;
    if (!link.graphId || !link.nodeId) continue;
    entries.push([sessionId, link]);
  }
  entries.sort((left, right) => right[1].at - left[1].at);

  const index: Record<string, MultiRunSessionLink> = {};
  for (const [sessionId, link] of entries.slice(0, MAX_SESSION_LINKS)) {
    index[sessionId] = link;
  }
  return index;
};

const cap = <T,>(items: T[], max: number): T[] => items.slice(0, max);

const sanitizeInstance = (
  instance: z.infer<typeof instanceSchema>,
  worktreeIds: Set<string>,
): RunModelInstance | null => {
  if (!instance.providerID || !instance.modelID) return null;
  const id = instance.id || createRunGraphEntityId('inst');

  const result: RunModelInstance = { id, providerID: instance.providerID, modelID: instance.modelID };
  if (instance.variant) result.variant = instance.variant;
  if (instance.displayName) result.displayName = instance.displayName;
  const override = instance.worktree;
  if (override?.mode === 'root') result.worktree = { mode: 'root' };
  if (override?.mode === 'dedicated-new') result.worktree = { mode: 'dedicated-new' };
  if (override?.mode === 'pool' && worktreeIds.has(override.worktreeId)) {
    result.worktree = { mode: 'pool', worktreeId: override.worktreeId };
  }
  return result;
};

const sanitizeInstances = (
  value: z.infer<typeof instanceSchema>[],
  worktreeIds: Set<string>,
): RunModelInstance[] => {
  const instances: RunModelInstance[] = [];
  const seenIds = new Set<string>();
  for (const candidate of value) {
    if (instances.length >= MAX_INSTANCES_PER_NODE) break;
    const instance = sanitizeInstance(candidate, worktreeIds);
    if (!instance || seenIds.has(instance.id)) continue;
    seenIds.add(instance.id);
    instances.push(instance);
  }
  return instances;
};

const sanitizeWorktree = (worktree: z.infer<typeof worktreeSchema>): RunGraphWorktree | null => {
  if (!worktree.id || !worktree.title) return null;
  const kind =
    worktree.kind === 'new'
      ? 'new'
      : worktree.kind === 'existing'
        ? 'existing'
        : worktree.path
          ? 'existing'
          : worktree.name
            ? 'new'
            : null;
  if (!kind) return null;

  const setupCommands = cap(
    worktree.setupCommands
      .map((command) => command.trim().slice(0, MAX_SETUP_COMMAND_LENGTH))
      .filter((command) => command.length > 0),
    MAX_SETUP_COMMANDS,
  );

  const result: RunGraphWorktree = { id: worktree.id, title: worktree.title, kind, position: worktree.position };
  if (kind === 'existing' && worktree.path) result.path = worktree.path;
  if (kind === 'new' && worktree.name) result.name = worktree.name;
  if (worktree.baseBranch) result.baseBranch = worktree.baseBranch;
  if (setupCommands.length > 0) result.setupCommands = setupCommands;
  return result;
};

const sanitizeFormField = (field: z.infer<typeof formFieldSchema>): RunGraphFormField | null => {
  if (!field.title) return null;

  const result: RunGraphFormField = {
    id: field.id || createRunGraphEntityId('field'),
    title: field.title,
    type: field.type,
  };
  if (field.required) result.required = true;
  if (field.placeholder) result.placeholder = field.placeholder;
  if (field.defaultValue) result.defaultValue = field.defaultValue;

  if (field.type === 'select') {
    const options = cap(
      (field.options ?? []).map((option) => option.trim()).filter((option) => option.length > 0),
      MAX_FIELD_OPTIONS,
    );
    if (options.length === 0) return null;
    result.options = options;
    if (!result.defaultValue && options.length > 0) result.defaultValue = options[0];
  }
  if (field.type === 'slider' || field.type === 'number') {
    if (field.min !== undefined && Number.isFinite(field.min)) result.min = field.min;
    if (field.max !== undefined && Number.isFinite(field.max)) result.max = field.max;
    if (field.step !== undefined && Number.isFinite(field.step) && field.step > 0) result.step = field.step;
    if (result.min !== undefined && result.max !== undefined && result.min > result.max) return null;
  }
  return result;
};

const sanitizeNodeInputs = (value: z.infer<typeof nodeInputSchema>[]): RunGraphNodeInput[] => {
  const inputs: RunGraphNodeInput[] = [];
  const seenIds = new Set<string>();
  for (const candidate of value) {
    if (!candidate.name || !RUN_GRAPH_INPUT_NAME_PATTERN.test(candidate.name)) continue;
    const input: RunGraphNodeInput = { id: candidate.id || createRunGraphEntityId('input'), name: candidate.name };
    if (seenIds.has(input.id)) continue;
    seenIds.add(input.id);
    inputs.push(input);
  }
  return inputs;
};

const sanitizeFormFields = (value: z.infer<typeof formFieldSchema>[]): RunGraphFormField[] => {
  const fields: RunGraphFormField[] = [];
  const seenIds = new Set<string>();
  for (const candidate of value) {
    const field = sanitizeFormField(candidate);
    if (!field || seenIds.has(field.id)) continue;
    seenIds.add(field.id);
    fields.push(field);
  }
  return fields;
};

const sanitizeNodes = (
  value: z.infer<typeof nodeSchema>[],
  worktreeIds: Set<string>,
): RunGraphNode[] => {
  const nodes: RunGraphNode[] = [];
  const seenIds = new Set<string>();
  for (const candidate of value) {
    if (nodes.length >= MAX_NODES_PER_GRAPH) break;
    if (!candidate.id || !candidate.title || seenIds.has(candidate.id)) continue;
    seenIds.add(candidate.id);

    if (candidate.kind === 'form') {
      const node: RunGraphFormNode = {
        kind: 'form',
        id: candidate.id,
        title: candidate.title,
        fields: sanitizeFormFields(candidate.fields),
        position: candidate.position,
      };
      nodes.push(node);
      continue;
    }

    const node: RunGraphNode = {
      kind: 'run',
      id: candidate.id,
      title: candidate.title,
      instances: sanitizeInstances(candidate.instances, worktreeIds),
      inputs: sanitizeNodeInputs(candidate.inputs),
      promptTemplate: candidate.promptTemplate,
      position: candidate.position,
    };
    if (candidate.agent) node.agent = candidate.agent;
    nodes.push(node);
  }
  return nodes;
};

const LEGACY_INPUT_NAME = 'inputs';

/**
 * Graphs saved before named inputs point their edges at the run node without a
 * target port. Create an input literally named "inputs" on such nodes so old
 * templates ({{inputs}}, {{inputs[0]}}, {{inputs.join("sep")}}) keep working.
 */
const migrateLegacyEdgeTargets = (
  nodes: RunGraphNode[],
  rawEdges: z.infer<typeof edgeSchema>[],
): RunGraphNode[] => {
  const needsLegacyInput = new Set<string>();
  for (const edge of rawEdges) {
    if (edge.targetInputId) continue;
    const target = nodes.find((node) => node.id === edge.target);
    if (target?.kind === 'run') needsLegacyInput.add(target.id);
  }
  if (needsLegacyInput.size === 0) return nodes;
  return nodes.map((node) => {
    if (node.kind !== 'run' || !needsLegacyInput.has(node.id)) return node;
    if (node.inputs.some((input) => input.name === LEGACY_INPUT_NAME)) return node;
    return {
      ...node,
      inputs: [...node.inputs, { id: createRunGraphEntityId('input'), name: LEGACY_INPUT_NAME }],
    };
  });
};

const sanitizeEdges = (
  value: z.infer<typeof edgeSchema>[],
  nodeById: Map<string, RunGraphNode>,
): RunGraphEdge[] => {
  const edges: RunGraphEdge[] = [];
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  for (const edge of value) {
    if (edges.length >= MAX_EDGES_PER_GRAPH) break;
    if (!edge.id || seenIds.has(edge.id)) continue;
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) continue;

    const sourceInstanceId = edge.sourceInstanceId || undefined;
    const sourceFieldId = edge.sourceFieldId || undefined;
    const targetFieldId = edge.targetFieldId || undefined;
    let targetInputId = edge.targetInputId || undefined;

    let valid = false;
    if (source.kind === 'run' && sourceInstanceId && !sourceFieldId) {
      valid = source.instances.some((instance) => instance.id === sourceInstanceId);
    }
    if (source.kind === 'form' && sourceFieldId && !sourceInstanceId) {
      valid = source.fields.some((field) => field.id === sourceFieldId);
    }
    if (target.kind === 'run') {
      if (targetFieldId) {
        valid = false;
      } else if (targetInputId) {
        valid = valid && target.inputs.some((input) => input.id === targetInputId);
      } else {
        const legacyInput = target.inputs.find((input) => input.name === LEGACY_INPUT_NAME);
        if (legacyInput) {
          targetInputId = legacyInput.id;
        } else {
          valid = false;
        }
      }
    } else if (target.kind === 'form') {
      if (targetInputId) {
        valid = false;
      } else if (!targetFieldId) {
        valid = false;
      } else {
        valid = valid && target.fields.some((field) => field.id === targetFieldId);
      }
    }
    if (!valid) continue;

    const edgeKey = `${edge.source}|${sourceInstanceId ?? ''}|${sourceFieldId ?? ''}|${edge.target}|${targetInputId ?? ''}|${targetFieldId ?? ''}`;
    if (seenKeys.has(edgeKey)) continue;
    seenIds.add(edge.id);
    seenKeys.add(edgeKey);
    const result: RunGraphEdge = { id: edge.id, source: edge.source, target: edge.target };
    if (sourceInstanceId) result.sourceInstanceId = sourceInstanceId;
    if (sourceFieldId) result.sourceFieldId = sourceFieldId;
    if (targetInputId) result.targetInputId = targetInputId;
    if (targetFieldId) result.targetFieldId = targetFieldId;
    edges.push(result);
  }
  return edges;
};

const sanitizeParsedGraph = (raw: z.infer<typeof graphSchema>): RunGraphDefinition | null => {
  if (!raw.id) return null;

  const worktrees: RunGraphWorktree[] = [];
  const seenWorktreeIds = new Set<string>();
  for (const candidate of raw.worktrees) {
    if (worktrees.length >= MAX_WORKTREES_PER_GRAPH) break;
    const worktree = sanitizeWorktree(candidate);
    if (!worktree || seenWorktreeIds.has(worktree.id)) continue;
    seenWorktreeIds.add(worktree.id);
    worktrees.push(worktree);
  }
  const worktreeIds = new Set(worktrees.map((worktree) => worktree.id));

  const nodes = migrateLegacyEdgeTargets(sanitizeNodes(raw.nodes, worktreeIds), raw.edges);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const bindings: Record<string, string> = {};
  for (const [nodeId, worktreeId] of Object.entries(raw.nodeWorktreeBindings)) {
    const boundNode = nodeById.get(nodeId);
    if (boundNode?.kind === 'run' && worktreeIds.has(worktreeId)) {
      bindings[nodeId] = worktreeId;
    }
  }

  const result: RunGraphDefinition = {
    id: raw.id,
    name: raw.name || 'Untitled graph',
    nodes,
    worktrees,
    edges: sanitizeEdges(raw.edges, nodeById),
    nodeWorktreeBindings: bindings,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
  if (raw.baseBranch) result.baseBranch = raw.baseBranch;
  return result;
};

export const sanitizeRunGraph = (value: RunGraphDefinition | null | undefined): RunGraphDefinition | null => {
  const parsed = graphSchema.safeParse(value);
  if (!parsed.success) return null;
  return sanitizeParsedGraph(parsed.data);
};

/** Maximum number of workflow files shown across both scopes. */
const MAX_RUN_GRAPHS = 50;

export interface RunGraphFileEntryInput {
  /** File name stem of the backing YAML file. */
  fileName: string;
  scope: RunGraphScope;
  /** Raw file content as parsed by the server; garbage is absorbed. */
  graph: RunGraphDefinition | null | undefined;
}

export interface SanitizedRunGraphFiles {
  /** Sanitized graphs, in entry order (callers pass project scope first). */
  graphs: RunGraphDefinition[];
  /** Backing file metadata keyed by graph id. */
  fileMeta: Record<string, RunGraphFileMeta>;
}

/**
 * Sanitize workflow file entries into trusted graphs plus per-file metadata.
 * Unrecoverable files are skipped so one bad file cannot hide the others.
 * Callers order entries project-first; a graph id seen twice (the same file
 * copied across scopes) keeps only its first occurrence.
 */
export const sanitizeRunGraphFileEntries = (entries: RunGraphFileEntryInput[]): SanitizedRunGraphFiles => {
  const graphs: RunGraphDefinition[] = [];
  const fileMeta: Record<string, RunGraphFileMeta> = {};
  const seenIds = new Set<string>();
  for (const entry of entries) {
    if (graphs.length >= MAX_RUN_GRAPHS) break;
    if (!entry.fileName) continue;
    const graph = sanitizeRunGraph(entry.graph);
    if (!graph || seenIds.has(graph.id)) continue;
    seenIds.add(graph.id);
    graphs.push(graph);
    fileMeta[graph.id] = { fileName: entry.fileName, scope: entry.scope };
  }
  return { graphs, fileMeta };
};
