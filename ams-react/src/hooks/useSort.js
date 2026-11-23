import useUrlFilter from './useUrlFilter';

// A table's sort column and direction kept in the URL (?sort=name&dir=desc), so a
// refresh or a shared link keeps the order. `keys` are the sortable columns; the
// first is the default. toggle(key) sorts a new column ascending and flips the
// direction of the current one.
//
//   const { sortKey, sortDir, toggle, setSortKey, setSortDir } = useSort(['name', 'unit']);
export default function useSort(keys, defaultDir = 'asc') {
  const [sortKey, setSortKey] = useUrlFilter('sort', keys[0], keys);
  const [sortDir, setSortDir] = useUrlFilter('dir', defaultDir, ['asc', 'desc']);
  const toggle = (key) => {
    if (key === sortKey) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };
  return { sortKey, sortDir, toggle, setSortKey, setSortDir };
}

// Sorts a copy: text without regard to case and with numbers in order (6A before
// 10A), empty values last in either direction. `getters` maps a key to a value.
export function sortRows(rows, getters, key, dir = 'asc') {
  const get = getters[key];
  if (!get) return rows;
  const sign = dir === 'desc' ? -1 : 1;
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const empty = (v) => v === null || v === undefined || v === '';
  return [...rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (empty(x) || empty(y)) return empty(x) && empty(y) ? 0 : empty(x) ? 1 : -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign;
    return collator.compare(String(x), String(y)) * sign;
  });
}
