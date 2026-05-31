import { pageFromSearchParams, searchParamsWithPage } from './listUrlState';

describe('listUrlState', () => {
  it('reads a positive page number from query params', () => {
    expect(pageFromSearchParams(new URLSearchParams('page=7'))).toBe(7);
  });

  it('falls back to page 1 for missing or invalid page values', () => {
    expect(pageFromSearchParams(new URLSearchParams(''))).toBe(1);
    expect(pageFromSearchParams(new URLSearchParams('page=0'))).toBe(1);
    expect(pageFromSearchParams(new URLSearchParams('page=-2'))).toBe(1);
    expect(pageFromSearchParams(new URLSearchParams('page=abc'))).toBe(1);
  });

  it('writes page while preserving unrelated query params', () => {
    const next = searchParamsWithPage(new URLSearchParams('q=cemento&page=3'), 8);

    expect(next.get('q')).toBe('cemento');
    expect(next.get('page')).toBe('8');
  });

  it('normalizes invalid target pages to page 1', () => {
    const next = searchParamsWithPage(new URLSearchParams('q=cemento&page=3'), 0);

    expect(next.get('q')).toBe('cemento');
    expect(next.get('page')).toBe('1');
  });
});
