import { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faKey, faMagnifyingGlass, faUsers, faCircleInfo, faChevronLeft, faChevronRight, faRotateLeft, faLaptop, faEnvelopeCircleCheck } from '@fortawesome/free-solid-svg-icons';
import api from '../../api/axiosConfig';
import { apiErrorMessage } from '../../utils/apiError';
import FilterTabs from '../../Components/admin/ui/FilterTabs';
import EmptyState from '../../Components/admin/ui/EmptyState';
import LoadError from '../../Components/admin/ui/LoadError';
import { SkeletonRows } from '../../Components/admin/ui/Skeleton';
import { badge, btn } from '../../Components/admin/ui/styles';
import { SettingsSection, Switch, Callout } from './SettingsSection';

// Settings → Sign-in & Verification (login_otp_settings.php): whether a new
// account must open the emailed verification link before signing in, and the
// emailed 6-digit code a tenant gets when signing in on a device it has not seen. One switch for
// everyone, and a per-account choice that overrides it. The rule itself is in
// backend/api/services/login_otp_policy.php. Saves on each change.
const ENDPOINT = 'login_otp_settings.php';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active tenants' },
  { value: 'past', label: 'Past tenants' },
  { value: 'non_tenant', label: 'Non-tenants' },
  { value: 'custom', label: 'Own setting' },
];

const GROUP_BADGE = {
  active: { tone: 'success', label: 'Active tenant' },
  past: { tone: 'neutral', label: 'Past tenant' },
  non_tenant: { tone: 'info', label: 'Non-tenant' },
};

