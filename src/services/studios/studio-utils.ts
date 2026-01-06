export function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeSocialLinks(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object') return null;
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, val]) => [key, typeof val === 'string' ? val.trim() : ''])
    .filter(([, val]) => val);
  if (entries.length === 0) return null;
  return Object.fromEntries(entries) as Record<string, string>;
}
