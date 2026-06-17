const BASE_URL = process.env.REACT_APP_API_URL || process.env.REACT_APP_BACKEND_URL || '';

export class ApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`API ${status}: ${body.slice(0, 200)}`);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
}

function formatApiBody(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'Error de API sin detalle';

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object') {
      const body = parsed as { detail?: unknown; message?: unknown; error?: unknown };
      if (typeof body.detail === 'string') return body.detail;
      if (typeof body.message === 'string') return body.message;
      if (typeof body.error === 'string') return body.error;
    }
  } catch {
    // Fall through to the plain text/HTML diagnostics below.
  }

  if (/^<!doctype html>|^<html[\s>]/i.test(trimmed)) {
    return 'La API devolvio HTML en vez de JSON. Revisar que el backend este corriendo y que REACT_APP_BACKEND_URL/proxy apunte a FastAPI.';
  }

  return trimmed;
}

async function request<T>(method: string, path: string, options?: RequestOptions): Promise<T> {
  const headers = options?.body
    ? { 'Content-Type': 'application/json', ...options?.headers }
    : options?.headers;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
    signal: options?.signal,
  });
  const raw = await res.text();
  if (!res.ok) throw new ApiError(res.status, formatApiBody(raw));

  try {
    return (raw ? JSON.parse(raw) : undefined) as T;
  } catch {
    throw new ApiError(res.status, formatApiBody(raw));
  }
}

export const api = {
  baseUrl: BASE_URL,
  get: <T>(path: string, params?: URLSearchParams, signal?: AbortSignal, headers?: Record<string, string>) =>
    request<T>('GET', params ? `${path}?${params}` : path, { signal, headers }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>('POST', path, { body, headers }),
  put: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>('PUT', path, { body, headers }),
  patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>('PATCH', path, { body, headers }),
  delete: <T>(path: string, headers?: Record<string, string>) => request<T>('DELETE', path, { headers }),
};
