import { describe, expect, it } from 'vitest';
import { sortRows } from './useSort';

const rows = [{ u: '10A', n: 3 }, { u: '6A', n: null }, { u: '2B', n: 1 }];
const getters = { unit: (r) => r.u, n: (r) => r.n };

describe('sortRows', () => {
  it('orders numbers inside text naturally', () => {
    expect(sortRows(rows, getters, 'unit').map((r) => r.u)).toEqual(['2B', '6A', '10A']);
    expect(sortRows(rows, getters, 'unit', 'desc').map((r) => r.u)).toEqual(['10A', '6A', '2B']);
  });
  it('keeps empty values last in both directions', () => {
    expect(sortRows(rows, getters, 'n').map((r) => r.u)).toEqual(['2B', '10A', '6A']);
    expect(sortRows(rows, getters, 'n', 'desc').map((r) => r.u)).toEqual(['10A', '2B', '6A']);
  });
  it('does not change the input, and ignores an unknown key', () => {
    const copy = [...rows];
    sortRows(rows, getters, 'unit');
    expect(rows).toEqual(copy);
    expect(sortRows(rows, getters, 'nope')).toBe(rows);
  });
});
