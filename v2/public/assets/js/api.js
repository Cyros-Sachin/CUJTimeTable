// Thin fetch wrapper: adds the CSRF header, parses the API's JSON error
// contract into a typed ApiError, and redirects to /login on 401.

export class ApiError extends Error {
  constructor(status, code, message, fields, rows) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields || null;
    this.rows = rows || null;
  }
}

function csrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.content : '';
}

async function parseError(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    // no JSON body
  }
  const err = (body && body.error) || {};
  return new ApiError(res.status, err.code || 'UNKNOWN', err.message || 'Something went wrong', err.fields, err.rows);
}

async function handle(res) {
  if (res.status === 401) {
    if (!location.pathname.startsWith('/login')) {
      location.href = '/login';
    }
    throw await parseError(res);
  }
  if (!res.ok) {
    throw await parseError(res);
  }
  if (res.status === 204) return undefined;
  const text = await res.text();
  return text ? JSON.parse(text) : undefined;
}

export async function apiGet(path) {
  const res = await fetch('/api' + path, { credentials: 'same-origin' });
  return handle(res);
}

export async function apiSend(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handle(res);
}

export async function apiUpload(path, formData) {
  const res = await fetch('/api' + path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'X-CSRF-Token': csrfToken() },
    body: formData,
  });
  return handle(res);
}

export function buildQuery(params) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}
