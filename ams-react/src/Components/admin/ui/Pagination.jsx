import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { pageRange } from '../../../utils/paging';

const arrowCls = 'w-8 h-8 rounded-control border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center cursor-pointer text-slate-600 text-label';

// Prev / Next pager for a list paged on the server (list_page_request() in
// config.php): "Showing 26–50 of 112", then "Page 2 of 5". Renders nothing
// while the list is empty. `noun` names the rows ("visitors", "requests").
export default function Pagination({ page, pages, total, limit, onPage, noun = 'records', className = '' }) {
  if (!total) return null;
  const { from, to } = pageRange(page, limit, total);
  return (
    <nav aria-label="Pages" className={`px-6 py-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 ${className}`}>
      <span className="text-label text-slate-500">
        Showing {from}–{to} of {total} {noun}
        {pages > 1 && <span className="text-slate-400"> · Page {page} of {pages}</span>}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} aria-label="Previous page" className={arrowCls}>
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <button type="button" onClick={() => onPage(Math.min(pages, page + 1))} disabled={page >= pages} aria-label="Next page" className={arrowCls}>
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </div>
      )}
    </nav>
  );
}
