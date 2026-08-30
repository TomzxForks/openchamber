import type { Session } from '@opencode-ai/sdk/v2';
import type {
  MultiRunSessionLink,
  RunGraphDefinition,
  RunGraphEdge,
  RunGraphFormField,
  RunGraphFormNode,
  RunGraphNode,
  RunGraphRunNode,
  RunGraphWorktree,
  RunInstancePlacement,
  RunModelInstance,
} from '@/types/runGraph';
import { resolveInstancePlacement } from '@/types/runGraph';
import { renderRunGraphTemplate, type RunTemplateValues } from './template';
import { toRunGraphModelSlug, toRunGraphSlug } from './slug';

export type RunInstancePhase = 'pending' | 'starting' | 'running' | 'done' | 'failed' | 'blocked' | 'skipped';

export interface RunInstanceRuntime {
  phase: RunInstancePhase;
  sessionId?: string;
  directory?: string;
  output?: string;
  reason?: string;
}

export type RunWorktreePhase = 'pending' | 'resolving' | 'ready' | 'failed';

export interface RunWorktreeRuntime {
  phase: RunWorktreePhase;
  path?: string;
  reason?: string;
}

export type RunFormPhase = 'waiting-input' | 'submitted' | 'failed' | 'skipped';

export interface RunGraphFormRequest {
  nodeId: string;
  nodeTitle: string;
  fields: RunGraphFormField[];
  defaults: Record<string, string>;
}

export interface RunFormRuntime {
  phase: RunFormPhase;
  /** Present while phase is waiting-input; the UI renders this form. */
  request?: RunGraphFormRequest;
  /** Field values after the user submitted the form. */
  values?: Record<string, string>;
  reason?: string;
}

export type RunGraphRunStatus = 'running' | 'completed' | 'stopped';

export interface RunGraphRunState {
  graphId: string;
  graphName: string;
  projectPath: string;
  startedAt: number;
  finishedAt: number | null;
  status: RunGraphRunStatus;
  instances: Record<string, RunInstanceRuntime>;
  worktrees: Record<string, RunWorktreeRuntime>;
  forms: Record<string, RunFormRuntime>;
}

export interface RunGraphDispatchParams {
  sessionId: string;
  directory: string;
  content: string;
  providerID: string;
  modelID: string;
  variant?: string;
  agent?: string;
}

export interface RunGraphExecutorDeps {
  now: () => number;
  armedTimeoutMs?: number;
  projectPath: string;
  createSessionInDirectory: (title: string, directory: string) => Promise<Session>;
  registerSession: (session: Session, directory: string) => void;
  recordSessionLink: (sessionId: string, link: MultiRunSessionLink) => void;
  dispatchPrompt: (params: RunGraphDispatchParams) => Promise<void>;
  abortSessionInDirectory: (sessionId: string, directory: string) => Promise<void>;
  getSessionOutput: (sessionId: string, directory: string) => Promise<string>;
  resolveExistingWorktree: (worktree: RunGraphWorktree) => Promise<string>;
  createPoolWorktree: (worktree: RunGraphWorktree, baseBranch?: string) => Promise<string>;
  createDedicatedWorktree: (spec: { preferredName: string; baseBranch?: string }) => Promise<string>;
  subscribeToSessionStatus: (listener: () => void) => () => void;
  isSessionActive: (sessionId: string) => boolean;
  /** Resolves with the submitted field values, or null when the user cancelled the form. */
  requestFormValues: (request: RunGraphFormRequest) => Promise<Record<string, string> | null>;
  publish: (state: RunGraphRunState) => void;
}

export class RunGraphExecutor {
  private readonly graph: RunGraphDefinition;
  private readonly deps: RunGraphExecutorDeps;
  private state: RunGraphRunState;
  private stopped = false;
  private unsubscribeStatus: (() => void) | null = null;
  private readonly finishing = new Set<string>();
  private readonly seenActive = new Set<string>();
  private readonly armedTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly nodesById: Map<string, RunGraphNode>;
  private readonly incomingByTarget: Map<string, RunGraphEdge[]>;
  private readonly outgoingBySource: Map<string, RunGraphEdge[]>;

