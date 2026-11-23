import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileSignature, faStamp, faCalendarPlus, faClockRotateLeft, faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import api from '../../api/axiosConfig';
import { fileUrl } from '../../api/fileUrl';
import { badge } from './ui/styles';
import LoadError from './ui/LoadError';
import { SkeletonList } from './ui/Skeleton';

// Contracts → a contract's History tab: every contract of the same tenant
// (get_contract_history.php), each split into its rent terms. An extension
// (lease_renewals) ends one term and archives the copies signed for it, so the
// office can open the signed and notarized copy of any earlier term.

const STATUS_TONE = { active: 'success', draft: 'warning', expired: 'neutral', terminated: 'neutral', 'eviction-pending': 'danger' };
const REVIEW_LABEL = { pending: 'To check', accepted: 'Accepted', rejected: 'Sent back' };
const day = (v) => (v ? String(v).slice(0, 10) : '');
const peso = (n) => (n === null || n === undefined ? '' : `₱${Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`);

// Terms of one contract, newest first. renewals come newest first; renewal i
// closed the term that ended on its previousLeaseEnd and archived that term's copies.
function termsOf(c) {
  const r = c.renewals || [];
  const terms = [{
    key: 'current',
    number: r.length + 1,
    start: r[0]?.previousLeaseEnd || c.leaseStart,
    end: c.leaseEnd,
    signed: c.signedLeasePath,
    signedReview: c.signedReview,
    notarized: c.notarizedLeasePath,
    notarizedAt: c.notarizedAt,
    rent: r[0]?.rentAtRenewal ?? c.monthlyRent,
    extension: r[0] || null,
    current: true,
  }];
  r.forEach((ren, i) => {
    terms.push({
      key: `renewal-${ren.id}`,
      number: r.length - i,
      start: r[i + 1]?.previousLeaseEnd || c.leaseStart,
      end: ren.previousLeaseEnd,
      signed: ren.previousSignedLeasePath,
      notarized: ren.previousNotarizedLeasePath,
      rent: ren.previousRent,
      extension: r[i + 1] || null,
      current: false,
    });
  });
  return terms;
}

function FileLink({ path, icon, label }) {
  if (!path) return null;
  return (
    <a
      href={fileUrl(path)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-control border border-slate-200 bg-white px-2.5 py-1 text-caption font-semibold text-indigo-700 no-underline hover:border-indigo-300 hover:bg-indigo-50"
    >
      <FontAwesomeIcon icon={icon} aria-hidden="true" />
      {label}
      <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-[9px] opacity-70" aria-hidden="true" />
    </a>
  );
}

export default function ContractHistory({ contractId }) {
  const [state, setState] = useState({ status: 'loading', contracts: [] });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    api.get('get_contract_history.php', { params: { contractId } })
      .then((res) => { if (alive) setState({ status: res.data?.success ? 'ready' : 'error', contracts: res.data?.contracts || [] }); })
      .catch(() => { if (alive) setState({ status: 'error', contracts: [] }); });
    return () => { alive = false; };
  }, [contractId, tick]);

  if (state.status === 'loading') return <SkeletonList rows={3} label="Loading contract history…" />;
  if (state.status === 'error') {
    return (
      <LoadError
        title="Couldn't load the contract history"
        onRetry={() => { setState({ status: 'loading', contracts: [] }); setTick((n) => n + 1); }}
      />
    );
  }

  const { contracts } = state;
  const termCount = contracts.reduce((n, c) => n + 1 + (c.renewals?.length || 0), 0);

  return (
    <div className="space-y-4">
      <p className="m-0 text-label text-slate-600">
        <FontAwesomeIcon icon={faClockRotateLeft} className="mr-1.5 text-slate-400" aria-hidden="true" />
        {contracts.length} contract{contracts.length === 1 ? '' : 's'} and {termCount} rent term{termCount === 1 ? '' : 's'} for this tenant, newest first.
        Each extension keeps the copies signed for the term it ended.
      </p>

      {contracts.map((c) => {
        const status = String(c.status || '').toLowerCase();
        const isThis = c.id === contractId;
        return (
          <section key={c.id} className={`rounded-card border ${isThis ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-slate-200'} bg-white`}>
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <p className="m-0 text-body font-semibold text-slate-900">
                  <span className="font-mono">{c.id}</span>
                  {c.room && <span className="text-slate-500 font-medium"> · Unit {c.room}</span>}
                </p>
                <p className="m-0 mt-0.5 text-caption text-slate-500">
                  {day(c.leaseStart)} to {day(c.leaseEnd)}
                  {c.generatedAt ? ` · generated ${day(c.generatedAt)}` : ''}
                  {status === 'terminated' && c.terminatedAt ? ` · terminated ${day(c.terminatedAt)}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {isThis && <span className={badge('brand')}>Open now</span>}
                <span className={`${badge(STATUS_TONE[status] || 'neutral')} capitalize`}>{status.replace(/-/g, ' ') || 'unknown'}</span>
              </div>
            </header>

            <ol className="m-0 list-none p-0 divide-y divide-slate-100">
              {termsOf(c).map((t) => (
                <li key={t.key} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="m-0 text-label font-semibold text-slate-800">
                        Term {t.number}{t.number === 1 ? ' (first contract)' : ''}{t.current && (c.renewals?.length || 0) > 0 ? ' (current term)' : ''}
                      </p>
                      <p className="m-0 mt-0.5 text-caption text-slate-500">
                        {day(t.start)} to {day(t.end)}{t.rent ? ` · ${peso(t.rent)} a month` : ''}
                      </p>
                      {t.extension && (
                        <p className="m-0 mt-0.5 inline-flex items-center gap-1 text-caption text-violet-700">
                          <FontAwesomeIcon icon={faCalendarPlus} aria-hidden="true" />
                          Started with a {t.extension.addedMonths}-month extension on {day(t.extension.createdAt)}
                        </p>
                      )}
                    </div>
                    {t.current && t.signed && t.signedReview && REVIEW_LABEL[t.signedReview] && (
                      <span className={badge(t.signedReview === 'accepted' ? 'success' : t.signedReview === 'pending' ? 'warning' : 'danger')}>
                        Signed copy: {REVIEW_LABEL[t.signedReview]}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <FileLink path={t.signed} icon={faFileSignature} label="Signed copy" />
                    <FileLink path={t.notarized} icon={faStamp} label="Notarized copy" />
                    {!t.signed && !t.notarized && (
                      <span className="text-caption text-slate-500">
                        {t.current
                          ? (t.notarizedAt ? `No file uploaded. The notarized copy was received in person on ${day(t.notarizedAt)}.` : 'No signed copy uploaded for this term yet.')
                          : 'No copy was on file when this term was extended.'}
                      </span>
                    )}
                    {t.current && t.notarizedAt && !t.notarized && (t.signed) && (
                      <span className={badge('success')}>Notarized copy received {day(t.notarizedAt)}</span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
