import { describe, expect, test } from 'bun:test';
import { createRunGraphEntityId } from './ids';

describe('createRunGraphEntityId', () => {
  test('uses randomUUID when available', () => {
    expect(createRunGraphEntityId('node')).toMatch(/^node_[0-9a-f-]{36}$/);
  });

  test('falls back when randomUUID is missing (insecure http context)', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: undefined },
      configurable: true,
    });
    try {
      const id = createRunGraphEntityId('inst');
      expect(id).toMatch(/^inst_[0-9a-z]+_[0-9a-z]+$/);
      expect(id).not.toContain('-');
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, 'crypto', descriptor);
      }
    }
  });
});
