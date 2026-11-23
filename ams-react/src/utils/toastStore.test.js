import { describe, expect, it, vi } from 'vitest';
import { createToastStore, TOAST_MS } from './toastStore';

describe('toastStore', () => {
  it('adds, notifies and auto-dismisses', () => {
    vi.useFakeTimers();
    const store = createToastStore();
    const seen = vi.fn();
    store.subscribe(seen);
    store.push('success', 'Saved');
    expect(store.getItems()).toHaveLength(1);
    vi.advanceTimersByTime(TOAST_MS.success + 1);
    expect(store.getItems()).toHaveLength(0);
    expect(seen).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('ignores empty messages', () => {
    const store = createToastStore(() => 0, () => {});
    expect(store.push('error', '  ')).toBe(0);
    expect(store.push('error', null)).toBe(0);
    expect(store.getItems()).toHaveLength(0);
  });

  it('does not stack an identical message and caps the list', () => {
    const store = createToastStore(() => 0, () => {});
    store.push('error', 'Failed');
    store.push('error', 'Failed');
    expect(store.getItems()).toHaveLength(1);
    for (let i = 0; i < 8; i += 1) store.push('info', `m${i}`);
    expect(store.getItems()).toHaveLength(5);
    expect(store.getItems().at(-1).message).toBe('m7');
  });

  it('dismisses one toast by id', () => {
    const store = createToastStore(() => 0, () => {});
    const a = store.push('info', 'a');
    store.push('info', 'b');
    store.dismiss(a);
    expect(store.getItems().map((x) => x.message)).toEqual(['b']);
  });
});
