import React from 'react';
import { Icon } from '@/components/icon/Icon';
import { useI18n, type I18nKey, type I18nParams } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AgentSelector } from '@/components/multirun/AgentSelector';
import { ModelMultiSelect, type ModelSelectionWithId } from '@/components/multirun/ModelMultiSelect';
import type {
  RunGraphDefinition,
  RunGraphFormField,
  RunGraphFormFieldType,
  RunGraphFormNode,
  RunGraphRunNode,
  RunGraphWorktree,
  RunInstanceWorktree,
  RunModelInstance,
} from '@/types/runGraph';
import { MAX_INSTANCES_PER_NODE, RUN_GRAPH_FORM_FIELD_TYPES } from '@/types/runGraph';
import { createRunGraphFormField, createRunGraphNodeInput, listNodeSessions } from '@/lib/runGraph/editorGraph';
import type { RunGraphIssueCode, RunGraphValidationIssue } from '@/lib/runGraph/validate';
import { useRunGraphStore } from '@/stores/useRunGraphStore';

const issueKeyByCode = {
  'empty-graph': 'rungraph.issue.emptyGraph',
  'duplicate-title': 'rungraph.issue.duplicateTitle',
  'node-missing-instances': 'rungraph.issue.nodeMissingInstances',
  'node-too-many-instances': 'rungraph.issue.nodeTooManyInstances',
  'instance-missing-model': 'rungraph.issue.instanceMissingModel',
  'edge-dangling-node': 'rungraph.issue.edgeDanglingNode',
  'edge-dangling-instance': 'rungraph.issue.edgeDanglingInstance',
  'edge-duplicate': 'rungraph.issue.edgeDuplicate',
  'edge-self': 'rungraph.issue.edgeSelf',
  'edge-cycle': 'rungraph.issue.edgeCycle',
  'edge-source-port-invalid': 'rungraph.issue.edgeSourcePortInvalid',
  'edge-input-target-invalid': 'rungraph.issue.edgeInputTargetInvalid',
  'edge-form-target-invalid': 'rungraph.issue.edgeFormTargetInvalid',
  'input-missing-name': 'rungraph.issue.inputMissingName',
  'input-duplicate-name': 'rungraph.issue.inputDuplicateName',
  'input-invalid-name': 'rungraph.issue.inputInvalidName',
  'form-missing-fields': 'rungraph.issue.formMissingFields',
  'form-field-missing-title': 'rungraph.issue.formFieldMissingTitle',
  'form-field-duplicate-title': 'rungraph.issue.formFieldDuplicateTitle',
  'form-field-select-options': 'rungraph.issue.formFieldSelectOptions',
  'form-field-slider-bounds': 'rungraph.issue.formFieldSliderBounds',
  'form-field-range': 'rungraph.issue.formFieldRange',
  'form-unused': 'rungraph.issue.formUnused',
  'template-syntax': 'rungraph.issue.templateSyntax',
  'template-no-inputs': 'rungraph.issue.templateNoInputs',
  'template-input-range': 'rungraph.issue.templateInputRange',
  'template-unknown-input': 'rungraph.issue.templateUnknownInput',
  'binding-dangling': 'rungraph.issue.bindingDangling',
  'worktree-missing-path': 'rungraph.issue.worktreeMissingPath',
  'worktree-missing-name': 'rungraph.issue.worktreeMissingName',
  'worktree-duplicate-title': 'rungraph.issue.worktreeDuplicateTitle',
  'instance-pool-dangling': 'rungraph.issue.instancePoolDangling',
  'shared-worktree': 'rungraph.issue.sharedWorktree',
  'worktree-orphan': 'rungraph.issue.worktreeOrphan',
} satisfies Record<RunGraphIssueCode, I18nKey>;

interface ValidationListProps {
  issues: RunGraphValidationIssue[];
  draft: RunGraphDefinition;
}

