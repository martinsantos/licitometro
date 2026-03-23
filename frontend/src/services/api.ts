const BASE_URL = process.env.REACT_APP_API_URL || '';

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

async function request<T>(method: string, path: string, options?: RequestOptions): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: options?.body ? JSON.stringify(options.body) : undefined,
    signal: options?.signal,
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}

export const api = {
  get: <T>(path: string, params?: URLSearchParams, signal?: AbortSignal) =>
    request<T>('GET', params ? `${path}?${params}` : path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
