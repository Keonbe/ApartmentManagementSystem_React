import { useState, useEffect, useCallback, useId, useRef } from 'react';
import Header from '../Components/AdminDashboardHeader';
import Sidebar from '../Components/AdminSidebar';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faEye, faExternalLinkAlt, faFilePdf, faSearch, faTimes } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { apiErrorMessage } from '../utils/apiError';
import { RefundForm, RefundTrail, StatusBadge } from '../Components/RefundParts';
import { TYPE_LABELS, GATEWAY_LABELS, peso, when } from '../utils/refundFormat';
import FilterTabs from '../Components/admin/ui/FilterTabs';
import Pagination from '../Components/admin/ui/Pagination';
import { readPageMeta } from '../utils/paging';
import LoadError from '../Components/admin/ui/LoadError';
import InlineAlert from '../Components/InlineAlert';
import { SkeletonCards } from '../Components/admin/ui/Skeleton';
import DepositReviews from '../Components/admin/DepositReviews';
import askConfirm from '../utils/askConfirm';
import { fileUrl } from '../api/fileUrl';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import { LIMITS } from '../utils/validation';
import Modal from '../Components/admin/Modal';
import { btn as adminBtn, INPUT, PANEL, PANEL_HEADER, PANEL_TITLE } from '../Components/admin/ui/styles';

// How a refund can be paid out by hand (update_refund_request.php REFUND_PAYOUT_METHODS).
// Anything but cash needs a reference and a proof file.
const PAYOUT_METHODS = ['GCash', 'Maya', 'Bank transfer', 'Cash', 'Other'];

const FILTERS = ['all', 'Pending Review', 'Info Requested', 'Approved', 'Refunded', 'Rejected', 'Cancelled'];
const PAGE_SIZE = 25; // refund requests per page (get_refund_requests.php ?page=)

