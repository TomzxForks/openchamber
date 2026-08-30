import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Session } from '@opencode-ai/sdk/v2';
import { opencodeClient } from '@/lib/opencode/client';
import { resolveActiveProjectRef } from '@/lib/activeProject';
import { getLastAssistantText } from '@/lib/multirun/sessionOutput';
import { getMultiRunGraphs, getMultiRunSessionIndex, saveMultiRunGraphs, saveMultiRunSessionIndex } from '@/lib/openchamberConfig';
import type { ProjectRef } from '@/lib/worktrees/worktreeManager';
import { createWorktreeWithDefaults, resolveRootTrackingRemote } from '@/lib/worktrees/worktreeCreate';
import { waitForWorktreeBootstrap } from '@/lib/worktrees/worktreeBootstrap';
import { getWorktreeSetupWaitEnabled } from '@/lib/openchamberConfig';
import { listProjectWorktrees } from '@/lib/worktrees/worktreeManager';
import { checkIsGitRepository } from '@/lib/gitApi';
import { routeMessage } from '@/sync/session-ui-store';
import { useGlobalSessionStatusStore } from '@/sync/global-session-status';
import { registerCreatedSession } from './useMultiRunStore';
import { useSnippetsStore } from './useSnippetsStore';
import type {
  MultiRunSessionLink,
  RunGraphDefinition,
  RunGraphEdgeSource,
  RunGraphFormField,
  RunGraphNodeInput,
  RunGraphWorktree,
  RunModelInstance,
} from '@/types/runGraph';
import {
  createEmptyRunGraph,
  touchRunGraph,
  withEdge,
  withFormField,
  withInstance,
  withNode,
  withNodeBinding,
  withNodeInput,
  withUpdatedFormField,
  withUpdatedFormNode,
  withUpdatedInstance,
  withUpdatedNode,
  withUpdatedNodeInput,
  withUpdatedWorktree,
  withMovedNode,
  withWorktree,
  withoutEdge,
  withoutFormField,
  withoutInstance,
  withoutNode,
  withoutNodeInput,
  withoutWorktree,
} from '@/lib/runGraph/editorGraph';
import { createRunGraphEntityId } from '@/lib/runGraph/ids';
import { RunGraphExecutor, type RunGraphExecutorDeps, type RunGraphRunState } from '@/lib/runGraph/executor';
import { hasRunGraphErrors, validateRunGraph, type RunGraphValidationIssue } from '@/lib/runGraph/validate';

const normalizeWorktreePath = (value: string): string => {
  const replaced = value.replace(/\\/g, '/');
  return replaced.length > 1 ? replaced.replace(/\/+$/, '') : replaced;
};

const createGraphWorktree = async (
  project: ProjectRef,
  params: { preferredName: string; startRef: string; setupCommands: string[] },
): Promise<string> => {
  if (!(await checkIsGitRepository(project.path))) {
    throw new Error('The active project is not a git repository');
  }
  const rootTrackingRemote = await resolveRootTrackingRemote(project.path);
  const metadata = await createWorktreeWithDefaults(project, {
    preferredName: params.preferredName,
    mode: 'new',
    branchName: params.preferredName,
    worktreeName: params.preferredName,
    startRef: params.startRef,
    setupCommands: params.setupCommands,
    returnAfterDirectoryCreated: true,
  }, {
    resolvedRootTrackingRemote: rootTrackingRemote,
  });
  if (await getWorktreeSetupWaitEnabled(project)) {
    await waitForWorktreeBootstrap(metadata.path);
  }
  return metadata.path;
};