  constructor(graph: RunGraphDefinition, deps: RunGraphExecutorDeps) {
    this.graph = graph;
    this.deps = deps;
    this.nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

    this.incomingByTarget = new Map();
    this.outgoingBySource = new Map();
    for (const edge of graph.edges) {
      const incoming = this.incomingByTarget.get(edge.target);
      if (incoming) {
        incoming.push(edge);
      } else {
        this.incomingByTarget.set(edge.target, [edge]);
      }
      const outgoing = this.outgoingBySource.get(edge.source);
      if (outgoing) {
        outgoing.push(edge);
      } else {
        this.outgoingBySource.set(edge.source, [edge]);
      }
    }

    const instances: Record<string, RunInstanceRuntime> = {};
    for (const node of graph.nodes) {
      if (node.kind !== 'run') continue;
      for (const instance of node.instances) {
        instances[instance.id] = { phase: 'pending' };
      }
    }
    const worktrees: Record<string, RunWorktreeRuntime> = {};
    for (const worktree of graph.worktrees) {
      worktrees[worktree.id] = { phase: 'pending' };
    }

    this.state = {
      graphId: graph.id,
      graphName: graph.name,
      projectPath: deps.projectPath,
      startedAt: deps.now(),
      finishedAt: null,
      status: 'running',
      instances,
      worktrees,
      forms: {},
    };
  }

  getState(): RunGraphRunState {
    return this.state;
  }

  start(): void {
    this.unsubscribeStatus = this.deps.subscribeToSessionStatus(() => this.handleStatusIndexChange());
    this.deps.publish(this.snapshot());
    void this.materializeWorktrees();
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    for (const timer of this.armedTimers.values()) globalThis.clearTimeout(timer);
    this.armedTimers.clear();

    const aborts: Promise<void>[] = [];
    for (const [instanceId, runtime] of Object.entries(this.state.instances)) {
      if (runtime.phase === 'running' && runtime.sessionId && runtime.directory) {
        aborts.push(
          this.deps.abortSessionInDirectory(runtime.sessionId, runtime.directory).catch(() => undefined),
        );
        this.patchInstance(instanceId, {
          phase: 'skipped',
          sessionId: runtime.sessionId,
          directory: runtime.directory,
        });
      } else if (runtime.phase === 'starting' || runtime.phase === 'pending') {
        this.patchInstance(instanceId, { phase: 'skipped' });
      }
    }
    await Promise.allSettled(aborts);

    for (const [formId, runtime] of Object.entries(this.state.forms)) {
      if (runtime.phase === 'waiting-input') {
        this.patchForm(formId, { phase: 'skipped' });
      }
    }

    this.patch({ status: 'stopped', finishedAt: this.deps.now() });
    this.unsubscribeStatus?.();
    this.unsubscribeStatus = null;
  }

  private snapshot(): RunGraphRunState {
    return {
      ...this.state,
      instances: { ...this.state.instances },
      worktrees: { ...this.state.worktrees },
      forms: { ...this.state.forms },
    };
  }

  private patch(partial: Partial<RunGraphRunState>): void {
    this.state = { ...this.state, ...partial };
    this.deps.publish(this.snapshot());
  }

  private patchInstance(instanceId: string, runtime: RunInstanceRuntime): void {
    this.patch({ instances: { ...this.state.instances, [instanceId]: runtime } });
  }

  private patchWorktree(worktreeId: string, runtime: RunWorktreeRuntime): void {
    this.patch({ worktrees: { ...this.state.worktrees, [worktreeId]: runtime } });
  }

  private patchForm(formId: string, runtime: RunFormRuntime): void {
    this.patch({ forms: { ...this.state.forms, [formId]: runtime } });
  }