const ValidationList: React.FC<ValidationListProps> = ({ issues, draft }) => {
  const { t } = useI18n();

  if (issues.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-status-success">{t('rungraph.toolbar.validationOk')}</div>
    );
  }

  return (
    <ul className="flex flex-col gap-1 px-3 py-2">
      {issues.map((issue, index) => {
        const key = issueKeyByCode[issue.code];
        let title: string | undefined;
        if (issue.worktreeId) {
          title = draft.worktrees.find((entry) => entry.id === issue.worktreeId)?.title;
        }
        if (!title && issue.nodeId) {
          title = draft.nodes.find((entry) => entry.id === issue.nodeId)?.title;
        }
        if (!title && issue.instanceId) {
          title = draft.nodes.find(
            (node) => node.kind === 'run' && node.instances.some((instance) => instance.id === issue.instanceId),
          )?.title;
        }
        const params: I18nParams = {};
        if (title !== undefined) params.title = title;
        if (issue.count !== undefined) params.count = issue.count;
        if (issue.fieldTitle !== undefined) params.field = issue.fieldTitle;
        if (issue.inputName !== undefined) params.name = issue.inputName;
        const text = key ? t(key, params) : issue.message;
        return (
          <li key={`${issue.code}-${index}`} className="flex items-start gap-1.5 text-xs leading-snug">
            <span
              className={cn(
                'mt-1 size-1.5 shrink-0 rounded-full',
                issue.severity === 'error' ? 'bg-status-error' : 'bg-status-warning',
              )}
            />
            <span className={issue.severity === 'error' ? 'text-foreground' : 'text-muted-foreground'}>{text}</span>
          </li>
        );
      })}
    </ul>
  );
};

const instanceWorktreeValue = (instance: RunModelInstance): string => {
  const override = instance.worktree;
  if (!override) return 'inherit';
  if (override.mode === 'root') return 'root';
  if (override.mode === 'dedicated-new') return 'dedicated-new';
  if (override.mode === 'pool') return `pool:${override.worktreeId}`;
  return 'inherit';
};

const applyInstanceWorktreeValue = (value: string): RunInstanceWorktree | undefined => {
  if (value === 'inherit' || value === '') return undefined;
  if (value === 'root') return { mode: 'root' };
  if (value === 'dedicated-new') return { mode: 'dedicated-new' };
  if (value.startsWith('pool:')) return { mode: 'pool', worktreeId: value.slice('pool:'.length) };
  return undefined;
};

interface NodeEditorProps {
  node: RunGraphRunNode;
  draft: RunGraphDefinition;
  onOpenSession?: (sessionId: string) => void;
}

