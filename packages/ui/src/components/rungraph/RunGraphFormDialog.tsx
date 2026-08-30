import React from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { RunGraphFormField } from '@/types/runGraph';
import type { RunGraphFormRequest } from '@/lib/runGraph/executor';
import { useRunGraphStore } from '@/stores/useRunGraphStore';

const initialFieldValue = (field: RunGraphFormField, defaults: Record<string, string>): string => {
  if (defaults[field.id] !== undefined && defaults[field.id] !== '') return defaults[field.id];
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.type === 'select') return field.options?.[0] ?? '';
  if (field.type === 'slider' || field.type === 'number') return String(field.min ?? 0);
  if (field.type === 'checkbox') return 'false';
  return '';
};

const initialValues = (fields: RunGraphFormField[], defaults: RunGraphFormRequest['defaults']): RunGraphFormRequest['defaults'] => {
  const values: Record<string, string> = {};
  for (const field of fields) {
    values[field.id] = initialFieldValue(field, defaults);
  }
  return values;
};

interface FormFieldValueProps {
  field: RunGraphFormField;
  value: string;
  onChange: (value: string) => void;
}

const FormFieldControl: React.FC<FormFieldValueProps> = ({ field, value, onChange }) => {
  const { t } = useI18n();

  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className="h-20 w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        />
      );
    case 'number':
      return (
        <Input
          type="number"
          value={value}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className="h-8"
        />
      );
    case 'date':
      return (
        <Input
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8"
        />
      );
    case 'time':
      return (
        <Input
          type="time"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8"
        />
      );
    case 'select':
      return (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="h-8 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'slider':
      return (
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={field.min ?? 0}
            max={field.max ?? 100}
            step={field.step ?? 1}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted-foreground/30 accent-[var(--primary)]"
          />
          <span className="min-w-10 shrink-0 text-right font-mono text-xs text-foreground">{value}</span>
        </div>
      );
    case 'checkbox':
      return (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
          <Checkbox
            checked={value === 'true'}
            onChange={(checked) => onChange(checked ? 'true' : 'false')}
            ariaLabel={field.title}
          />
          {value === 'true' ? t('rungraph.form.dialog.enabled') : t('rungraph.form.dialog.disabled')}
        </label>
      );
    default:
      return (
        <Input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className="h-8"
        />
      );
  }
};

interface FormDialogInnerProps {
  request: RunGraphFormRequest;
}

const FormDialogInner: React.FC<FormDialogInnerProps> = ({ request }) => {
  const { t } = useI18n();
  const submitRunForm = useRunGraphStore((state) => state.submitRunForm);
  const cancelRunForm = useRunGraphStore((state) => state.cancelRunForm);
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    initialValues(request.fields, request.defaults),
  );
  const [missing, setMissing] = React.useState<string[]>([]);

  const handleChange = (fieldId: string, value: string): void => {
    setValues((current) => ({ ...current, [fieldId]: value }));
    setMissing((current) => (current.includes(fieldId) ? current.filter((id) => id !== fieldId) : current));
  };

  const handleSubmit = (): void => {
    const emptyRequired = request.fields
      .filter((field) => field.required && !(values[field.id] ?? '').trim())
      .map((field) => field.id);
    if (emptyRequired.length > 0) {
      setMissing(emptyRequired);
      return;
    }
    submitRunForm(request.nodeId, values);
  };

  return (
    <Dialog open>
      <DialogContent className="max-w-md overflow-visible">
        <DialogHeader>
          <DialogTitle>{request.nodeTitle}</DialogTitle>
          <DialogDescription>{t('rungraph.form.dialog.description')}</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto py-1">
          {request.fields.map((field) => {
            const isMissing = missing.includes(field.id);
            return (
              <div key={field.id} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-foreground">
                  {field.title}
                  {field.required && <span className="ml-0.5 text-status-error">*</span>}
                </span>
                <div className={cn(isMissing && 'rounded ring-1 ring-status-error')}>
                  <FormFieldControl
                    field={field}
                    value={values[field.id] ?? ''}
                    onChange={(value) => handleChange(field.id, value)}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => cancelRunForm(request.nodeId)}>
            {t('rungraph.form.dialog.cancel')}
          </Button>
          <Button onClick={handleSubmit}>{t('rungraph.form.dialog.submit')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const RunGraphFormDialog: React.FC = () => {
  const activeRun = useRunGraphStore((state) => state.activeRun);
  const pending = React.useMemo(
    () => Object.values(activeRun?.forms ?? {}).find((runtime) => runtime.phase === 'waiting-input' && runtime.request),
    [activeRun],
  );

  if (activeRun?.status !== 'running' || !pending?.request) return null;
  return <FormDialogInner key={pending.request.nodeId} request={pending.request} />;
};
