import type { MultiRunModelSelection } from './multirun';

export const MAX_INSTANCES_PER_NODE = 5;

export type RunGraphWorktreeKind = 'existing' | 'new';

export interface RunGraphPosition {
  x: number;
  y: number;
}

export interface RunGraphWorktree {
  id: string;
  title: string;
  kind: RunGraphWorktreeKind;
  path?: string;
  name?: string;
  baseBranch?: string;
  setupCommands?: string[];
  position: RunGraphPosition;
}

export type RunInstanceWorktree =
  | { mode: 'inherit' }
  | { mode: 'root' }
  | { mode: 'pool'; worktreeId: string }
  | { mode: 'dedicated-new' };

export interface RunModelInstance extends MultiRunModelSelection {
  id: string;
  worktree?: RunInstanceWorktree;
}

export type RunGraphFormFieldType = 'text' | 'textarea' | 'number' | 'date' | 'time' | 'select' | 'slider' | 'checkbox';

export const RUN_GRAPH_FORM_FIELD_TYPES: readonly RunGraphFormFieldType[] = [
  'text',
  'textarea',
  'number',
  'date',
  'time',
  'select',
  'slider',
  'checkbox',
];

/**
 * Input names appear inside template placeholders ({{name}}, {{name[0]}},
 * {{name.join(", ")}}), so they must not contain whitespace or any character
 * that is part of the placeholder grammar.
 */
export const RUN_GRAPH_INPUT_NAME_PATTERN = /^[^\s.[\]{}"()]+$/;

export interface RunGraphNodeInput {
  id: string;
  name: string;
}

export interface RunGraphFormField {
  id: string;
  title: string;
  type: RunGraphFormFieldType;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
}

export interface RunGraphRunNode {
  kind: 'run';
  id: string;
  title: string;
  agent?: string;
  instances: RunModelInstance[];
  /** Named inputs; templates reference them as {{name}} variables. Empty by default. */
  inputs: RunGraphNodeInput[];
  promptTemplate: string;
  position: RunGraphPosition;
}

export interface RunGraphFormNode {
  kind: 'form';
  id: string;
  title: string;
  fields: RunGraphFormField[];
  position: RunGraphPosition;
}

export type RunGraphNode = RunGraphRunNode | RunGraphFormNode;

export type RunGraphEdgeSource =
  | { kind: 'instance'; instanceId: string }
  | { kind: 'field'; fieldId: string };

export interface RunGraphEdge {
  id: string;
  source: string;
  /** Set when the source port is a run node's model output. */
  sourceInstanceId?: string;
  /** Set when the source port is a form node's field output. */
  sourceFieldId?: string;
  target: string;
  /** Set when the target is a run node: receives the source output into this named input. */
  targetInputId?: string;
  /** Set when the target is a form node: injects the source output as the field's default value. */
  targetFieldId?: string;
}

export interface RunGraphDefinition {
  id: string;
  name: string;
  nodes: RunGraphNode[];
  worktrees: RunGraphWorktree[];
  edges: RunGraphEdge[];
  nodeWorktreeBindings: Record<string, string>;
  baseBranch?: string;
  createdAt: number;
  updatedAt: number;
}

export type RunInstancePlacement =
  | { mode: 'root' }
  | { mode: 'pool'; worktreeId: string }
  | { mode: 'dedicated-new' };

export interface MultiRunSessionLink {
  graphId: string;
  graphName: string;
  nodeId: string;
  nodeTitle: string;
  directory: string;
  at: number;
}

export const resolveInstancePlacement = (
  instance: RunModelInstance,
  nodeId: string,
  bindings: Record<string, string>,
): RunInstancePlacement => {
  const override = instance.worktree;
  if (override?.mode === 'root') return { mode: 'root' };
  if (override?.mode === 'pool') return { mode: 'pool', worktreeId: override.worktreeId };
  if (override?.mode === 'dedicated-new') return { mode: 'dedicated-new' };

  const boundWorktreeId = bindings[nodeId];
  if (boundWorktreeId) return { mode: 'pool', worktreeId: boundWorktreeId };
  return { mode: 'root' };
};
