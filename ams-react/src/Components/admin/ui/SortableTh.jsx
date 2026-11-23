import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSort, faSortUp, faSortDown } from '@fortawesome/free-solid-svg-icons';

// A column header that sorts its table. The <th> carries aria-sort, the button
// inside is the keyboard target; pair it with hooks/useSort.js.
//
//   <SortableTh className={TH} sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggle}>Tenant</SortableTh>
export default function SortableTh({ sortKey, activeKey, dir, onSort, className = '', children }) {
  const active = sortKey === activeKey;
  const ariaSort = active ? (dir === 'desc' ? 'descending' : 'ascending') : 'none';
  return (
    <th scope="col" aria-sort={ariaSort} className={className}>
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1.5 border-0 bg-transparent p-0 font-[inherit] text-[length:inherit] text-inherit cursor-pointer hover:text-slate-800">
        {children}
        <FontAwesomeIcon icon={active ? (dir === 'desc' ? faSortDown : faSortUp) : faSort} className={active ? 'text-indigo-600' : 'opacity-40'} aria-hidden="true" />
      </button>
    </th>
  );
}
