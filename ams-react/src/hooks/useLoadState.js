import { useCallback, useState } from 'react';

// The first load of a list: loading, then ready or error. Pages show a skeleton
// while loading, a LoadError with a retry on error, and only when ready may they
// say "nothing here" or show counts: a failed request must never read as empty.
//
//   const tenants = useLoadState();
//   try { …; tenants.ready(); } catch { tenants.fail(); }
//   {tenants.isLoading ? <Skeleton /> : tenants.isError ? <LoadError onRetry={…} /> : rows}
//
// `fail` keeps a list that already loaded (a refresh after an action that fails
// leaves the rows on screen); `retry` goes back to loading for Try again.
export default function useLoadState() {
  const [state, setState] = useState('loading');
  const ready = useCallback(() => setState('ready'), []);
  const fail = useCallback(() => setState((prev) => (prev === 'ready' ? prev : 'error')), []);
  const retry = useCallback(() => setState('loading'), []);
  return { state, isLoading: state === 'loading', isError: state === 'error', isReady: state === 'ready', ready, fail, retry };
}
