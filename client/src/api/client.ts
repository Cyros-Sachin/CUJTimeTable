import { ApiError } from './types';

const JSON_HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'cuj-web' };

async function parseErrorBody(res: Response): Promise<ApiError> {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // no JSON body
  }
  const err = body?.error;
  return new ApiError(
    res.status,
    err?.code || 'UNKNOWN',
    err?.message || 'Something went wrong',
    err?.fields,
    err?.rows,
  );
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw await parseErrorBody(res);
  }
  if (!res.ok) {
    throw await parseErrorBody(res);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin' });
  return handle<T>(res);
}

export async function apiSend<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: JSON_HEADERS,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handle<T>(res);
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'cuj-web' },
    body: formData,
  });
  return handle<T>(res);
}

export function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}
