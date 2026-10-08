const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// exam_date strings always arrive as 'YYYY-MM-DD' from the API; never run them
// through `new Date(str)` for display, since that applies the browser's local
// timezone and can shift the calendar day. Pure string/UTC arithmetic only.

export function ddmmyyyy(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

export function isoToWeekday(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function isoFromDdmmyyyy(value: string): string | null {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (!match) return null;
  const [, d, m, y] = match;
  return `${y}-${m}-${d}`;
}

export function todayIsoInIst(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + (now.getTimezoneOffset() + 330) * 60000);
  return ist.toISOString().slice(0, 10);
}

export function isoToDateObj(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function dateObjToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function examTypeLabel(type: 'REGULAR' | 'REAPPEAR'): string {
  return type === 'REGULAR' ? 'Regular' : 'Re-appear';
}
