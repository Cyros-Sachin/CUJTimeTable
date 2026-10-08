const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// All exam_date / issued_on values come back from mysql2 as 'YYYY-MM-DD' strings
// (dateStrings:true). We never pass them through `new Date(str)` for display math
// because that applies the server's local timezone. Everything below is pure
// string/integer arithmetic on the Y/M/D triplet, calendar math via Date.UTC only.

export function isValidIsoDate(iso) {
  return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso);
}

export function weekdayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return WEEKDAYS[dow];
}

export function ddmmyyyy(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

export function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}, ${y}`;
}

export function ddmmyyyyToIso(ddmmyyyyStr) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(ddmmyyyyStr || '');
  if (!match) return null;
  const [, d, m, y] = match;
  return `${y}-${m}-${d}`;
}

export function isoBetween(iso, startIso, endIso) {
  return iso >= startIso && iso <= endIso;
}

export function todayIso() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

export function currentYearIst() {
  return Number(todayIso().slice(0, 4));
}
