import { flattenAssistantTextParts } from '@/lib/messages/messageText';
import { opencodeClient } from '@/lib/opencode/client';
import { getSyncMessages, getSyncParts } from '@/sync/sync-refs';

export const getLastAssistantText = async (sessionId: string, directory: string | null): Promise<string> => {
  const directoryHint = directory ?? undefined;
  const messages = getSyncMessages(sessionId, directoryHint);

  if (messages.length === 0 && directory) {
    const result = await opencodeClient.withDirectory(directory, () =>
      opencodeClient.getSdkClient().session.messages({
        sessionID: sessionId,
        directory: directoryHint,
        limit: 50,
      })
    );
    const records = result.data ?? [];
    for (let index = records.length - 1; index >= 0; index -= 1) {
      // SAFETY: the wire record predates full SDK typings; only role and parts are read and both are re-checked below.
      const record = records[index] as { info?: { role?: string }; parts?: unknown[] };
      if (record.info?.role !== 'assistant') continue;
      // SAFETY: parts arrive as wire JSON; flattenAssistantTextParts filters to text parts defensively.
      return flattenAssistantTextParts((record.parts ?? []) as Parameters<typeof flattenAssistantTextParts>[0]).trim();
    }
    return '';
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant') continue;
    return flattenAssistantTextParts(getSyncParts(message.id, directoryHint)).trim();
  }

  return '';
};