const buildExecutorDeps = (
  project: ProjectRef,
  publish: (state: RunGraphRunState) => void,
  recordSessionLink: (sessionId: string, link: MultiRunSessionLink) => void,
): RunGraphExecutorDeps => ({
  now: () => Date.now(),
  projectPath: project.path,
  createSessionInDirectory: (title, directory) =>
    opencodeClient.withDirectory(directory, () => opencodeClient.createSession({ title })),
  registerSession: (session: Session, directory: string) => {
    registerCreatedSession(session, directory);
  },
  recordSessionLink,
  requestFormValues: (request) =>
    new Promise((resolve) => {
      formResolvers.set(request.nodeId, resolve);
    }),
  dispatchPrompt: async (params) => {
    const text = await useSnippetsStore.getState().expandText(params.content).catch(() => params.content);
    await routeMessage({
      sessionId: params.sessionId,
      directory: params.directory,
      content: text,
      providerID: params.providerID,
      modelID: params.modelID,
      variant: params.variant,
      agent: params.agent,
    });
  },
  abortSessionInDirectory: async (sessionId, directory) => {
    await opencodeClient.withDirectory(directory, () => opencodeClient.abortSession(sessionId));
  },
  getSessionOutput: (sessionId, directory) => getLastAssistantText(sessionId, directory),
  resolveExistingWorktree: async (worktree: RunGraphWorktree) => {
    const list = await listProjectWorktrees(project);
    const target = normalizeWorktreePath(worktree.path ?? '');
    const match = list.find((entry) => normalizeWorktreePath(entry.path) === target);
    if (!match) {
      throw new Error(`Worktree not found: ${worktree.path}`);
    }
    return match.path;
  },
  createPoolWorktree: async (worktree: RunGraphWorktree, baseBranch?: string) => {
    const name = (worktree.name ?? '').trim();
    if (name) {
      const list = await listProjectWorktrees(project);
      const existing = list.find(
        (entry) => entry.name === name || entry.branch === name || normalizeWorktreePath(entry.path).endsWith(`/${name}`),
      );
      if (existing) return existing.path;
    }
    return createGraphWorktree(project, {
      preferredName: name || createRunGraphEntityId('wt'),
      startRef: worktree.baseBranch ?? baseBranch ?? 'HEAD',
      setupCommands: worktree.setupCommands ?? [],
    });
  },
  createDedicatedWorktree: async ({ preferredName, baseBranch }) => {
    const project = resolveActiveProjectRef();
    if (!project) throw new Error('No active project');
    return createGraphWorktree(project, {
      preferredName,
      startRef: baseBranch ?? 'HEAD',
      setupCommands: [],
    });
  },
  subscribeToSessionStatus: (listener) => useGlobalSessionStatusStore.subscribe(listener),
  isSessionActive: (sessionId) => useGlobalSessionStatusStore.getState().statusById.has(sessionId),
  publish,
});

interface RunGraphState {
  graphs: RunGraphDefinition[];
  sessionIndex: Record<string, MultiRunSessionLink>;
  isLoading: boolean;
  error: string | null;
  selectedGraphId: string | null;
  draft: RunGraphDefinition | null;
  isSaving: boolean;
  activeRun: RunGraphRunState | null;
}

interface RunGraphActions {
  loadGraphs: () => Promise<void>;
  recordSessionLink: (sessionId: string, link: MultiRunSessionLink) => void;
  createDraft: (name?: string) => void;
  selectGraph: (graphId: string) => void;
  closeDraft: () => void;
  renameDraft: (name: string) => void;
  setDraftBaseBranch: (branch: string) => void;
  addDraftNode: (node: RunGraphDefinition['nodes'][number]) => void;
  updateDraftNode: (nodeId: string, patch: Partial<Extract<RunGraphDefinition['nodes'][number], { kind: 'run' }>>) => void;
  updateDraftFormNode: (nodeId: string, patch: Partial<Pick<Extract<RunGraphDefinition['nodes'][number], { kind: 'form' }>, 'title'>>) => void;
  moveDraftNode: (nodeId: string, position: { x: number; y: number }) => void;
  removeDraftNode: (nodeId: string) => void;
  addDraftFormField: (nodeId: string, field: RunGraphFormField) => void;
  updateDraftFormField: (nodeId: string, fieldId: string, patch: Partial<RunGraphFormField>) => void;
  removeDraftFormField: (nodeId: string, fieldId: string) => void;
  setDraftNodeBinding: (nodeId: string, worktreeId: string | null) => void;
  addDraftWorktree: (worktree: RunGraphWorktree) => void;
  updateDraftWorktree: (worktreeId: string, patch: Partial<RunGraphWorktree>) => void;
  removeDraftWorktree: (worktreeId: string) => void;
  addDraftInstance: (nodeId: string, instance: RunModelInstance) => void;
  updateDraftInstance: (nodeId: string, instanceId: string, patch: Partial<RunModelInstance>) => void;
  removeDraftInstance: (nodeId: string, instanceId: string) => void;
  addDraftNodeInput: (nodeId: string, input: RunGraphNodeInput) => void;
  updateDraftNodeInput: (nodeId: string, inputId: string, patch: Partial<Pick<RunGraphNodeInput, 'name'>>) => void;
  removeDraftNodeInput: (nodeId: string, inputId: string) => void;
  connectDraftNodes: (
    source: string,
    sourcePort: RunGraphEdgeSource,
    target: string,
    targetPort: { kind: 'input'; inputId: string } | { kind: 'field'; fieldId: string },
  ) => void;
  disconnectDraftEdge: (edgeId: string) => void;
  saveDraft: () => Promise<boolean>;
  deleteGraph: (graphId: string) => Promise<void>;
  runDraft: () => Promise<{ ok: boolean; issues: RunGraphValidationIssue[] }>;
  stopRun: () => Promise<void>;
  submitRunForm: (nodeId: string, values: Record<string, string>) => void;
  cancelRunForm: (nodeId: string) => void;
  clearError: () => void;
}