export default function LoginOtpPanel() {
  const [enabled, setEnabled] = useState(null);
  const [globalBusy, setGlobalBusy] = useState(false);
  const [emailVerification, setEmailVerification] = useState(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState(null); // { tone: 'ok' | 'error', text }
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState(''); // the query after a short pause in typing
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null); // { users, counts, total, per_page }
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [rowBusy, setRowBusy] = useState({});
  const [notice, setNotice] = useState(null); // { tone: 'ok' | 'error', text }
  const [confirmReset, setConfirmReset] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setLoadError(false);
    try {
      const res = await api.get(ENDPOINT, { params: { q: search, filter, page } });
      if (id !== requestId.current) return; // a newer search or page was asked for
      setData(res.data);
      setEnabled(!!res.data.enabled);
      setEmailVerification(res.data.email_verification !== false);
    } catch {
      if (id === requestId.current) setLoadError(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [search, filter, page]);

  useEffect(() => {
    const run = async () => { await load(); };
    run();
  }, [load]);

  // Search 300 ms after the last keystroke, from the first page.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const chooseFilter = (f) => { setFilter(f); setPage(1); };

  const saveGlobal = async (next) => {
    setGlobalBusy(true);
    setNotice(null);
    const before = enabled;
    setEnabled(next);
    try {
      await api.post(ENDPOINT, { action: 'set_global', enabled: next });
      setNotice({ tone: 'ok', text: next ? 'Sign-in codes are on for every account that follows the default.' : 'Sign-in codes are off for every account that follows the default.' });
    } catch (e) {
      setEnabled(before);
      setNotice({ tone: 'error', text: apiErrorMessage(e, 'Could not save the setting.') });
    } finally {
      setGlobalBusy(false);
    }
  };

  const saveEmailVerification = async (next) => {
    setVerifyBusy(true);
    setVerifyNotice(null);
    const before = emailVerification;
    setEmailVerification(next);
    try {
      await api.post(ENDPOINT, { action: 'set_email_verification', enabled: next });
      setVerifyNotice({ tone: 'ok', text: next ? 'New accounts must verify their email before signing in.' : 'New accounts can sign in right after signing up.' });
    } catch (e) {
      setEmailVerification(before);
      setVerifyNotice({ tone: 'error', text: apiErrorMessage(e, 'Could not save the setting.') });
    } finally {
      setVerifyBusy(false);
    }
  };

  const saveUser = async (user, mode) => {
    if (user.mode === mode) return;
    setRowBusy((b) => ({ ...b, [user.id]: true }));
    setNotice(null);
    const patch = (m) => setData((d) => d && ({ ...d, users: d.users.map((u) => (u.id === user.id ? { ...u, mode: m } : u)) }));
    patch(mode);
    try {
      await api.post(ENDPOINT, { action: 'set_user', user_id: user.id, mode });
      // Counts (the "Own setting" chip) and the "Own setting" list may change.
      load();
    } catch (e) {
      patch(user.mode);
      setNotice({ tone: 'error', text: apiErrorMessage(e, `Could not save ${user.name}'s setting.`) });
    } finally {
      setRowBusy((b) => ({ ...b, [user.id]: false }));
    }
  };

  const resetAll = async () => {
    setConfirmReset(false);
    setNotice(null);
    try {
      const res = await api.post(ENDPOINT, { action: 'clear_overrides' });
      setNotice({ tone: 'ok', text: `${res.data.cleared} account${res.data.cleared === 1 ? '' : 's'} back to the default.` });
      load();
    } catch (e) {
      setNotice({ tone: 'error', text: apiErrorMessage(e, 'Could not reset the accounts.') });
    }
  };

  const counts = data?.counts || {};
  const total = data?.total ?? 0;
  const perPage = data?.per_page || 20;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  const defaultLabel = enabled ? 'Default (asks)' : 'Default (no code)';
  const modeOptions = [
    { id: 'default', label: defaultLabel },
    { id: 'on', label: 'Always ask' },
    { id: 'off', label: 'Never ask' },
  ];
  const asks = (mode) => (mode === 'on' ? true : mode === 'off' ? false : !!enabled);

  return (
    <div className="space-y-6">
      <SettingsSection
        icon={faEnvelopeCircleCheck}
        tone="emerald"
        title="Email verification"
        description="A link emailed to a new account, which it opens before its first sign-in."
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="m-0 text-body font-semibold text-slate-800">Require email verification for new accounts</p>
            <p className="m-0 mt-1 text-label text-slate-500">
              When off, no link is sent: a new account can sign in right after signing up, and an account still waiting for its link can sign in too.
            </p>
          </div>
          {emailVerification === null ? (
            <span className="text-label text-slate-400">…</span>
          ) : (
            <div className={`flex items-center gap-2 ${verifyBusy ? 'opacity-60 pointer-events-none' : ''}`}>
              <span className={`text-label font-semibold ${emailVerification ? 'text-indigo-700' : 'text-slate-500'}`}>{emailVerification ? 'On' : 'Off'}</span>
              <Switch checked={emailVerification} onChange={saveEmailVerification} label="Require email verification for new accounts" />
            </div>
          )}
        </div>
        <Callout tone="slate" icon={faCircleInfo}>
          Accounts created while this is off count as verified, so turning it back on does not lock them out.
          Keep it on unless verification emails are not reaching people: it confirms each account belongs to a real, reachable address.
        </Callout>
        {verifyNotice && (
          <p role={verifyNotice.tone === 'error' ? 'alert' : 'status'} className={`m-0 text-label ${verifyNotice.tone === 'error' ? 'text-red-700' : 'text-emerald-700'}`}>
            {verifyNotice.text}
          </p>
        )}
      </SettingsSection>

      <SettingsSection
        icon={faKey}
        tone="amber"
        title="Sign-in codes"
        description="An emailed 6-digit code when a tenant signs in on a device it has not seen before."
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="m-0 text-body font-semibold text-slate-800">Ask for a code on new devices</p>
            <p className="m-0 mt-1 text-label text-slate-500">
              For every account that follows the default. An account set to <strong>Always ask</strong> or <strong>Never ask</strong> below keeps its own choice.
            </p>
          </div>
          {enabled === null ? (
            <span className="text-label text-slate-400">…</span>
          ) : (
            <div className={`flex items-center gap-2 ${globalBusy ? 'opacity-60 pointer-events-none' : ''}`}>
              <span className={`text-label font-semibold ${enabled ? 'text-indigo-700' : 'text-slate-500'}`}>{enabled ? 'On' : 'Off'}</span>
              <Switch checked={enabled} onChange={saveGlobal} label="Ask for a sign-in code on new devices" />
            </div>
          )}
        </div>
        <Callout tone="slate" icon={faCircleInfo}>
          A device that passed the code once is trusted for a year and is not asked again. Administrators are never asked.
          Turning codes off makes a stolen password enough to sign in, so keep it on unless email is not reaching tenants.
        </Callout>
        {notice && (
          <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`m-0 text-label ${notice.tone === 'error' ? 'text-red-700' : 'text-emerald-700'}`}>
            {notice.text}
          </p>
        )}
      </SettingsSection>

      <SettingsSection
        icon={faUsers}
        tone="indigo"
        title="Per account"
        description="Search an account and choose whether it follows the default, is always asked, or is never asked."
        action={counts.custom > 0 && (
          confirmReset ? (
            <div className="flex items-center gap-2">
              <button type="button" className={btn('secondary', 'sm')} onClick={() => setConfirmReset(false)}>Cancel</button>
              <button type="button" className={btn('danger', 'sm')} onClick={resetAll}>Reset {counts.custom}</button>
            </div>
          ) : (
            <button type="button" className={btn('ghost', 'sm')} onClick={() => setConfirmReset(true)}>
              <FontAwesomeIcon icon={faRotateLeft} /> <span className="hidden sm:inline">All back to default</span>
            </button>
          )
        )}
      >
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <label className="relative flex-1 min-w-0">
            <span className="sr-only">Search accounts</span>
            <FontAwesomeIcon icon={faMagnifyingGlass} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-label pointer-events-none" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={100}
              placeholder="Search name, email or unit…"
              className="w-full h-10 pl-10 pr-3 rounded-control border border-slate-300 bg-white text-body text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <FilterTabs
            label="Filter accounts"
            value={filter}
            onChange={chooseFilter}
            options={FILTERS.map((f) => ({ ...f, count: data ? counts[f.value] ?? 0 : undefined }))}
          />
        </div>

        {loadError ? (
          <LoadError title="Couldn't load the accounts" message="The list did not load." onRetry={load} />
        ) : loading && !data ? (
          <SkeletonRows rows={6} cols={3} label="Loading accounts…" />
        ) : data.users.length === 0 ? (
          <EmptyState
            icon={faUsers}
            title={search ? 'No account matches' : 'No accounts here'}
            message={search ? `Nothing in this list matches "${search}".` : 'Choose another filter.'}
          />
        ) : (
          <>
            <ul className={`m-0 p-0 list-none divide-y divide-slate-100 rounded-card border border-slate-200 transition-opacity ${loading ? 'opacity-60' : ''}`}>
              {data.users.map((u) => {
                const g = GROUP_BADGE[u.group];
                const on = asks(u.mode);
                return (
                  <li key={u.id} className="flex flex-col md:flex-row md:items-center gap-3 px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-label font-bold shrink-0" aria-hidden="true">
                        {(u.name || u.email).charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="m-0 text-body font-semibold text-slate-800 truncate">{u.name || u.email}</p>
                        <p className="m-0 text-caption text-slate-500 truncate">{u.email}</p>
                        <p className="m-0 mt-1 flex flex-wrap items-center gap-1.5">
                          <span className={badge(g.tone)}>{g.label}{u.unit ? ` · Unit ${u.unit}` : ''}</span>
                          {u.trusted_devices > 0 && (
                            <span className="text-caption text-slate-500 inline-flex items-center gap-1" title="Devices that passed a code and are not asked again">
                              <FontAwesomeIcon icon={faLaptop} aria-hidden="true" /> {u.trusted_devices} trusted
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 md:justify-end shrink-0">
                      <span className={`text-caption font-semibold whitespace-nowrap ${on ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {on ? 'Asks for a code' : 'No code'}
                      </span>
                      <div
                        role="radiogroup"
                        aria-label={`Sign-in code for ${u.name || u.email}`}
                        className={`inline-flex rounded-control bg-slate-100 p-1 gap-0.5 ${rowBusy[u.id] ? 'opacity-60 pointer-events-none' : ''}`}
                      >
                        {modeOptions.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            role="radio"
                            aria-checked={u.mode === m.id}
                            onClick={() => saveUser(u, m.id)}
                            className={`touch-compact px-2.5 py-1.5 rounded-control border-0 cursor-pointer text-caption font-semibold whitespace-nowrap transition-colors ${
                              u.mode === m.id
                                ? m.id === 'off' ? 'bg-amber-500 text-white shadow-card' : m.id === 'on' ? 'bg-indigo-600 text-white shadow-card' : 'bg-white text-slate-900 shadow-card'
                                : 'bg-transparent text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-3 text-label text-slate-600">
              <span>Showing {from}–{to} of {total}</span>
              {pages > 1 && (
                <div className="flex items-center gap-2">
                  <button type="button" className={btn('secondary', 'sm')} disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                    <FontAwesomeIcon icon={faChevronLeft} />
                  </button>
                  <span>Page {page} of {pages}</span>
                  <button type="button" className={btn('secondary', 'sm')} disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                    <FontAwesomeIcon icon={faChevronRight} />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </SettingsSection>
    </div>
  );
}
