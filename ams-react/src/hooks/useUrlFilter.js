import { useSearchParams } from 'react-router-dom';

// A list filter kept in the URL (?key=value), so a Dashboard link can open a page
// already filtered and a refresh or bookmark keeps it. Only values in `allowed`
// are accepted; anything else (or nothing) means `fallback`. Setting the fallback
// removes the key, and changes replace the history entry (no Back-button spam).
//
//   const [status, setStatus] = useUrlFilter('status', 'all', ['all', 'overdue', …]);
export default function useUrlFilter(key, fallback, allowed) {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = raw !== null && (!allowed || allowed.includes(raw)) ? raw : fallback;

  const setValue = (next) => {
    const resolved = typeof next === 'function' ? next(value) : next;
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (resolved === fallback || resolved === null || resolved === undefined) p.delete(key);
      else p.set(key, resolved);
      return p;
    }, { replace: true });
  };

  return [value, setValue];
}