type RunGraphStore = RunGraphState & RunGraphActions;

let activeExecutor: RunGraphExecutor | null = null;
let sessionIndexWrite: Promise<void> = Promise.resolve();
const formResolvers = new Map<string, (values: Record<string, string> | null) => void>();

const cancelPendingFormRequests = (): void => {
  const resolvers = [...formResolvers.values()];
  formResolvers.clear();
  for (const resolve of resolvers) resolve(null);
};

const resolveFormRequest = (nodeId: string, values: Record<string, string> | null): void => {
  const resolve = formResolvers.get(nodeId);
  if (!resolve) return;
  formResolvers.delete(nodeId);
  resolve(values);
};

const cloneDraft = (graph: RunGraphDefinition): RunGraphDefinition => structuredClone(graph);

export const useRunGraphStore = create<RunGraphStore>()(
  devtools(
    (set, get) => {
      const mutateDraft = (mutate: (draft: RunGraphDefinition) => RunGraphDefinition): void => {
        const draft = get().draft;
        if (!draft) return;
        set({ draft: touchRunGraph(mutate(draft), Date.now()) });
      };

      const requireProject = (): ProjectRef | null => {
        const project = resolveActiveProjectRef();
        if (!project) {
          set({ error: 'Select a project first' });
        }
        return project;
      };

      return {
        graphs: [],
        sessionIndex: {},
        isLoading: false,
        error: null,
        selectedGraphId: null,
        draft: null,
        isSaving: false,
        activeRun: null,

        loadGraphs: async () => {
          const project = resolveActiveProjectRef();
          if (!project) {
            set({ error: 'Select a project first', isLoading: false });
            return;
          }
          set({ isLoading: true, error: null });
          try {
            const graphs = await getMultiRunGraphs(project);
            const sessionIndex = await getMultiRunSessionIndex(project);
            set({ graphs, sessionIndex, isLoading: false });
          } catch (error) {
            set({
              error: error instanceof Error ? error.message : 'Failed to load graphs',
              isLoading: false,
            });
          }
        },

        recordSessionLink: (sessionId, link) => {
          set((state) => ({ sessionIndex: { ...state.sessionIndex, [sessionId]: link } }));
          const project = resolveActiveProjectRef();
          if (!project) return;
          sessionIndexWrite = sessionIndexWrite
            .then(async () => {
              await saveMultiRunSessionIndex(project, get().sessionIndex);
            })
            .catch(() => undefined);
        },

        createDraft: (name) => {
          const now = Date.now();
          const draft = createEmptyRunGraph(name?.trim() || 'Untitled graph', now);
          set({ draft, selectedGraphId: draft.id });
        },

        selectGraph: (graphId) => {
          const graph = get().graphs.find((entry) => entry.id === graphId);
          if (!graph) return;
          set({ draft: cloneDraft(graph), selectedGraphId: graphId });
        },

        closeDraft: () => {
          set({ draft: null, selectedGraphId: null });
        },

        renameDraft: (name) => mutateDraft((draft) => ({ ...draft, name })),
        setDraftBaseBranch: (branch) => mutateDraft((draft) => ({ ...draft, baseBranch: branch.trim() || undefined })),

        addDraftNode: (node) => mutateDraft((draft) => withNode(draft, node)),
        updateDraftNode: (nodeId, patch) => mutateDraft((draft) => withUpdatedNode(draft, nodeId, patch)),
        updateDraftFormNode: (nodeId, patch) => mutateDraft((draft) => withUpdatedFormNode(draft, nodeId, patch)),
        moveDraftNode: (nodeId, position) => mutateDraft((draft) => withMovedNode(draft, nodeId, position)),
        removeDraftNode: (nodeId) => mutateDraft((draft) => withoutNode(draft, nodeId)),
        addDraftFormField: (nodeId, field) => mutateDraft((draft) => withFormField(draft, nodeId, field)),
        updateDraftFormField: (nodeId, fieldId, patch) =>
          mutateDraft((draft) => withUpdatedFormField(draft, nodeId, fieldId, patch)),
        removeDraftFormField: (nodeId, fieldId) => mutateDraft((draft) => withoutFormField(draft, nodeId, fieldId)),
        setDraftNodeBinding: (nodeId, worktreeId) => mutateDraft((draft) => withNodeBinding(draft, nodeId, worktreeId)),

        addDraftWorktree: (worktree) => mutateDraft((draft) => withWorktree(draft, worktree)),
        updateDraftWorktree: (worktreeId, patch) => mutateDraft((draft) => withUpdatedWorktree(draft, worktreeId, patch)),
        removeDraftWorktree: (worktreeId) => mutateDraft((draft) => withoutWorktree(draft, worktreeId)),

        addDraftInstance: (nodeId, instance) => mutateDraft((draft) => withInstance(draft, nodeId, instance)),
        updateDraftInstance: (nodeId, instanceId, patch) =>
          mutateDraft((draft) => withUpdatedInstance(draft, nodeId, instanceId, patch)),
        removeDraftInstance: (nodeId, instanceId) => mutateDraft((draft) => withoutInstance(draft, nodeId, instanceId)),

        addDraftNodeInput: (nodeId, input) => mutateDraft((draft) => withNodeInput(draft, nodeId, input)),
        updateDraftNodeInput: (nodeId, inputId, patch) =>
          mutateDraft((draft) => withUpdatedNodeInput(draft, nodeId, inputId, patch)),
        removeDraftNodeInput: (nodeId, inputId) => mutateDraft((draft) => withoutNodeInput(draft, nodeId, inputId)),

        connectDraftNodes: (source, sourcePort, target, targetPort) =>
          mutateDraft((draft) => withEdge(draft, {
            source,
            sourceInstanceId: sourcePort.kind === 'instance' ? sourcePort.instanceId : undefined,
            sourceFieldId: sourcePort.kind === 'field' ? sourcePort.fieldId : undefined,
            target,
            targetInputId: targetPort.kind === 'input' ? targetPort.inputId : undefined,
            targetFieldId: targetPort.kind === 'field' ? targetPort.fieldId : undefined,
          })),
        disconnectDraftEdge: (edgeId) => mutateDraft((draft) => withoutEdge(draft, edgeId)),

        saveDraft: async () => {
          const project = requireProject();
          const draft = get().draft;
          if (!project || !draft) return false;
          set({ isSaving: true, error: null });
          try {
            const persisted = touchRunGraph(draft, Date.now());
            const others = get().graphs.filter((entry) => entry.id !== persisted.id);
            const graphs = [persisted, ...others];
            const ok = await saveMultiRunGraphs(project, graphs);
            if (!ok) {
              set({ error: 'Failed to save graph', isSaving: false });
              return false;
            }
            set({ graphs, draft: persisted, isSaving: false });
            return true;
          } catch (error) {
            set({
              error: error instanceof Error ? error.message : 'Failed to save graph',
              isSaving: false,
            });
            return false;
          }
        },

        deleteGraph: async (graphId) => {
          const project = requireProject();
          if (!project) return;
          const graphs = get().graphs.filter((entry) => entry.id !== graphId);
          const ok = await saveMultiRunGraphs(project, graphs);
          if (!ok) {
            set({ error: 'Failed to delete graph' });
            return;
          }
          set((state) => ({
            graphs,
            draft: state.draft?.id === graphId ? null : state.draft,
            selectedGraphId: state.selectedGraphId === graphId ? null : state.selectedGraphId,
          }));
        },

        runDraft: async () => {
          const draft = get().draft;
          if (!draft) {
            return { ok: false, issues: [] };
          }
          const issues = validateRunGraph(draft);
          if (hasRunGraphErrors(issues)) {
            return { ok: false, issues };
          }
          const project = requireProject();
          if (!project) {
            return { ok: false, issues };
          }
          if (get().activeRun?.status === 'running') {
            set({ error: 'A graph run is already active' });
            return { ok: false, issues };
          }
          cancelPendingFormRequests();

          const executor = new RunGraphExecutor(
            cloneDraft(draft),
            buildExecutorDeps(
              project,
              (state) => {
                if (state.status !== 'running') {
                  cancelPendingFormRequests();
                }
                set({ activeRun: state });
              },
              (sessionId, link) => get().recordSessionLink(sessionId, link),
            ),
          );
          activeExecutor = executor;
          executor.start();
          return { ok: true, issues };
        },

        stopRun: async () => {
          const executor = activeExecutor;
          if (!executor) return;
          cancelPendingFormRequests();
          await executor.stop();
          activeExecutor = null;
        },

        submitRunForm: (nodeId, values) => {
          resolveFormRequest(nodeId, values);
        },

        cancelRunForm: (nodeId) => {
          resolveFormRequest(nodeId, null);
        },

        clearError: () => set({ error: null }),
      };
    },
    { name: 'run-graph-store' },
  ),
);
