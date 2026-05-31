export function pageFromSearchParams(params: URLSearchParams): number {
  const raw = params.get('page');
  const parsed = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function searchParamsWithPage(params: URLSearchParams, page: number): URLSearchParams {
  const next = new URLSearchParams(params);
  const normalized = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  next.set('page', String(normalized));
  return next;
}
