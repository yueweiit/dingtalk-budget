function parseUtcDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

export function formatUtcDate(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = parseUtcDate(value);
  if (!date) return raw;
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function formatUtcDateTime(value) {
  if (!value) return '-';
  const date = parseUtcDate(value);
  if (!date) return String(value);
  return `${formatUtcDate(date)} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function formatUtcMonth(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(0, 7);
  const date = parseUtcDate(value);
  if (!date) return raw;
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}
