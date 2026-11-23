import { beforeEach, describe, expect, it } from 'vitest';
import { clearDraft, readDraft, saveDraft } from './formDraft';

const store = new Map();
beforeEach(() => {
  store.clear();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
});

describe('formDraft', () => {
  it('round-trips and clears', () => {
    saveDraft('d', { name: 'Ana', note: '' });
    expect(readDraft('d')).toEqual({ name: 'Ana', note: '' });
    clearDraft('d');
    expect(readDraft('d')).toEqual({});
  });
  it('drops an all-empty draft', () => {
    saveDraft('d', { name: 'Ana' });
    saveDraft('d', { name: '', note: '' });
    expect(store.has('d')).toBe(false);
  });
  it('treats corrupt or non-object storage as no draft', () => {
    store.set('d', '{bad');
    expect(readDraft('d')).toEqual({});
    store.set('d', '[1,2]');
    expect(readDraft('d')).toEqual({});
  });
});
