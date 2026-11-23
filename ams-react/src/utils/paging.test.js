import { describe, it, expect } from 'vitest';
import { pageRange, clampPage, readPageMeta } from './paging';

describe('pageRange', () => {
  it('numbers the rows of a full page', () => {
    expect(pageRange(1, 25, 112)).toEqual({ from: 1, to: 25 });
    expect(pageRange(2, 25, 112)).toEqual({ from: 26, to: 50 });
  });
  it('stops at the total on the last page', () => {
    expect(pageRange(5, 25, 112)).toEqual({ from: 101, to: 112 });
  });
  it('is 0–0 for an empty list', () => {
    expect(pageRange(1, 25, 0)).toEqual({ from: 0, to: 0 });
  });
  it('never reads past the total when the page is beyond the end', () => {
    expect(pageRange(9, 25, 30)).toEqual({ from: 30, to: 30 });
  });
});

describe('clampPage', () => {
  it('keeps a page that exists', () => expect(clampPage(2, 3)).toBe(2));
  it('moves a page past the end to the last page', () => expect(clampPage(4, 3)).toBe(3));
  it('never goes below 1', () => {
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(2, 0)).toBe(1);
    expect(clampPage(undefined, undefined)).toBe(1);
  });
});

describe('readPageMeta', () => {
  it('reads the server paging fields', () => {
    expect(readPageMeta({ total: 112, page: 2, limit: 25, pages: 5 })).toEqual({ total: 112, page: 2, limit: 25, pages: 5 });
  });
  it('treats a total of 0 as 0, not as missing', () => {
    expect(readPageMeta({ total: 0, page: 1, limit: 25, pages: 1 }, 7).total).toBe(0);
  });
  it('falls back to one page of what arrived when the fields are missing', () => {
    expect(readPageMeta({}, 7)).toEqual({ total: 7, page: 1, limit: 7, pages: 1 });
  });
});
