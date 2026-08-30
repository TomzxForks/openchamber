export const DEFAULT_INPUTS_SEPARATOR = '\n\n';

interface TemplatePlaceholderError {
  placeholder: string;
  start: number;
  message: string;
}

type PlaceholderMatch =
  | { raw: string; start: number; end: number; kind: 'all'; name: string }
  | { raw: string; start: number; end: number; kind: 'index'; name: string; index: number }
  | { raw: string; start: number; end: number; kind: 'join'; name: string; separator: string };

/** Values available to a template, keyed by the node's input names. */
export type RunTemplateValues = Record<string, string[]>;

const PLACEHOLDER_CONTENT = /^\s*([^\s.[\]{}"()]+)(?:\s*\[\s*(\d+)\s*\]|\s*\.\s*join\(\s*"([^"]*)"\s*\))?\s*$/;

interface ScanResult {
  placeholders: PlaceholderMatch[];
  errors: TemplatePlaceholderError[];
}

export const scanRunTemplate = (template: string): ScanResult => {
  const placeholders: PlaceholderMatch[] = [];
  const errors: TemplatePlaceholderError[] = [];
  let cursor = 0;

  while (cursor < template.length) {
    const start = template.indexOf('{{', cursor);
    if (start < 0) break;

    const end = template.indexOf('}}', start + 2);
    if (end < 0) {
      errors.push({
        placeholder: template.slice(start),
        start,
        message: 'Unclosed placeholder: missing "}}"',
      });
      break;
    }

    const raw = template.slice(start, end + 2);
    const content = raw.slice(2, -2);
    const match = PLACEHOLDER_CONTENT.exec(content);

    if (!match) {
      errors.push({
        placeholder: raw,
        start,
        message: `Invalid expression "${content.trim()}": expected name, name[N], or name.join("sep")`,
      });
    } else {
      const name = match[1];
      if (match[2] !== undefined) {
        placeholders.push({ raw, start, end: end + 2, kind: 'index', name, index: Number.parseInt(match[2], 10) });
      } else if (match[3] !== undefined) {
        placeholders.push({ raw, start, end: end + 2, kind: 'join', name, separator: match[3] });
      } else {
        placeholders.push({ raw, start, end: end + 2, kind: 'all', name });
      }
    }

    cursor = end + 2;
  }

  return { placeholders, errors };
};

type RunTemplateRenderResult =
  | { ok: true; text: string }
  | { ok: false; errors: TemplatePlaceholderError[] };

export const renderRunGraphTemplate = (template: string, values: RunTemplateValues): RunTemplateRenderResult => {
  const { placeholders, errors } = scanRunTemplate(template);

  for (const placeholder of placeholders) {
    const inputValues = values[placeholder.name];
    if (inputValues === undefined) {
      errors.push({
        placeholder: placeholder.raw,
        start: placeholder.start,
        message: `Unknown input "${placeholder.name}"`,
      });
      continue;
    }
    if (placeholder.kind === 'index' && placeholder.index >= inputValues.length) {
      errors.push({
        placeholder: placeholder.raw,
        start: placeholder.start,
        message: `Input index ${placeholder.index} is out of range: "${placeholder.name}" has ${inputValues.length} value(s)`,
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  if (placeholders.length === 0) {
    return { ok: true, text: template };
  }

  let result = '';
  let cursor = 0;
  for (const placeholder of placeholders) {
    result += template.slice(cursor, placeholder.start);
    const inputValues = values[placeholder.name] ?? [];
    if (placeholder.kind === 'index') {
      result += inputValues[placeholder.index];
    } else if (placeholder.kind === 'join') {
      result += inputValues.join(placeholder.separator);
    } else {
      result += inputValues.join(DEFAULT_INPUTS_SEPARATOR);
    }
    cursor = placeholder.end;
  }
  result += template.slice(cursor);

  return { ok: true, text: result };
};
