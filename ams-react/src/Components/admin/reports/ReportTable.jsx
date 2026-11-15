import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faInbox } from '@fortawesome/free-solid-svg-icons';
import { formatValue, isNumericFormat } from '../../../utils/reportFormat';
import { PANEL, PANEL_HEADER, PANEL_TITLE, THEAD, TH, btn } from '../ui/styles';
import { SkeletonRows } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';

// One report table (columns + rows + totals from get_reports.php) as a
// Dashboard panel. Long lists show the first `fold` rows with "Show all";
// printing and the Excel / PDF files always have every row.
const STYLE_ROW = {
  section: 'bg-indigo-50/60 font-bold text-slate-900',
  subtotal: 'font-bold text-slate-900 border-t border-slate-200',
  total: 'bg-indigo-50 font-bold text-indigo-950 border-t-2 border-indigo-200',
};

export default function ReportTable({ table, loading, fold = 12, expanded = false, id }) {
  const [open, setOpen] = useState(false);
  const rows = table?.rows || [];
  const showAll = open || expanded;
  const visible = showAll ? rows : rows.slice(0, fold);
  const titleId = `${id || table?.key || 'report'}-title`;

  return (
    <section aria-labelledby={titleId} className={`${PANEL} flex flex-col min-w-0 overflow-hidden report-panel`}>
      <div className={PANEL_HEADER}>
        <div className="min-w-0">
          <h2 id={titleId} className={PANEL_TITLE}>{table?.title || 'Loading…'}</h2>
          {table?.note && <p className="m-0 mt-0.5 text-caption text-slate-500">{table.note}</p>}
        </div>
        {!loading && <span className="text-caption font-semibold text-slate-500 rounded-full bg-slate-100 px-2.5 py-0.5">{rows.length} row{rows.length === 1 ? '' : 's'}</span>}
      </div>
      {loading ? (
        <div className="p-4"><SkeletonRows rows={5} cols={4} label="Loading the table…" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={faInbox} title="Nothing in this range" message="Try a wider range." className="py-8" />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-label">
              <thead className={THEAD}>
                <tr>
                  {table.columns.map((c) => (
                    <th key={c.key} scope="col" className={`${TH} whitespace-nowrap ${isNumericFormat(c.format) ? 'text-right' : ''}`}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((r, i) => (
                  <tr key={r._key || i} className={`transition-colors ${STYLE_ROW[r._style] || 'text-slate-700 hover:bg-slate-50'}`}>
                    {table.columns.map((c, ci) => (
                      <td
                        key={c.key}
                        className={`px-4 py-2.5 ${isNumericFormat(c.format) ? 'text-right tabular-nums whitespace-nowrap' : c.format === 'date' ? 'whitespace-nowrap' : 'min-w-[7rem]'} ${ci === 0 && !r._style ? 'font-semibold text-slate-800' : ''} ${r._style === 'section' && ci > 0 ? 'text-transparent' : ''}`}
                      >
                        {r._style === 'section' && ci > 0 ? '' : formatValue(r[c.key], c.format)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {table.totals && (
                <tfoot className="border-t-2 border-slate-200 font-bold text-slate-900 bg-slate-50/70">
                  <tr>
                    {table.columns.map((c) => (
                      <td key={c.key} className={`px-4 py-2.5 ${isNumericFormat(c.format) ? 'text-right tabular-nums whitespace-nowrap' : ''}`}>
                        {table.totals[c.key] === undefined ? '' : formatValue(table.totals[c.key], c.format)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {rows.length > fold && !expanded && (
            <div className="px-5 py-3 border-t border-slate-100 text-center print:hidden">
              <button type="button" className={btn('link')} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
                {open ? 'Show fewer' : `Show all ${rows.length} rows`}
                <FontAwesomeIcon icon={faChevronDown} className={`text-[10px] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