const NodeEditor: React.FC<NodeEditorProps> = ({ node, draft, onOpenSession }) => {
  const { t } = useI18n();
  const updateDraftNode = useRunGraphStore((state) => state.updateDraftNode);
  const removeDraftNode = useRunGraphStore((state) => state.removeDraftNode);
  const addDraftInstance = useRunGraphStore((state) => state.addDraftInstance);
  const updateDraftInstance = useRunGraphStore((state) => state.updateDraftInstance);
  const removeDraftInstance = useRunGraphStore((state) => state.removeDraftInstance);
  const addDraftNodeInput = useRunGraphStore((state) => state.addDraftNodeInput);
  const updateDraftNodeInput = useRunGraphStore((state) => state.updateDraftNodeInput);
  const removeDraftNodeInput = useRunGraphStore((state) => state.removeDraftNodeInput);
  const setDraftNodeBinding = useRunGraphStore((state) => state.setDraftNodeBinding);
  const disconnectDraftEdge = useRunGraphStore((state) => state.disconnectDraftEdge);
  const activeRun = useRunGraphStore((state) => state.activeRun);
  const sessionIndex = useRunGraphStore((state) => state.sessionIndex);
  const nodeSessions = listNodeSessions(sessionIndex, node.id);

  const selections: ModelSelectionWithId[] = node.instances.map((instance) => ({
    providerID: instance.providerID,
    modelID: instance.modelID,
    displayName: instance.displayName,
    variant: instance.variant,
    instanceId: instance.id,
  }));

  const incomingEdges = draft.edges.filter((edge) => edge.target === node.id && !edge.targetFieldId);

  const promptRef = React.useRef<HTMLTextAreaElement | null>(null);

  const insertTemplateVariable = (name: string): void => {
    const insertion = `{{${name}}}`;
    const next = `${node.promptTemplate}${node.promptTemplate.length > 0 && !node.promptTemplate.endsWith('\n') ? '\n' : ''}${insertion}`;
    updateDraftNode(node.id, { promptTemplate: next });
    requestAnimationFrame(() => {
      const element = promptRef.current;
      if (element) {
        element.focus();
        element.setSelectionRange(next.length, next.length);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="rungraph-node-title">
          {t('rungraph.editor.nodeTitle')}
        </label>
        <Input
          id="rungraph-node-title"
          value={node.title}
          onChange={(event) => updateDraftNode(node.id, { title: event.target.value })}
          className="h-8"
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{t('rungraph.editor.nodeInputs')}</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => addDraftNodeInput(node.id, createRunGraphNodeInput(''))}
          >
            {t('rungraph.editor.addInput')}
          </Button>
        </div>
        {node.inputs.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {node.inputs.map((input) => (
              <div key={input.id} className="flex items-center gap-2">
                <Input
                  value={input.name}
                  onChange={(event) => updateDraftNodeInput(node.id, input.id, { name: event.target.value })}
                  placeholder={t('rungraph.editor.inputNamePlaceholder')}
                  aria-label={t('rungraph.editor.inputName')}
                  className="h-7 flex-1 font-mono"
                />
                <button
                  type="button"
                  className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={t('rungraph.editor.removeInput')}
                  onClick={() => removeDraftNodeInput(node.id, input.id)}
                >
                  <Icon name="close" className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t('rungraph.editor.noInputs')}</p>
        )}
      </div>

      <div>
        <span className="mb-1 block text-xs font-medium text-muted-foreground">{t('rungraph.editor.agent')}</span>
        <AgentSelector
          value={node.agent ?? ''}
          onChange={(agentName) => updateDraftNode(node.id, { agent: agentName || undefined })}
          portalToBody
        />
      </div>

      <div>
        <span className="mb-1 block text-xs font-medium text-muted-foreground">
          {t('rungraph.editor.models')} ({node.instances.length}/{MAX_INSTANCES_PER_NODE})
        </span>
        <ModelMultiSelect
          selectedModels={selections}
          onAdd={(model) =>
            addDraftInstance(node.id, {
              id: model.instanceId,
              providerID: model.providerID,
              modelID: model.modelID,
              displayName: model.displayName,
              variant: model.variant,
            })
          }
          onRemove={(index) => removeDraftInstance(node.id, node.instances[index].id)}
          maxModels={MAX_INSTANCES_PER_NODE}
          minModels={1}
          addButtonLabel={t('rungraph.editor.models')}
          dropdownSide="bottom"
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{t('rungraph.editor.prompt')}</span>
          <div className="flex flex-wrap items-center justify-end gap-1">
            {node.inputs.map((input) => (
              <button
                key={input.id}
                type="button"
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                title={t('rungraph.editor.insertVariable')}
                disabled={!input.name.trim()}
                onClick={() => insertTemplateVariable(input.name)}
              >
                {`{{${input.name}}}`}
              </button>
            ))}
          </div>
        </div>
        <textarea
          ref={promptRef}
          value={node.promptTemplate}
          onChange={(event) => updateDraftNode(node.id, { promptTemplate: event.target.value })}
          className="h-28 w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          placeholder={t('rungraph.editor.promptHint')}
        />
        <p className="mt-1 text-[10px] text-muted-foreground">{t('rungraph.editor.promptHint')}</p>
      </div>

      {incomingEdges.length > 0 && (
        <div>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t('rungraph.editor.inputs')}</span>
          <div className="flex flex-col gap-1">
            {incomingEdges.map((edge, index) => {
              const sourceNode = draft.nodes.find((entry) => entry.id === edge.source);
              let label: string;
              if (edge.sourceFieldId && sourceNode?.kind === 'form') {
                label = sourceNode.fields.find((field) => field.id === edge.sourceFieldId)?.title
                  ?? t('rungraph.editor.models');
              } else {
                const instance = sourceNode?.kind === 'run'
                  ? sourceNode.instances.find((entry) => entry.id === edge.sourceInstanceId)
                  : undefined;
                label = instance
                  ? instance.displayName || `${instance.providerID}/${instance.modelID}`
                  : t('rungraph.editor.models');
              }
              const targetInput = node.inputs.find((input) => input.id === edge.targetInputId);
              return (
                <div key={edge.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                    {index + 1}. {sourceNode?.title} · {label}
                    {targetInput && <span className="text-muted-foreground"> → {targetInput.name}</span>}
                  </span>
                  <button
                    type="button"
                    className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={t('rungraph.toolbar.delete')}
                    onClick={() => disconnectDraftEdge(edge.id)}
                  >
                    <Icon name="close" className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {draft.worktrees.length > 0 && (
        <div>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t('rungraph.editor.nodeWorktree')}</span>
          <Select
            value={draft.nodeWorktreeBindings[node.id] ?? 'none'}
            onValueChange={(value) => setDraftNodeBinding(node.id, value === 'none' ? null : value)}
          >
            <SelectTrigger className="h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('rungraph.editor.nodeWorktreeNone')}</SelectItem>
              {draft.worktrees.map((worktree) => (
                <SelectItem key={worktree.id} value={worktree.id}>
                  {worktree.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {node.instances.length > 0 && draft.worktrees.length > 0 && (
        <div>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t('rungraph.editor.worktree')}</span>
          <div className="flex flex-col gap-1.5">
            {node.instances.map((instance) => (
              <div key={instance.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {instance.displayName || `${instance.providerID}/${instance.modelID}`}
                </span>
                <Select
                  value={instanceWorktreeValue(instance)}
                  onValueChange={(value) =>
                    updateDraftInstance(node.id, instance.id, { worktree: applyInstanceWorktreeValue(value) })
                  }
                >
                  <SelectTrigger className="h-7 w-40 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inherit">{t('rungraph.editor.worktreeInherit')}</SelectItem>
                    <SelectItem value="root">{t('rungraph.editor.worktreeRoot')}</SelectItem>
                    <SelectItem value="dedicated-new">{t('rungraph.editor.worktreeDedicated')}</SelectItem>
                    {draft.worktrees.map((worktree) => (
                      <SelectItem key={worktree.id} value={`pool:${worktree.id}`}>
                        {t('rungraph.editor.worktreePool', { name: worktree.title })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      )}

      {node.instances.some((instance) => (activeRun?.instances[instance.id]?.output ?? '').length > 0) && (
        <div>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t('rungraph.outputs.title')}</span>
          <div className="flex flex-col gap-2">
            {node.instances.map((instance) => {
              const output = activeRun?.instances[instance.id]?.output ?? '';
              if (output.length === 0) return null;
              return (
                <div key={instance.id}>
                  <div className="mb-0.5 truncate text-[10px] text-muted-foreground">
                    {instance.displayName || `${instance.providerID}/${instance.modelID}`}
                  </div>
                  <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[11px] leading-snug text-foreground">
                    {output}
                  </pre>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {nodeSessions.length > 0 && (
        <div>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t('rungraph.sessions.title')}</span>
          <div className="flex flex-col gap-1">
            {nodeSessions.map(({ sessionId, link }) => (
              <button
                key={sessionId}
                type="button"
                onClick={() => onOpenSession?.(sessionId)}
                className="flex items-center gap-1.5 rounded px-1 py-1 text-left text-xs hover:bg-interactive-hover"
              >
                <Icon name="chat-4" className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{link.nodeTitle}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">…{sessionId.slice(-6)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <Button type="button" variant="destructive" size="sm" className="mt-1 self-start" onClick={() => removeDraftNode(node.id)}>
        {t('rungraph.toolbar.delete')}
      </Button>
    </div>
  );
};

interface FormFieldEditorProps {
  node: RunGraphFormNode;
  field: RunGraphFormField;
}

const parseOptionalNumber = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const asFieldType = (value: string): RunGraphFormFieldType =>
  RUN_GRAPH_FORM_FIELD_TYPES.find((type) => type === value) ?? 'text';

const FormFieldEditor: React.FC<FormFieldEditorProps> = ({ node, field }) => {
  const { t } = useI18n();
  const updateDraftFormField = useRunGraphStore((state) => state.updateDraftFormField);
  const removeDraftFormField = useRunGraphStore((state) => state.removeDraftFormField);

  const patch = (partial: Partial<RunGraphFormField>): void => updateDraftFormField(node.id, field.id, partial);
  const numeric = field.type === 'number' || field.type === 'slider';

  return (
    <div className="rounded-md border border-border p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <Input
          value={field.title}
          onChange={(event) => patch({ title: event.target.value })}
          placeholder={t('rungraph.form.fieldTitlePlaceholder')}
          aria-label={t('rungraph.form.fieldTitle')}
          className="h-7 flex-1"
        />
        <button
          type="button"
          className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={t('rungraph.form.removeField')}
          onClick={() => removeDraftFormField(node.id, field.id)}
        >
          <Icon name="close" className="size-3.5" />
        </button>
      </div>

      <div className="mb-2 flex items-center gap-3">
        <label className="text-xs text-muted-foreground" htmlFor={`field-type-${field.id}`}>
          {t('rungraph.form.fieldType')}
        </label>
        <Select
          value={field.type}
          onValueChange={(value) => patch({ type: asFieldType(value) })}
        >
          <SelectTrigger id={`field-type-${field.id}`} className="h-7 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RUN_GRAPH_FORM_FIELD_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {t(`rungraph.form.fieldType.${type}` as const)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(field.type === 'text' || field.type === 'textarea' || field.type === 'number' || field.type === 'date' || field.type === 'time') && (
        <div className="mb-2">
          <Input
            value={field.placeholder ?? ''}
            onChange={(event) => patch({ placeholder: event.target.value || undefined })}
            placeholder={t('rungraph.form.fieldPlaceholder')}
            aria-label={t('rungraph.form.fieldPlaceholder')}
            className="h-7"
          />
        </div>
      )}

      {field.type === 'select' && (
        <div className="mb-2">
          <span className="mb-1 block text-xs text-muted-foreground">{t('rungraph.form.fieldOptions')}</span>
          <textarea
            value={(field.options ?? []).join('\n')}
            onChange={(event) =>
              patch({
                options: event.target.value.split('\n').map((line) => line.trim()).filter((line) => line.length > 0),
              })
            }
            className="h-16 w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            placeholder={t('rungraph.form.fieldOptionsPlaceholder')}
          />
        </div>
      )}

      {numeric && (
        <div className="mb-2 flex items-center gap-2">
          <Input
            type="number"
            value={field.min ?? ''}
            onChange={(event) => patch({ min: parseOptionalNumber(event.target.value) })}
            placeholder={t('rungraph.form.fieldMin')}
            aria-label={t('rungraph.form.fieldMin')}
            className="h-7 flex-1"
          />
          <Input
            type="number"
            value={field.max ?? ''}
            onChange={(event) => patch({ max: parseOptionalNumber(event.target.value) })}
            placeholder={t('rungraph.form.fieldMax')}
            aria-label={t('rungraph.form.fieldMax')}
            className="h-7 flex-1"
          />
          <Input
            type="number"
            value={field.step ?? ''}
            onChange={(event) => patch({ step: parseOptionalNumber(event.target.value) })}
            placeholder={t('rungraph.form.fieldStep')}
            aria-label={t('rungraph.form.fieldStep')}
            className="h-7 flex-1"
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox
            checked={field.required ?? false}
            onChange={(checked) => patch({ required: checked })}
            ariaLabel={t('rungraph.form.fieldRequired')}
          />
          {t('rungraph.form.fieldRequired')}
        </label>
      </div>

      <div className="mt-2">
        {field.type === 'checkbox' ? (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox
              checked={field.defaultValue === 'true'}
              onChange={(checked) => patch({ defaultValue: checked ? 'true' : 'false' })}
              ariaLabel={t('rungraph.form.fieldDefault')}
            />
            {t('rungraph.form.fieldDefault')}
          </label>
        ) : field.type === 'textarea' ? (
          <textarea
            value={field.defaultValue ?? ''}
            onChange={(event) => patch({ defaultValue: event.target.value || undefined })}
            className="h-12 w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            placeholder={t('rungraph.form.fieldDefault')}
            aria-label={t('rungraph.form.fieldDefault')}
          />
        ) : field.type === 'select' ? (
          <Select
            value={field.defaultValue ?? ''}
            onValueChange={(value) => patch({ defaultValue: value || undefined })}
          >
            <SelectTrigger className="h-7 w-full">
              <SelectValue placeholder={t('rungraph.form.fieldDefaultNone')} />
            </SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            type={field.type === 'number' || field.type === 'slider' ? 'number' : field.type}
            value={field.defaultValue ?? ''}
            min={numeric ? field.min : undefined}
            max={numeric ? field.max : undefined}
            step={numeric ? field.step : undefined}
            onChange={(event) => patch({ defaultValue: event.target.value || undefined })}
            placeholder={t('rungraph.form.fieldDefault')}
            aria-label={t('rungraph.form.fieldDefault')}
            className="h-7"
          />
        )}
      </div>
    </div>
  );
};

interface FormEditorProps {
  node: RunGraphFormNode;
  draft: RunGraphDefinition;
}

const FormEditor: React.FC<FormEditorProps> = ({ node, draft }) => {
  const { t } = useI18n();
  const updateDraftFormNode = useRunGraphStore((state) => state.updateDraftFormNode);
  const removeDraftNode = useRunGraphStore((state) => state.removeDraftNode);
  const addDraftFormField = useRunGraphStore((state) => state.addDraftFormField);
  const disconnectDraftEdge = useRunGraphStore((state) => state.disconnectDraftEdge);

  const incomingDefaults = draft.edges.filter((edge) => edge.target === node.id && !!edge.targetFieldId);

  const handleAddField = (): void => {
    addDraftFormField(node.id, createRunGraphFormField('', 'text'));
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="rungraph-form-title">
          {t('rungraph.editor.nodeTitle')}
        </label>
        <Input
          id="rungraph-form-title"
          value={node.title}
          onChange={(event) => updateDraftFormNode(node.id, { title: event.target.value })}
          className="h-8"
        />
      </div>

      <p className="text-[10px] leading-snug text-muted-foreground">{t('rungraph.form.description')}</p>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {t('rungraph.form.fields')} ({node.fields.length})
          </span>
          <Button type="button" variant="ghost" size="xs" onClick={handleAddField}>
            {t('rungraph.form.addField')}
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {node.fields.map((field) => (
            <FormFieldEditor key={field.id} node={node} field={field} />
          ))}
          {node.fields.length === 0 && (
            <p className="text-xs text-muted-foreground">{t('rungraph.form.noFields')}</p>
          )}
        </div>
      </div>

      {incomingDefaults.length > 0 && (
        <div>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t('rungraph.form.defaults')}</span>
          <div className="flex flex-col gap-1">
            {incomingDefaults.map((edge) => {
              const sourceNode = draft.nodes.find((entry) => entry.id === edge.source);
              const targetField = node.fields.find((field) => field.id === edge.targetFieldId);
              return (
                <div key={edge.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                    {sourceNode?.title} → {targetField?.title}
                  </span>
                  <button
                    type="button"
                    className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={t('rungraph.toolbar.delete')}
                    onClick={() => disconnectDraftEdge(edge.id)}
                  >
                    <Icon name="close" className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Button type="button" variant="destructive" size="sm" className="mt-1 self-start" onClick={() => removeDraftNode(node.id)}>
        {t('rungraph.toolbar.delete')}
      </Button>
    </div>
  );
};

interface WorktreeEditorProps {
  worktree: RunGraphWorktree;
}

const WorktreeEditor: React.FC<WorktreeEditorProps> = ({ worktree }) => {
  const { t } = useI18n();
  const updateDraftWorktree = useRunGraphStore((state) => state.updateDraftWorktree);
  const removeDraftWorktree = useRunGraphStore((state) => state.removeDraftWorktree);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="rungraph-wt-title">
          {t('rungraph.editor.nodeTitle')}
        </label>
        <Input
          id="rungraph-wt-title"
          value={worktree.title}
          onChange={(event) => updateDraftWorktree(worktree.id, { title: event.target.value })}
          className="h-8"
        />
      </div>

      <div>
        <span className="mb-1 block text-xs font-medium text-muted-foreground">{t('rungraph.editor.worktree')}</span>
        <Select
          value={worktree.kind}
          onValueChange={(value) => updateDraftWorktree(worktree.id, { kind: value === 'new' ? 'new' : 'existing' })}
        >
          <SelectTrigger className="h-8 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="existing">{t('rungraph.worktree.kindExisting')}</SelectItem>
            <SelectItem value="new">{t('rungraph.worktree.kindNew')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {worktree.kind === 'existing' ? (
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="rungraph-wt-path">
            {t('rungraph.worktree.path')}
          </label>
          <Input
            id="rungraph-wt-path"
            value={worktree.path ?? ''}
            onChange={(event) => updateDraftWorktree(worktree.id, { path: event.target.value })}
            className="h-8 font-mono text-xs"
            placeholder="/path/to/worktree"
          />
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="rungraph-wt-name">
            {t('rungraph.worktree.name')}
          </label>
          <Input
            id="rungraph-wt-name"
            value={worktree.name ?? ''}
            onChange={(event) => updateDraftWorktree(worktree.id, { name: event.target.value })}
            className="h-8 font-mono text-xs"
            placeholder="graphs/review"
          />
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="rungraph-wt-base">
          {t('rungraph.worktree.baseBranch')}
        </label>
        <Input
          id="rungraph-wt-base"
          value={worktree.baseBranch ?? ''}
          onChange={(event) => updateDraftWorktree(worktree.id, { baseBranch: event.target.value })}
          className="h-8 font-mono text-xs"
          placeholder="HEAD"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="rungraph-wt-setup">
          {t('rungraph.worktree.setupCommands')}
        </label>
        <textarea
          id="rungraph-wt-setup"
          value={(worktree.setupCommands ?? []).join('\n')}
          onChange={(event) =>
            updateDraftWorktree(worktree.id, {
              setupCommands: event.target.value.split('\n').filter((line) => line.trim().length > 0),
            })
          }
          className="h-20 w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          placeholder="bun install"
        />
      </div>

      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="mt-1 self-start"
        onClick={() => removeDraftWorktree(worktree.id)}
      >
        {t('rungraph.toolbar.delete')}
      </Button>
    </div>
  );
};

export interface RunGraphSelection {
  kind: 'node' | 'worktree';
  id: string;
}

interface RunGraphInspectorProps {
  draft: RunGraphDefinition;
  selection: RunGraphSelection | null;
  issues: RunGraphValidationIssue[];
  onClose?: () => void;
  onOpenSession?: (sessionId: string) => void;
  className?: string;
}

export const RunGraphInspector: React.FC<RunGraphInspectorProps> = ({
  draft,
  selection,
  issues,
  onClose,
  onOpenSession,
  className,
}) => {
  const { t } = useI18n();

  const selectedNode = selection?.kind === 'node'
    ? draft.nodes.find((node) => node.id === selection.id)
    : undefined;
  const selectedWorktree = selection?.kind === 'worktree'
    ? draft.worktrees.find((worktree) => worktree.id === selection.id)
    : undefined;

  const inspectorTitle = selectedNode?.title ?? selectedWorktree?.title ?? undefined;

  return (
    <div className={cn('flex flex-col overflow-hidden border-border bg-card', className)}>
      {onClose && (
        <div className="flex items-center gap-1 border-b border-border px-2 py-1.5 lg:hidden">
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={t('mobile.surface.closeAria')}
            onClick={onClose}
          >
            <Icon name="arrow-left" className="size-5" />
          </button>
          {inspectorTitle && (
            <span className="min-w-0 truncate text-xs font-medium text-foreground">{inspectorTitle}</span>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {selectedNode ? (
          selectedNode.kind === 'form'
            ? <FormEditor node={selectedNode} draft={draft} />
            : <NodeEditor node={selectedNode} draft={draft} onOpenSession={onOpenSession} />
        ) : selectedWorktree ? (
          <WorktreeEditor worktree={selectedWorktree} />
        ) : (
          <div className="p-3 text-xs text-muted-foreground">{t('rungraph.editor.selectNodeHint')}</div>
        )}
      </div>
      <div className="border-t border-border">
        <div className="px-3 pt-2 text-xs font-medium text-muted-foreground">
          {t('rungraph.toolbar.validation')}
        </div>
        <ValidationList issues={issues} draft={draft} />
      </div>
    </div>
  );
};
