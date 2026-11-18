import { describe, expect, it } from 'vitest';
import { readStoredUser } from './readStoredUser';

function fakeStore(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    removeItem: (k) => { delete data[k]; },
  };
}

describe('readStoredUser', () => {
  it('returns the stored user', () => {
    const s = fakeStore({ loggedInUser: '{"id":7,"role":"user"}' });
    expect(readStoredUser(null, [s])).toEqual({ id: 7, role: 'user' });
  });

  it('prefers the first store and falls back to the second', () => {
    const a = fakeStore();
    const b = fakeStore({ loggedInUser: '{"id":2}' });
    expect(readStoredUser(null, [a, b])).toEqual({ id: 2 });
  });

  it('gives the fallback when nothing is stored', () => {
    expect(readStoredUser(null, [fakeStore()])).toBeNull();
    expect(readStoredUser({}, [fakeStore()])).toEqual({});
  });

  it('survives corrupt JSON and removes it', () => {
    const s = fakeStore({ loggedInUser: '{"id":' });
    expect(readStoredUser({}, [s])).toEqual({});
    expect('loggedInUser' in s.data).toBe(false);
  });

  it('refuses values that are not a user object', () => {
    for (const bad of ['null', '7', '"x"', '[1,2]', 'true']) {
      const s = fakeStore({ loggedInUser: bad });
      expect(readStoredUser(null, [s])).toBeNull();
      expect('loggedInUser' in s.data).toBe(false);
    }
  });

  it('a corrupt first store does not hide a good second one', () => {
    const a = fakeStore({ loggedInUser: 'oops' });
    const b = fakeStore({ loggedInUser: '{"id":3}' });
    expect(readStoredUser(null, [a, b])).toEqual({ id: 3 });
  });

  it('survives a store that throws', () => {
    const bad = { getItem() { throw new Error('blocked'); }, removeItem() {} };
    expect(readStoredUser(null, [bad])).toBeNull();
  });
});
