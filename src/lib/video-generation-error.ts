export type VideoGenerationError = Record<string, unknown> | string | null;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const tryParseJson = (value: string): unknown => {
  const trimmed = value.trim();
  if (!trimmed || !/^[{[]/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

export const normalizeVideoGenerationError = (value: unknown): VideoGenerationError => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const parsed = tryParseJson(value);
    return parsed === value ? value : normalizeVideoGenerationError(parsed);
  }
  if (value instanceof Error) return value.message;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => normalizeVideoGenerationError(item))
      .filter(Boolean);
    return normalized.length > 0 ? { errors: normalized } : null;
  }
  return asRecord(value);
};

const pickString = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

export const getVideoGenerationErrorMessage = (value: unknown): string | null => {
  const normalized = normalizeVideoGenerationError(value);
  if (!normalized) return null;
  if (typeof normalized === 'string') return normalized;

  const directMessage = pickString(normalized, [
    'message',
    'Message',
    'msg',
    'detail',
    'details',
    'reason',
    'Reason',
  ]);
  const code = pickString(normalized, ['code', 'Code', 'error_code', 'errorCode']);
  if (directMessage) return [code, directMessage].filter(Boolean).join(': ');

  const nestedError =
    normalized.error ||
    normalized.Error ||
    normalized.last_error ||
    normalized.lastError ||
    normalized.failure_reason ||
    normalized.failureReason;
  const nestedMessage = getVideoGenerationErrorMessage(nestedError);
  if (nestedMessage) return nestedMessage;

  try {
    return JSON.stringify(normalized);
  } catch {
    return String(normalized);
  }
};

