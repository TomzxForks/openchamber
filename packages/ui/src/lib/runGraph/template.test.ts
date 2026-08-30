import { describe, expect, test } from 'bun:test';
import { renderRunGraphTemplate, scanRunTemplate, DEFAULT_INPUTS_SEPARATOR } from './template';

describe('scanRunTemplate', () => {
  test('parses all placeholder kinds with their input name', () => {
    const { placeholders, errors } = scanRunTemplate('A {{topic}} B {{notes[2]}} C {{files.join(", ")}}');
    expect(errors).toEqual([]);
    expect(placeholders.map((placeholder) => placeholder.kind)).toEqual(['all', 'index', 'join']);
    expect(placeholders.map((placeholder) => placeholder.name)).toEqual(['topic', 'notes', 'files']);
  });

  test('reports unclosed and invalid placeholders', () => {
    expect(scanRunTemplate('oops {{topic').errors).toHaveLength(1);
    const { errors } = scanRunTemplate('{{bogus.join(');
    expect(errors.length).toBeGreaterThan(0);
    expect(scanRunTemplate('clean text').errors).toEqual([]);
    expect(scanRunTemplate('clean text').placeholders).toEqual([]);
  });

  test('join requires double-quoted separator', () => {
    const { errors } = scanRunTemplate('{{files.join(\', \')}}');
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('renderRunGraphTemplate', () => {
  const values = {
    topic: ['run graphs'],
    notes: ['first', 'second'],
  };

  test('substitutes a named input with all values joined by the default separator', () => {
    const result = renderRunGraphTemplate('Research {{topic}}', values);
    expect(result).toEqual({ ok: true, text: 'Research run graphs' });
    const multi = renderRunGraphTemplate('{{notes}}', values);
    expect(multi).toEqual({ ok: true, text: `first${DEFAULT_INPUTS_SEPARATOR}second` });
  });

  test('substitutes individual values by index', () => {
    const result = renderRunGraphTemplate('{{notes[0]}} then {{notes[1]}}', values);
    expect(result).toEqual({ ok: true, text: 'first then second' });
  });

  test('joins values with a custom separator', () => {
    const result = renderRunGraphTemplate('{{notes.join(" - ")}}', values);
    expect(result).toEqual({ ok: true, text: 'first - second' });
  });

  test('passes templates without placeholders through', () => {
    expect(renderRunGraphTemplate('Do the thing.', values)).toEqual({ ok: true, text: 'Do the thing.' });
  });

  test('fails on unknown input names', () => {
    const result = renderRunGraphTemplate('Research {{ghost}}', values);
    if (result.ok) throw new Error('expected render to fail');
    expect(result.errors[0].message).toContain('Unknown input "ghost"');
  });

  test('fails when an index is out of range', () => {
    const result = renderRunGraphTemplate('{{notes[5]}}', values);
    if (result.ok) throw new Error('expected render to fail');
    expect(result.errors[0].message).toContain('out of range');
  });

  test('renders empty lists as empty text without errors', () => {
    const result = renderRunGraphTemplate('A{{empty}}B', { empty: [] });
    expect(result).toEqual({ ok: true, text: 'AB' });
  });
});
