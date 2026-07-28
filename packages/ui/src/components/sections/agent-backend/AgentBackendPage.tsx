import React from 'react';
import { useI18n } from '@/lib/i18n';
import { useAgentBackendStore } from '@/stores/useAgentBackendStore';
import { Radio } from '@/components/ui/radio';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

// Agent Backend settings page (FR-5). Lets the user choose the active backend
// (OpenCode default, or a configured ACP stdio agent) and manage ACP agent
// configs. Selecting ACP installs an AcpClient as the active agent client.

const BACKEND_OPTIONS = [
  { value: 'opencode', labelKey: 'settings.agentBackend.backend.opencode' },
  { value: 'acp', labelKey: 'settings.agentBackend.backend.acp' },
] as const;

export function AgentBackendPage() {
  const { t } = useI18n();
  const activeBackend = useAgentBackendStore((s) => s.activeBackend);
  const activeAcpAgentId = useAgentBackendStore((s) => s.activeAcpAgentId);
  const agents = useAgentBackendStore((s) => s.agents);
  const setBackend = useAgentBackendStore((s) => s.setBackend);
  const selectAcpAgent = useAgentBackendStore((s) => s.selectAcpAgent);
  const addAgent = useAgentBackendStore((s) => s.addAgent);
  const updateAgent = useAgentBackendStore((s) => s.updateAgent);
  const removeAgent = useAgentBackendStore((s) => s.removeAgent);

  return (
    <div className="h-full overflow-auto px-5 py-6" data-settings-item="agent-backend">
      <h1 className={cn('typography-ui-header', 'font-semibold text-foreground mb-6')}>
        {t('settings.agentBackend.page.title')}
      </h1>

      <section className="mb-8">
        <h2 className={cn('typography-ui-header', 'font-medium text-foreground mb-1 px-1')}>
          {t('settings.agentBackend.section.backend')}
        </h2>
        <div className="pt-0 pb-2 px-2">
          <p className={cn('typography-meta', 'text-muted-foreground mb-2')}>
            {t('settings.agentBackend.section.backend.description')}
          </p>
          <div role="radiogroup" aria-label={t('settings.agentBackend.section.backend')} className="space-y-0">
            {BACKEND_OPTIONS.map((option) => {
              const selected = activeBackend === option.value;
              return (
                <div
                  key={option.value}
                  className="flex w-full items-center gap-2 py-0.5"
                  data-settings-item={`agent-backend.${option.value}`}
                >
                  <Radio
                    checked={selected}
                    onChange={() => setBackend(option.value)}
                    ariaLabel={t(option.labelKey)}
                  />
                  <span
                    className={cn(
                      'typography-ui-label',
                      'font-normal',
                      selected ? 'text-foreground' : 'text-foreground/50',
                    )}
                  >
                    {t(option.labelKey)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-1 px-1">
          <h2 className={cn('typography-ui-header', 'font-medium text-foreground')}>
            {t('settings.agentBackend.section.agents')}
          </h2>
          <Button
            variant="outline"
            size="xs"
            className="h-7"
            onClick={() => addAgent({ name: 'ACP agent', command: '', enabled: true })}
          >
            {t('settings.agentBackend.action.add')}
          </Button>
        </div>
        <div className="pt-0 pb-2 px-2 space-y-3">
          <p className={cn('typography-meta', 'text-muted-foreground')}>
            {t('settings.agentBackend.section.agents.description')}
          </p>

          {agents.length === 0 ? (
            <p className={cn('typography-meta', 'text-muted-foreground/70')}>
              {t('settings.agentBackend.empty')}
            </p>
          ) : (
            agents.map((agent) => {
              const isActive = activeBackend === 'acp' && activeAcpAgentId === agent.id;
              return (
                <div key={agent.id} className="space-y-1.5 p-2" data-settings-item={`agent-backend.agent.${agent.id}`}>
                  <div className="flex items-center gap-2">
                    <Radio
                      checked={isActive}
                      onChange={() => {
                        selectAcpAgent(agent.id);
                        if (activeBackend !== 'acp') setBackend('acp');
                      }}
                      ariaLabel={agent.name}
                    />
                    <Input
                      className="h-7"
                      value={agent.name}
                      onChange={(e) => updateAgent(agent.id, { name: e.target.value })}
                      aria-label={t('settings.agentBackend.field.name')}
                    />
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-7 w-7 p-0"
                      onClick={() => removeAgent(agent.id)}
                      aria-label={t('settings.agentBackend.action.remove')}
                    >
                      ×
                    </Button>
                  </div>
                  <div className="space-y-1 pl-6">
                    <label className={cn('typography-meta', 'text-muted-foreground block')} htmlFor={`agent-command-${agent.id}`}>
                      {t('settings.agentBackend.field.command')}
                    </label>
                    <Input
                      id={`agent-command-${agent.id}`}
                      className="h-7"
                      placeholder={t('settings.agentBackend.field.command.placeholder')}
                      value={agent.command}
                      onChange={(e) => updateAgent(agent.id, { command: e.target.value })}
                      aria-label={t('settings.agentBackend.field.command')}
                    />
                  </div>
                  <div className="flex cursor-pointer items-center gap-2 py-0.5 pl-6">
                    <Checkbox
                      checked={agent.enabled}
                      onChange={(checked) => updateAgent(agent.id, { enabled: checked })}
                      ariaLabel={t('settings.agentBackend.field.enabled')}
                    />
                    <span className={cn('typography-ui-label', 'font-normal text-foreground')}>
                      {t('settings.agentBackend.field.enabled')}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