  private async materializeWorktrees(): Promise<void> {
    await Promise.allSettled(
      this.graph.worktrees.map(async (worktree) => {
        this.patchWorktree(worktree.id, { phase: 'resolving' });
        try {
          const path = worktree.kind === 'existing'
            ? await this.deps.resolveExistingWorktree(worktree)
            : await this.deps.createPoolWorktree(worktree, worktree.baseBranch ?? this.graph.baseBranch);
          if (this.stopped) return;
          this.patchWorktree(worktree.id, { phase: 'ready', path });
        } catch (error) {
          this.patchWorktree(worktree.id, {
            phase: 'failed',
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );
    this.enqueueReadyInstances();
    this.requestNeededForms();
    this.checkSettled();
  }

  private isBlockedByFailure(nodeId: string): boolean {
    return (this.incomingByTarget.get(nodeId) ?? []).some((edge) => {
      if (edge.sourceFieldId) {
        return this.state.forms[edge.source]?.phase === 'failed';
      }
      const runtime = this.state.instances[edge.sourceInstanceId ?? ''];
      return runtime !== undefined && (runtime.phase === 'failed' || runtime.phase === 'blocked');
    });
  }

  private isEdgeSatisfied(edge: RunGraphEdge): boolean {
    if (edge.sourceFieldId) {
      return this.state.forms[edge.source]?.phase === 'submitted';
    }
    return this.state.instances[edge.sourceInstanceId ?? '']?.phase === 'done';
  }

  private allInputsDone(nodeId: string): boolean {
    return (this.incomingByTarget.get(nodeId) ?? []).every((edge) => this.isEdgeSatisfied(edge));
  }

  private enqueueReadyInstances(): void {
    for (const node of this.graph.nodes) {
      if (node.kind !== 'run') continue;
      for (const instance of node.instances) {
        const runtime = this.state.instances[instance.id];
        if (!runtime || runtime.phase !== 'pending') continue;

        if (this.isBlockedByFailure(node.id)) {
          this.patchInstance(instance.id, { phase: 'blocked' });
          continue;
        }
        if (!this.allInputsDone(node.id)) continue;

        const placement = resolveInstancePlacement(instance, node.id, this.graph.nodeWorktreeBindings);
        if (placement.mode === 'pool') {
          const worktree = this.state.worktrees[placement.worktreeId];
          if (!worktree || worktree.phase === 'pending' || worktree.phase === 'resolving') continue;
          if (worktree.phase === 'failed') {
            this.patchInstance(instance.id, { phase: 'failed', reason: 'Worktree is unavailable' });
            continue;
          }
        }

        void this.launchInstance(node, instance, placement);
      }
    }
  }

  private buildDefaults(node: RunGraphFormNode): RunGraphFormRequest['defaults'] {
    const defaults: RunGraphFormRequest['defaults'] = {};
    for (const edge of this.incomingByTarget.get(node.id) ?? []) {
      if (!edge.targetFieldId) continue;
      if (edge.sourceInstanceId) {
        defaults[edge.targetFieldId] = this.state.instances[edge.sourceInstanceId]?.output ?? '';
      } else if (edge.sourceFieldId) {
        defaults[edge.targetFieldId] = this.state.forms[edge.source]?.values?.[edge.sourceFieldId] ?? '';
      }
    }
    return defaults;
  }

  /**
   * Forms appear only once at least one consumer run is otherwise ready, so
   * users are asked for input exactly when the information is needed.
   */
  private requestNeededForms(): void {
    if (this.stopped || this.state.status !== 'running') return;
    for (const node of this.graph.nodes) {
      if (node.kind !== 'form') continue;
      if (this.state.forms[node.id]) continue;

      const outgoing = this.outgoingBySource.get(node.id) ?? [];
      if (outgoing.length === 0) continue;
      if (!(this.incomingByTarget.get(node.id) ?? []).every((edge) => this.isEdgeSatisfied(edge))) continue;

      const consumers = new Set(outgoing.map((edge) => edge.target));
      const runnableConsumerIds = [...consumers].filter((consumerId) => {
        const consumer = this.nodesById.get(consumerId);
        if (!consumer || consumer.kind !== 'run') return false;
        return consumer.instances.some((instance) => {
          const runtime = this.state.instances[instance.id];
          return runtime !== undefined
            && (runtime.phase === 'pending' || runtime.phase === 'starting' || runtime.phase === 'running');
        });
      });
      if (runnableConsumerIds.length === 0) {
        this.patchForm(node.id, { phase: 'skipped' });
        continue;
      }

      const consumerNeedsFormNow = runnableConsumerIds.some((consumerId) =>
        (this.incomingByTarget.get(consumerId) ?? [])
          .filter((edge) => edge.source !== node.id)
          .every((edge) => this.isEdgeSatisfied(edge)),
      );
      if (!consumerNeedsFormNow) continue;

      this.patchForm(node.id, { phase: 'waiting-input', request: {
        nodeId: node.id,
        nodeTitle: node.title,
        fields: node.fields,
        defaults: this.buildDefaults(node),
      } });
      void this.requestFormInput(node);
    }
  }

  private async requestFormInput(node: RunGraphFormNode): Promise<void> {
    const request = this.state.forms[node.id]?.request;
    if (!request) return;
    try {
      const values = await this.deps.requestFormValues(request);
      if (this.stopped || this.state.status !== 'running') return;
      if (values === null) {
        this.patchForm(node.id, { phase: 'failed', reason: 'Form input was cancelled' });
      } else {
        this.patchForm(node.id, { phase: 'submitted', values });
      }
    } catch (error) {
      if (this.stopped || this.state.status !== 'running') return;
      this.patchForm(node.id, {
        phase: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    this.enqueueReadyInstances();
    this.requestNeededForms();
    this.checkSettled();
  }

  private edgeValue(edge: RunGraphEdge): string {
    if (edge.sourceFieldId) {
      return this.state.forms[edge.source]?.values?.[edge.sourceFieldId] ?? '';
    }
    return this.state.instances[edge.sourceInstanceId ?? '']?.output ?? '';
  }

  private buildInputValues(node: RunGraphRunNode): RunTemplateValues {
    const incoming = this.incomingByTarget.get(node.id) ?? [];
    const values: RunTemplateValues = {};
    for (const input of node.inputs) {
      values[input.name] = incoming
        .filter((edge) => edge.targetInputId === input.id)
        .map((edge) => this.edgeValue(edge));
    }
    return values;
  }

  private dedicatedWorktreeName(node: RunGraphRunNode, instance: RunModelInstance): string {
    const sameModel = node.instances.filter(
      (candidate) => candidate.providerID === instance.providerID && candidate.modelID === instance.modelID,
    );
    const modelSlug = toRunGraphModelSlug(instance.providerID, instance.modelID);
    const modelPart = sameModel.length > 1
      ? `${modelSlug}/${sameModel.indexOf(instance) + 1}`
      : modelSlug;
    return `${toRunGraphSlug(this.graph.name)}/${toRunGraphSlug(node.title)}/${modelPart}`;
  }

  private async launchInstance(
    node: RunGraphRunNode,
    instance: RunModelInstance,
    placement: RunInstancePlacement,
  ): Promise<void> {
    this.patchInstance(instance.id, { phase: 'starting' });
    try {
      const rendered = renderRunGraphTemplate(node.promptTemplate, this.buildInputValues(node));
      if (!rendered.ok) {
        throw new Error(rendered.errors[0]?.message ?? 'Invalid prompt template');
      }

      let directory = this.deps.projectPath;
      if (placement.mode === 'pool') {
        const worktree = this.state.worktrees[placement.worktreeId];
        if (!worktree || worktree.phase !== 'ready' || !worktree.path) {
          throw new Error('Worktree is unavailable');
        }
        directory = worktree.path;
      } else if (placement.mode === 'dedicated-new') {
        directory = await this.deps.createDedicatedWorktree({
          preferredName: this.dedicatedWorktreeName(node, instance),
          baseBranch: this.graph.baseBranch,
        });
      }

      const session = await this.deps.createSessionInDirectory(
        `${this.graph.name} · ${node.title} · ${instance.providerID}/${instance.modelID}`,
        directory,
      );
      this.deps.registerSession(session, directory);
      this.deps.recordSessionLink(session.id, {
        graphId: this.graph.id,
        graphName: this.graph.name,
        nodeId: node.id,
        nodeTitle: node.title,
        directory,
        at: this.deps.now(),
      });
      if (this.stopped) {
        this.patchInstance(instance.id, { phase: 'skipped', sessionId: session.id, directory });
        return;
      }

      this.patchInstance(instance.id, { phase: 'running', sessionId: session.id, directory });
      const armedTimeoutMs = this.deps.armedTimeoutMs ?? 20000;
      this.armedTimers.set(
        instance.id,
        globalThis.setTimeout(() => this.checkArmedTimeout(instance.id), armedTimeoutMs),
      );
      await this.deps.dispatchPrompt({
        sessionId: session.id,
        directory,
        content: rendered.text,
        providerID: instance.providerID,
        modelID: instance.modelID,
        variant: instance.variant,
        agent: node.agent,
      });
    } catch (error) {
      if (this.stopped) {
        this.patchInstance(instance.id, { phase: 'skipped' });
        return;
      }
      this.patchInstance(instance.id, {
        phase: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      });
      this.enqueueReadyInstances();
      this.requestNeededForms();
      this.checkSettled();
    }
  }

  private handleStatusIndexChange(): void {
    for (const node of this.graph.nodes) {
      if (node.kind !== 'run') continue;
      for (const instance of node.instances) {
        const runtime = this.state.instances[instance.id];
        if (!runtime || runtime.phase !== 'running' || !runtime.sessionId) continue;
        if (this.deps.isSessionActive(runtime.sessionId)) {
          this.seenActive.add(instance.id);
          continue;
        }
        if (!this.seenActive.has(instance.id)) continue;
        void this.finishInstance(instance.id, runtime.sessionId, runtime.directory ?? this.deps.projectPath);
      }
    }
  }

  private clearArmedTimer(instanceId: string): void {
    const timer = this.armedTimers.get(instanceId);
    if (timer !== undefined) {
      globalThis.clearTimeout(timer);
      this.armedTimers.delete(instanceId);
    }
  }

  private checkArmedTimeout(instanceId: string): void {
    this.armedTimers.delete(instanceId);
    const runtime = this.state.instances[instanceId];
    if (this.stopped || !runtime || runtime.phase !== 'running') return;
    if (this.seenActive.has(instanceId)) return;
    if (runtime.sessionId) {
      void this.finishInstance(instanceId, runtime.sessionId, runtime.directory ?? this.deps.projectPath);
    }
  }

  private async finishInstance(instanceId: string, sessionId: string, directory: string): Promise<void> {
    if (this.finishing.has(instanceId)) return;
    this.finishing.add(instanceId);
    this.clearArmedTimer(instanceId);
    try {
      const output = await this.deps.getSessionOutput(sessionId, directory);
      if (output.trim().length === 0) {
        this.patchInstance(instanceId, {
          phase: 'failed',
          sessionId,
          directory,
          reason: 'Finished without an assistant response',
        });
      } else {
        this.patchInstance(instanceId, { phase: 'done', sessionId, directory, output });
      }
    } catch (error) {
      this.patchInstance(instanceId, {
        phase: 'failed',
        sessionId,
        directory,
        reason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.finishing.delete(instanceId);
    }
    this.enqueueReadyInstances();
    this.requestNeededForms();
    this.checkSettled();
  }

  private checkSettled(): void {
    if (this.stopped || this.state.status !== 'running') return;
    const settled = Object.values(this.state.instances).every(
      (runtime) => runtime.phase !== 'pending' && runtime.phase !== 'starting' && runtime.phase !== 'running',
    );
    if (!settled) return;
    this.patch({ status: 'completed', finishedAt: this.deps.now() });
    this.unsubscribeStatus?.();
    this.unsubscribeStatus = null;
  }
}