export default function AdminRefunds() {
  const [requests, setRequests] = useState([]);
  // The list did not load: shown instead of "No refund requests here."
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState('Pending Review');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [text, setText] = useState({});      // per-request message / reason box
  const [payout, setPayout] = useState({});  // per-request { method, reference, file }
  const [refundAmounts, setRefundAmounts] = useState({});
  const [tenants, setTenants] = useState([]);
  const [newUserId, setNewUserId] = useState('');
  const [tenantSearch, setTenantSearch] = useState('');
  const [tenantPickerOpen, setTenantPickerOpen] = useState(false);
  const [activeTenantIndex, setActiveTenantIndex] = useState(0);
  const [eligible, setEligible] = useState(null);
  // The two lookups behind the new-refund form: a failure must not look like an empty picker.
  const [pickerFailed, setPickerFailed] = useState(false);
  const [pickerError, setPickerError] = useState('');
  const [eligibleFailed, setEligibleFailed] = useState(false);
  const [pickerTry, setPickerTry] = useState(0);
  const [showNew, setShowNew] = useState(false);
  const [previewProof, setPreviewProof] = useState(null);

  // One page of the chosen tab, filtered on the server; `counts` (every status,
  // whatever the tab) label the tabs.
  const [pageChoice, setPageChoice] = useState({ filter, page: 1 });
  const page = pageChoice.filter === filter ? pageChoice.page : 1;
  const setPage = (next) => setPageChoice({ filter, page: next });
  const [pageMeta, setPageMeta] = useState({ total: 0, page: 1, limit: PAGE_SIZE, pages: 1 });
  const [counts, setCounts] = useState(null);
  const requestVersion = useRef(0);
  const tenantPickerRef = useRef(null);
  const tenantListId = useId();

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const res = await api.get('get_refund_requests.php', { params: {
        page,
        limit: PAGE_SIZE,
        ...(filter !== 'all' ? { status: filter } : {}),
      } });
      if (version !== requestVersion.current) return;
      if (res.data.success) {
        setRequests(res.data.requests || []);
        setPageMeta(readPageMeta(res.data, (res.data.requests || []).length));
        setCounts(res.data.counts || null);
        setLoadFailed(false);
      }
      else setLoadFailed(true);
    } catch (err) {
      if (version !== requestVersion.current) return;
      setLoadFailed(true);
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not load refund requests.') });
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!showNew || tenants.length) return undefined;
    let active = true;
    const loadTenants = async () => {
      try {
        const res = await api.get('get_tenants.php');
        if (!res.data?.success) {
          if (active) {
            setPickerError(res.data?.message || 'The server could not load the tenant list.');
            setPickerFailed(true);
          }
          return;
        }
        if (!Array.isArray(res.data.data)) throw new Error('The server returned an invalid tenant list.');
        const seen = new Set();
        const list = res.data.data.filter((t) => t.user_id && !seen.has(t.user_id) && seen.add(t.user_id));
        if (!active) return;
        setTenants(list);
        setPickerError('');
        setPickerFailed(false);
      } catch (err) {
        if (!active) return;
        setPickerError(apiErrorMessage(err, 'Could not load the tenant list.'));
        setPickerFailed(true);
      }
    };
    const timer = window.setTimeout(loadTenants, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [showNew, tenants.length, pickerTry]);

  useEffect(() => {
    if (!tenantPickerOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (tenantPickerRef.current && !tenantPickerRef.current.contains(event.target)) setTenantPickerOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [tenantPickerOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setEligibleFailed(false);
      if (!newUserId) { setEligible(null); return; }
      api.get('get_refund_requests.php', { params: { user_id: newUserId } })
        .then((res) => setEligible(res.data.eligible || { advance: 0, overpayments: [] }))
        .catch(() => { setEligible(null); setEligibleFailed(true); });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [newUserId]);

  useEffect(() => () => {
    if (previewProof?.local) URL.revokeObjectURL(previewProof.url);
  }, [previewProof]);

  const call = async (endpoint, body, okText, done, config) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await api.post(endpoint, body, config);
      setNotice({ ok: !!res.data.success, text: res.data.success ? okText : res.data.message });
      if (res.data.success) { done?.(); await load(); }
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err) });
      // Usually refused because the tenant or another admin changed the
      // request meanwhile: show its current state instead of the stale one.
      await load();
    } finally {
      setBusy(false);
    }
  };

  const act = (r, action, okText, extra = {}) => call('update_refund_request.php',
    { id: r.id, action, message: text[r.id] || '', payout_method: payout[r.id]?.method || '', payout_reference: payout[r.id]?.reference || '', ...(action === 'approve' && refundAmounts[r.id] !== undefined ? { amount: Number(refundAmounts[r.id]) } : {}), ...extra },
    okText, () => setText((p) => ({ ...p, [r.id]: '' })));

  // A payout made by hand goes as a form: the proof is a file.
  const recordPayout = (r) => {
    const p = payout[r.id] || {};
    const form = new FormData();
    form.append('id', r.id);
    form.append('action', 'mark_refunded');
    form.append('message', text[r.id] || '');
    form.append('payout_method', p.method || '');
    form.append('payout_reference', p.reference || '');
    if (p.file) form.append('payout_proof', p.file);
    return call('update_refund_request.php', form, 'Payout recorded.', () => {
      setText((prev) => ({ ...prev, [r.id]: '' }));
      setPayout((prev) => ({ ...prev, [r.id]: {} }));
    }, { headers: { 'Content-Type': 'multipart/form-data' } });
  };

  // Money returns to the payer's own GCash / card / bank through PayMongo.
  const refundOnline = async (r) => {
    if ((await askConfirm(`Refund ${peso(r.amount)} to ${r.tenantName} through PayMongo? This sends the money back and cannot be undone.`, { title: 'Refund through PayMongo', confirmLabel: 'Send refund' }))) {
      act(r, 'mark_refunded', 'Refund sent through PayMongo.', { gateway: true });
    }
  };

  const shown = requests;
  const normalizedTenantSearch = tenantSearch.trim().toLocaleLowerCase();
  const selectedTenant = tenants.find((tenant) => String(tenant.user_id) === String(newUserId)) || null;
  const filteredTenants = normalizedTenantSearch
    ? tenants.filter((tenant) => `${tenant.name || ''} ${tenant.unit || ''}`.toLocaleLowerCase().includes(normalizedTenantSearch))
    : tenants;
  const tenantOptionId = tenantPickerOpen && filteredTenants[activeTenantIndex]
    ? `${tenantListId}-option-${filteredTenants[activeTenantIndex].user_id}`
    : undefined;
  const chooseTenant = (tenant) => {
    if (!tenant) return;
    setNewUserId(String(tenant.user_id));
    setTenantSearch('');
    setTenantPickerOpen(false);
  };
  const handleTenantPickerKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setTenantPickerOpen(true);
      if (!filteredTenants.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveTenantIndex((index) => (index + step + filteredTenants.length) % filteredTenants.length);
    } else if (event.key === 'Enter' && tenantPickerOpen && filteredTenants[activeTenantIndex]) {
      event.preventDefault();
      chooseTenant(filteredTenants[activeTenantIndex]);
    } else if (event.key === 'Escape' && tenantPickerOpen) {
      event.preventDefault();
      setTenantPickerOpen(false);
    }
  };
  const previewSelectedProof = (r, file) => {
    if (!file) return;
    setPreviewProof({
      url: URL.createObjectURL(file),
      fileName: file.name,
      title: `Payout proof · ${r.tenantName} · Request #${r.id}`,
      local: true,
    });
  };

  const previewStoredProof = (r) => setPreviewProof({
    url: fileUrl(r.payoutProofPath),
    fileName: r.payoutProofPath,
    title: `Payout proof · ${r.tenantName} · Request #${r.id}`,
  });

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden bg-slate-50 text-left font-sans">
        <Header title="Refund Requests" />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl space-y-6">
            <p className="m-0 max-w-5xl text-body leading-relaxed text-slate-500">Advance rent, overpayments, rejected charges and returned security deposits. A deposit refund is opened by move-out clearance and is due within the refund period in Settings. Approving a request does not move money. Online payments can be returned through PayMongo; other refunds are paid by hand and recorded here.</p>

            {notice && <div role="status" className={`rounded-control border p-3 text-body font-semibold ${notice.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{notice.text}</div>}

            <DepositReviews onChanged={load} />

            <div className="flex flex-wrap items-center gap-2">
              <FilterTabs
                label="Filter refund requests by status"
                value={filter}
                onChange={setFilter}
                options={FILTERS.map(f => ({ value: f, label: f === 'all' ? 'All' : f, count: !counts ? null : (counts[f] ?? 0) }))}
              />
              <button type="button" onClick={() => setShowNew((v) => !v)} className={`${adminBtn(showNew ? 'secondary' : 'primary', 'sm')} ml-auto`}>
                {showNew ? 'Close' : 'Open a request for a tenant'}
              </button>
            </div>

            {showNew && (
              <section className={`${PANEL} space-y-3 p-4 sm:p-5`}>
                <div className="space-y-1.5">
                  <label htmlFor="refund-tenant-search" className="block text-label font-bold text-slate-600">Tenant</label>
                  <div ref={tenantPickerRef} className="relative">
                    <div className={`flex w-full items-center gap-2 rounded-control border bg-white px-3 py-2.5 transition-colors focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 ${pickerFailed && !tenants.length ? 'border-rose-400' : 'border-slate-200'}`}>
                      <FontAwesomeIcon icon={faSearch} aria-hidden="true" className="shrink-0 text-sm text-slate-400" />
                      <input
                        id="refund-tenant-search"
                        type="text"
                        role="combobox"
                        maxLength={LIMITS.search}
                        autoComplete="off"
                        aria-autocomplete="list"
                        aria-expanded={tenantPickerOpen}
                        aria-controls={tenantListId}
                        aria-activedescendant={tenantOptionId}
                        aria-label="Choose a tenant by name or unit"
                        value={tenantPickerOpen || !selectedTenant ? tenantSearch : `${selectedTenant.name} · ${selectedTenant.unit}`}
                        onFocus={() => setTenantPickerOpen(true)}
                        onClick={() => {
                          if (selectedTenant && !tenantPickerOpen) setTenantSearch('');
                          setTenantPickerOpen(true);
                        }}
                        onChange={(event) => {
                          setTenantSearch(event.target.value);
                          setNewUserId('');
                          setActiveTenantIndex(0);
                          setTenantPickerOpen(true);
                        }}
                        onKeyDown={handleTenantPickerKeyDown}
                        placeholder="Choose a tenant"
                        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-body text-slate-800 outline-none focus-visible:outline-none focus-visible:ring-0 placeholder:text-slate-400"
                      />
                      {tenantSearch && tenantPickerOpen ? (
                        <button type="button" aria-label="Clear tenant search" onClick={() => { setTenantSearch(''); setActiveTenantIndex(0); }}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-slate-400 hover:text-slate-700 cursor-pointer">
                          <FontAwesomeIcon icon={faTimes} />
                        </button>
                      ) : (
                        <button type="button" aria-label={tenantPickerOpen ? 'Close tenant options' : 'Show tenant options'} onClick={() => {
                          if (tenantPickerOpen) setTenantPickerOpen(false);
                          else { setTenantSearch(''); setTenantPickerOpen(true); }
                        }} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-slate-400 hover:text-slate-700 cursor-pointer">
                          <FontAwesomeIcon icon={faChevronDown} className={`text-xs transition-transform ${tenantPickerOpen ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>
                    {tenantPickerOpen && (
                      <ul id={tenantListId} role="listbox" aria-label="Tenant accounts" className="absolute left-0 right-0 top-full z-30 m-0 mt-1.5 max-h-64 list-none overflow-y-auto rounded-card border border-slate-200 bg-white p-1 shadow-raised">
                        {filteredTenants.length === 0 ? (
                          <li className="px-3 py-3 text-label text-slate-500">
                            {tenants.length ? `No tenants match “${tenantSearch.trim()}”.` : pickerFailed ? 'Tenant list could not load. Try again below.' : 'No tenant accounts were found.'}
                          </li>
                        ) : filteredTenants.map((tenant, index) => (
                          <li
                            key={tenant.user_id}
                            id={`${tenantListId}-option-${tenant.user_id}`}
                            role="option"
                            aria-selected={String(tenant.user_id) === String(newUserId)}
                            onMouseEnter={() => setActiveTenantIndex(index)}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => chooseTenant(tenant)}
                            className={`flex cursor-pointer items-center justify-between gap-3 rounded-control px-3 py-2 text-body ${index === activeTenantIndex ? 'bg-indigo-50 text-indigo-900' : 'text-slate-800 hover:bg-slate-50'}`}
                          >
                            <span className="min-w-0 truncate">{tenant.name}</span>
                            <span className="shrink-0 rounded bg-indigo-50 px-2 py-0.5 text-caption font-bold text-indigo-700">Unit {tenant.unit}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                {pickerFailed && !tenants.length && (
                  <InlineAlert>{pickerError || "Couldn't load the tenant list."} <button type="button" onClick={() => setPickerTry((n) => n + 1)} className="cursor-pointer border-0 bg-transparent p-0 font-bold text-current underline">Try again</button></InlineAlert>
                )}
                {!pickerFailed && !tenants.length && <p className="m-0 text-label text-slate-500">No tenant accounts were found.</p>}
                {eligibleFailed && (
                  <InlineAlert>Couldn't load what this tenant can be refunded. Pick the tenant again to retry.</InlineAlert>
                )}
                {eligible && (
                  <RefundForm eligible={eligible} busy={busy}
                    onSubmit={(body, reset) => call('create_refund_request.php', { ...body, user_id: Number(newUserId) }, 'Refund request opened.', () => { reset(); setNewUserId(''); })} />
                )}
              </section>
            )}

            {loading ? <SkeletonCards count={3} className="space-y-3" label="Loading refund requests…" />
              : loadFailed && requests.length === 0 ? (
              <div className={PANEL}><LoadError title="Couldn't load refund requests" onRetry={() => { setLoading(true); load(); }} /></div>
            ) : shown.length === 0 ? (
              <p className={`${PANEL} m-0 p-8 text-center text-body text-slate-500`}>
                No refund requests here.
              </p>
            ) : shown.map((r) => (
              <article key={r.id} className={`${PANEL} overflow-hidden`}>
                <div className={PANEL_HEADER}>
                  <div className="min-w-0">
                    <h3 className={PANEL_TITLE}>{r.tenantName}{r.roomName ? ` · Unit ${r.roomName}` : ''}</h3>
                    <p className="m-0 mt-1 text-label text-slate-500">#{r.id} · {TYPE_LABELS[r.type]}{r.invoiceId ? ` (${r.invoiceId})` : ''} · {when(r.createdAt)}{r.origin === 'cancelled_by_tenant' ? ` · Opened by tenant: ${r.tenantName}` : r.origin === 'rejected_by_admin' ? ' · Opened by admin' : r.raisedByRole === 'admin' ? ' · Opened by admin' : ''}{r.dueDate && ['Pending Review', 'Info Requested', 'Approved'].includes(r.status) ? ` · due ${r.dueDate}${r.overdue ? ' (OVERDUE)' : ''}` : ''}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                    <p className="m-0 text-title font-bold tabular-nums text-slate-900">{peso(r.amount)}</p>
                    <StatusBadge status={r.status} />
                  </div>
                </div>
                <div className="space-y-4 p-4 sm:p-5">
                {(r.origin === 'cancelled_by_tenant' || r.origin === 'cancelled_by_admin' || r.origin === 'rejected_by_admin') && (
                  <div className="flex flex-wrap gap-2">
                    {r.origin === 'cancelled_by_tenant' && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-caption font-bold text-amber-900">Application cancelled by applicant</span>}
                    {r.origin === 'cancelled_by_admin' && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-caption font-bold text-amber-900">Cancelled by management at tenant&apos;s request</span>}
                    {r.origin === 'rejected_by_admin' && <span className="rounded-full bg-rose-100 px-2.5 py-1 text-caption font-bold text-rose-900">Application rejected by admin</span>}
                  </div>
                )}
                <p className="m-0 whitespace-pre-wrap text-body leading-relaxed text-slate-700">{r.reason}</p>
                {r.type === 'rejected_application' && r.paidAmount != null && (
                  <section className="mt-3 rounded-control border border-indigo-100 bg-indigo-50 p-3 text-label text-indigo-900" aria-label="Refund calculation breakdown">
                    <p className="m-0 font-bold text-indigo-950">Move-in payment breakdown</p>
                    <dl className="m-0 mt-2 grid grid-cols-2 gap-y-1">
                      <dt>Total paid</dt><dd className="m-0 text-right font-semibold">{peso(r.paidAmount)}</dd>
                      <dt>Security deposit portion (refundable before move-in)</dt><dd className="m-0 text-right font-semibold">{peso(r.depositAmount || 0)}</dd>
                      <dt>Eligible refund (management review)</dt><dd className="m-0 text-right font-bold">{peso(r.amount)}</dd>
                    </dl>
                  </section>
                )}
                {r.payoutDestination && <p className="m-0 mt-2 rounded-control bg-amber-50 p-3 text-label text-amber-900"><strong>Tenant payout destination:</strong> {r.payoutDestination}</p>}
                {r.status === 'Refunded' && (
                  <div className="flex flex-wrap items-center gap-2 rounded-control border border-emerald-200 bg-emerald-50 px-3 py-2 text-label text-emerald-900">
                    <span><strong>Paid out via {r.payoutMethod}</strong>{r.payoutReference ? ` · Ref ${r.payoutReference}` : ''}.{r.gatewayStatus ? ` ${GATEWAY_LABELS[r.gatewayStatus] || r.gatewayStatus}.` : ''}</span>
                    {r.payoutProofPath && <button type="button" onClick={() => previewStoredProof(r)} className={adminBtn('secondary', 'sm')}><FontAwesomeIcon icon={faEye} /> View payout proof</button>}
                  </div>
                )}
                <RefundTrail events={r.events} />

                {(r.status === 'Pending Review') && (
                  <div className="mt-4 space-y-2">
                    {r.type === 'rejected_application' && <label className="block text-label font-bold text-slate-600">Final refund amount (max {peso(r.paidAmount ?? r.amount)})
                      <input aria-label={`Final refund amount for request ${r.id}`} type="number" min="0.01" step="0.01" max={r.paidAmount ?? r.amount} value={refundAmounts[r.id] ?? r.amount}
                        onChange={(e) => setRefundAmounts((p) => ({ ...p, [r.id]: e.target.value }))} className={`${INPUT} mt-1 max-w-xs`} />
                    </label>}
                    <label className="block text-label font-bold text-slate-600">Message to tenant
                      <textarea rows={2} maxLength={1000} value={text[r.id] || ''} placeholder="Your question, or the reason for rejecting"
                        onChange={(e) => setText((p) => ({ ...p, [r.id]: e.target.value }))} className={`${INPUT} mt-1 h-auto min-h-20 py-2 font-normal`} />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy || (r.type === 'rejected_application' && (!(Number(refundAmounts[r.id] ?? r.amount) > 0) || Number(refundAmounts[r.id] ?? r.amount) > Number(r.paidAmount ?? r.amount)))} onClick={() => act(r, 'approve', 'Refund approved.')} className={adminBtn('success', 'sm')}>Approve</button>
                      <button type="button" disabled={busy || !(text[r.id] || '').trim()} title="Sends your message to the tenant and pauses this request until they reply."
                        onClick={() => act(r, 'request_info', 'Question sent to the tenant.')} className={adminBtn('secondary', 'sm', 'text-sky-700')}>Ask tenant a question</button>
                      <button type="button" disabled={busy || !(text[r.id] || '').trim()} onClick={() => act(r, 'reject', 'Refund rejected.')} className={adminBtn('danger-outline', 'sm')}>Reject</button>
                    </div>
                    <p className="m-0 text-label text-slate-500"><strong>Ask tenant a question:</strong> sends your message and waits for their reply. <strong>Reject:</strong> sends your message as the reason and closes the request.</p>
                  </div>
                )}
                {r.status === 'Info Requested' && (
                  <p className="m-0 mt-3 text-body font-semibold text-sky-700">Waiting for the tenant's reply.</p>
                )}
                {r.status === 'Approved' && r.canRefundOnline && r.gatewayStatus !== 'requesting' && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button type="button" disabled={busy} onClick={() => refundOnline(r)} className={adminBtn('success', 'sm')}>Refund {peso(r.amount)} through PayMongo</button>
                    <span className="text-label text-slate-500">This was paid online, so it goes back to the payer's own account. Or record a payout made by hand:</span>
                  </div>
                )}
                {r.status === 'Approved' && (
                  <section aria-label="Record payout" className="space-y-3 rounded-control border border-slate-200 bg-slate-50 p-3 sm:p-4">
                    <div>
                      <h4 className="m-0 text-body font-semibold text-slate-800">Record a manual payout</h4>
                      <p className="m-0 mt-0.5 text-caption text-slate-500">Enter how it was paid. Attach a receipt or transfer screenshot so the payout can be checked later.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block text-label font-medium text-slate-600">Payout method
                        <select aria-label={`Payout method for request ${r.id}`} value={payout[r.id]?.method || ''}
                          onChange={(e) => setPayout((p) => ({ ...p, [r.id]: { ...p[r.id], method: e.target.value } }))} className={`${INPUT} mt-1`}>
                          <option value="">Choose a method</option>
                          {PAYOUT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </label>
                      <label className="block text-label font-medium text-slate-600">{payout[r.id]?.method === 'Cash' ? 'Receipt number (optional)' : 'Payout reference'}
                        <input aria-label={`Payout reference for request ${r.id}`} placeholder={payout[r.id]?.method === 'Cash' ? 'Receipt number' : 'Enter the transfer reference'} maxLength={100} value={payout[r.id]?.reference || ''}
                          onChange={(e) => setPayout((p) => ({ ...p, [r.id]: { ...p[r.id], reference: e.target.value } }))} className={`${INPUT} mt-1`} />
                      </label>
                      <div className="sm:col-span-2">
                        <label className="block text-label font-medium text-slate-600">
                          Proof of payout {payout[r.id]?.method === 'Cash' ? '(optional for cash)' : '(required)'}
                          <input type="file" accept={acceptFor(FILE_RULES.paymentProof)} className="mt-1 block min-h-11 w-full rounded-control border border-slate-300 bg-white px-3 py-2 text-label text-slate-700 file:mr-3 file:rounded-control file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-label file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              const problem = file ? checkFile(file, FILE_RULES.paymentProof) : '';
                              if (problem) {
                                setNotice({ ok: false, text: problem });
                                setPayout((p) => ({ ...p, [r.id]: { ...p[r.id], file: null } }));
                                e.target.value = '';
                                return;
                              }
                              setPayout((p) => ({ ...p, [r.id]: { ...p[r.id], file } }));
                            }} />
                        </label>
                        {payout[r.id]?.file && (
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-control border border-slate-200 bg-white px-3 py-2">
                            <span className="flex min-w-0 items-center gap-2 text-label font-medium text-slate-700">
                              <FontAwesomeIcon icon={payout[r.id].file.type === 'application/pdf' ? faFilePdf : faEye} className="shrink-0 text-indigo-600" />
                              <span className="break-all">{payout[r.id].file.name}</span>
                            </span>
                            <button type="button" onClick={() => previewSelectedProof(r, payout[r.id].file)} className={adminBtn('secondary', 'sm')}>
                              <FontAwesomeIcon icon={faEye} /> Preview file
                            </button>
                          </div>
                        )}
                      </div>
                      <button type="button"
                        disabled={busy || !payout[r.id]?.method || (payout[r.id].method !== 'Cash' && (!payout[r.id]?.reference?.trim() || !payout[r.id]?.file))}
                        onClick={() => recordPayout(r)} className={adminBtn('primary', 'sm', 'sm:col-span-2 sm:w-fit')}>Record payout</button>
                    </div>
                  </section>
                )}
                </div>
              </article>
            ))}
            {!loading && <Pagination page={pageMeta.page} pages={pageMeta.pages} total={pageMeta.total} limit={pageMeta.limit} onPage={setPage} noun="refund requests" className="rounded-card border border-slate-200 bg-white" />}
          </div>
        </main>
      </div>
      {previewProof && (
        <Modal
          title={previewProof.title}
          onClose={() => setPreviewProof(null)}
          overlayClassName="flex items-center justify-center bg-black/60 p-4"
          className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-dialog bg-white shadow-dialog"
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <h2 className="m-0 truncate text-body font-semibold text-slate-900">{previewProof.title}</h2>
              <p className="m-0 mt-0.5 break-all text-caption text-slate-500">{previewProof.fileName}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a href={previewProof.url} target="_blank" rel="noreferrer" className={adminBtn('secondary', 'sm')}>
                <FontAwesomeIcon icon={faExternalLinkAlt} /> Open file
              </a>
              <button type="button" onClick={() => setPreviewProof(null)} aria-label="Close file preview" className={adminBtn('ghost', 'sm', 'h-8 w-8 px-0')}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-100 p-3 sm:p-5">
            {String(previewProof.fileName || '').split('?')[0].toLowerCase().endsWith('.pdf') ? (
              <iframe src={previewProof.url} title={previewProof.title} className="h-[72vh] w-full rounded-control border-0 bg-white shadow-card" />
            ) : (
              <img src={previewProof.url} alt={previewProof.fileName} className="max-h-[72vh] max-w-full rounded-control border border-slate-200 bg-white object-contain shadow-card" />
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
