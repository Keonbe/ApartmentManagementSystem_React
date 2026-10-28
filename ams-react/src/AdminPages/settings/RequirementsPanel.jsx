import { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUp, faArrowDown } from '@fortawesome/free-solid-svg-icons';
import api from '../../api/axiosConfig';
import { apiErrorMessage } from '../../utils/apiError';
import { checkText } from '../../utils/validation';
import useFieldErrors from '../../hooks/useFieldErrors';
import FieldError from '../../Components/form/FieldError';

// Mirrors manage_application_requirements.php.
const REQUIREMENT_LIMITS = { labelMin: 2, labelMax: 60, maxActive: 12 };
const EMPTY = { label: '', label_fil: '', is_required: true };
const ENDPOINT = 'manage_application_requirements.php';

// Settings → Application Requirements: the documents an applicant uploads on
// the rent application. The form and the admin screens follow this list; the
// approval check needs every active, required one. There is no delete: an
// inactive requirement keeps the documents already uploaded for it.
export default function RequirementsPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const activeCount = items.filter((r) => r.is_active).length;
  const sameName = (label, exceptId) => items.some((r) => r.is_active && r.id !== exceptId && r.label.trim().toLowerCase() === label.trim().toLowerCase());

  const form = useFieldErrors({
    label: (v, vals) => checkText(v, { label: 'Document name', min: REQUIREMENT_LIMITS.labelMin, max: REQUIREMENT_LIMITS.labelMax })
      || (sameName(String(v ?? ''), vals.id) ? 'A requirement with this name already exists.' : ''),
    label_fil: (v) => checkText(v, { label: 'Filipino name', max: REQUIREMENT_LIMITS.labelMax, required: false }),
  }, { idPrefix: 'req-' });

  const load = useCallback(async () => {
    try {
      const res = await api.get('get_application_requirements.php', { params: { all: 1 } });
      setItems(res.data?.requirements || []);
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not load the application requirements.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Every action returns the fresh list, so the table never shows stale rows.
  const send = async (body, okText) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await api.post(ENDPOINT, body);
      if (!res.data?.success) throw res;
      setItems(res.data.requirements || []);
      setNotice({ ok: true, text: okText || res.data.message });
      return true;
    } catch (err) {
      if (!form.applyServerErrors(err)) setNotice({ ok: false, text: apiErrorMessage(err, 'Could not save the requirement.') });
      await load();
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openAdd = () => {
    form.setErrors({});
    if (activeCount >= REQUIREMENT_LIMITS.maxActive) {
      setNotice({ ok: false, text: `At most ${REQUIREMENT_LIMITS.maxActive} requirements can be active. Deactivate one first.` });
      return;
    }
    setEditing({ ...EMPTY });
  };

  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    const values = { ...editing, label: editing.label.trim(), label_fil: (editing.label_fil || '').trim() };
    setEditing(values);
    if (!form.validateAll(values)) return;
    const body = { label: values.label, label_fil: values.label_fil || null, is_required: !!values.is_required };
    const ok = values.id
      ? await send({ action: 'update', id: values.id, ...body })
      : await send({ action: 'create', ...body });
    if (ok) setEditing(null);
  };

  const toggleRequired = (r) => send({ action: 'update', id: r.id, label: r.label, is_required: !r.is_required },
    `"${r.label}" is now ${r.is_required ? 'optional' : 'required'}.`);

  const toggleActive = (r) => {
    if (!r.is_active) {
      if (activeCount >= REQUIREMENT_LIMITS.maxActive) {
        setNotice({ ok: false, text: `At most ${REQUIREMENT_LIMITS.maxActive} requirements can be active. Deactivate one first.` });
        return;
      }
      if (sameName(r.label, r.id)) {
        setNotice({ ok: false, text: `An active requirement named "${r.label}" already exists. Rename one first.` });
        return;
      }
    }
    send({ action: r.is_active ? 'deactivate' : 'activate', id: r.id });
  };

  const move = (index, delta) => {
    const next = [...items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    send({ action: 'reorder', ids: next.map((r) => r.id) }, 'Order saved.');
  };

  const btn = 'cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="min-w-0">
          <h3 className="m-0 text-base font-extrabold text-slate-800">Application Requirements</h3>
          <p className="m-0 mt-1 text-sm text-slate-500">
            The documents an applicant uploads with the rent application. An application can be approved only when every active, required document is on file. {activeCount} of {REQUIREMENT_LIMITS.maxActive} active.
          </p>
        </div>
        <button type="button" disabled={busy} onClick={openAdd} className="cursor-pointer rounded-xl border-0 bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60">Add requirement</button>
      </div>

      {notice && <p role={notice.ok ? 'status' : 'alert'} className={`m-0 rounded-xl p-3 text-sm ${notice.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{notice.text}</p>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-160 text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>{['Order', 'Document', 'Filipino name', 'Required', 'Status', ''].map((h) => <th key={h} className="px-4 py-3 font-bold">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-500">No requirements yet. Applicants will not be asked for any document.</td></tr>
            ) : items.map((r, i) => (
              <tr key={r.id} className={r.is_active ? '' : 'bg-slate-50/60 text-slate-500'}>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button type="button" aria-label={`Move ${r.label} up`} disabled={busy || i === 0} onClick={() => move(i, -1)} className={btn}><FontAwesomeIcon icon={faArrowUp} /></button>
                    <button type="button" aria-label={`Move ${r.label} down`} disabled={busy || i === items.length - 1} onClick={() => move(i, 1)} className={btn}><FontAwesomeIcon icon={faArrowDown} /></button>
                  </div>
                </td>
                <td className="px-4 py-3 font-bold text-slate-800">{r.label}</td>
                <td className="px-4 py-3 text-slate-600">{r.label_fil || <span className="text-slate-500">—</span>}</td>
                <td className="px-4 py-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                    <input type="checkbox" checked={!!r.is_required} disabled={busy} onChange={() => toggleRequired(r)} className="h-4 w-4 accent-indigo-600" />
                    {r.is_required ? 'Required' : 'Optional'}
                  </label>
                </td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${r.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{r.is_active ? 'Active' : 'Inactive'}</span></td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => { form.setErrors({}); setEditing({ ...r, label_fil: r.label_fil || '' }); }} className={btn}>Edit</button>
                    <button type="button" disabled={busy} onClick={() => toggleActive(r)} className={btn}>{r.is_active ? 'Deactivate' : 'Activate'}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 text-xs text-slate-500">Deactivating removes a document from the form and from the approval check; files applicants already uploaded for it are kept and stay visible on their application.</p>

      {editing && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setEditing(null); }}>
          <form onSubmit={save} noValidate className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="m-0 text-lg font-extrabold text-slate-800">{editing.id ? 'Edit requirement' : 'Add requirement'}</h3>
            <div>
              <label htmlFor="req-label" className="block text-sm font-semibold text-slate-700">Document name</label>
              <input
                {...form.fieldA11y('label')}
                maxLength={REQUIREMENT_LIMITS.labelMax}
                placeholder="e.g. Proof of income"
                value={editing.label}
                onChange={(e) => { setEditing({ ...editing, label: e.target.value }); form.clearError('label'); }}
                onBlur={() => form.validateField('label', editing)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
              />
              <FieldError id="req-label" error={form.errors.label} />
            </div>
            <div>
              <label htmlFor="req-label_fil" className="block text-sm font-semibold text-slate-700">Filipino name <span className="font-normal text-slate-500">(Optional)</span></label>
              <input
                {...form.fieldA11y('label_fil')}
                maxLength={REQUIREMENT_LIMITS.labelMax}
                value={editing.label_fil}
                onChange={(e) => { setEditing({ ...editing, label_fil: e.target.value }); form.clearError('label_fil'); }}
                onBlur={() => form.validateField('label_fil', editing)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
              />
              <FieldError id="req-label_fil" error={form.errors.label_fil} />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={!!editing.is_required} onChange={(e) => setEditing({ ...editing, is_required: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
              Required to submit and approve an application
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" disabled={busy} onClick={() => setEditing(null)} className="cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="submit" disabled={busy} className="cursor-pointer rounded-lg border-0 bg-indigo-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
