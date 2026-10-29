import { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUp, faArrowDown } from '@fortawesome/free-solid-svg-icons';
import api from '../../api/axiosConfig';
import { apiErrorMessage } from '../../utils/apiError';
import { checkText } from '../../utils/validation';
import useFieldErrors from '../../hooks/useFieldErrors';
import FieldError from '../../Components/form/FieldError';
import Modal from '../../Components/admin/Modal';
import { TH, THEAD, btn } from '../../Components/admin/ui/styles';
import { SkeletonRows } from '../../Components/admin/ui/Skeleton';

// Mirrors manage_application_requirements.php.
const REQUIREMENT_LIMITS = { labelMin: 2, labelMax: 60, maxActive: 12 };
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

  const save = async (e) => {
    e.preventDefault();
    if (busy || !editing?.id) return;
    const values = { ...editing, label: editing.label.trim(), label_fil: (editing.label_fil || '').trim() };
    setEditing(values);
    if (!form.validateAll(values)) return;
    const body = { label: values.label, label_fil: values.label_fil || null, is_required: !!values.is_required };
    const ok = await send({ action: 'update', id: values.id, ...body });
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

  const rowBtn = 'cursor-pointer rounded-control border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-slate-200 bg-white p-6 shadow-card">
        <div className="min-w-0 max-w-2xl">
          <div className="flex items-center gap-2.5 mb-1">
            <h3 className="m-0 text-title font-bold text-slate-800">Application Document Requirements</h3>
            <span className={`px-2.5 py-0.5 rounded-full text-caption font-bold ${activeCount > 0 ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'}`}>
              {activeCount} of {items.length} Enabled
            </span>
          </div>
          <p className="m-0 text-body text-slate-500 leading-relaxed font-normal">
            Toggle which verification documents applicants must upload during rent onboarding. When disabled, applicants are not asked for that document.
          </p>
        </div>
      </div>

      {notice && <p role={notice.ok ? 'status' : 'alert'} className={`m-0 rounded-card p-3.5 text-body font-semibold ${notice.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{notice.text}</p>}

      {activeCount === 0 && !loading && items.length > 0 && (
        <div className="p-4 rounded-card bg-amber-50 border border-amber-200 text-amber-800 text-label font-semibold flex items-center justify-between gap-3">
          <span>⚠️ All document requirements are currently disabled. Tenants will not be asked for any verification documents on their rent application.</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-card border border-slate-200 bg-white shadow-card">
        <table className="w-full min-w-160 text-left text-body">
          <thead className={THEAD}>
            <tr>{['Order', 'Document Name', 'Filipino Name', 'Obligation', 'Active Toggle', 'Actions'].map((h) => <th key={h} className={TH}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <SkeletonRows cols={6} rows={3} label="Loading requirements…" />
            ) : items.length === 0 ? (
              <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-500 font-medium">No requirements yet. Applicants will not be asked for any document.</td></tr>
            ) : items.map((r, i) => (
              <tr key={r.id} className={`transition-colors ${r.is_active ? 'hover:bg-slate-50/70' : 'bg-slate-50/40 text-slate-500 hover:bg-slate-100/50'}`}>
                <td className="px-4 py-3.5">
                  <div className="flex gap-1">
                    <button type="button" aria-label={`Move ${r.label} up`} disabled={busy || i === 0} onClick={() => move(i, -1)} className={rowBtn}><FontAwesomeIcon icon={faArrowUp} /></button>
                    <button type="button" aria-label={`Move ${r.label} down`} disabled={busy || i === items.length - 1} onClick={() => move(i, 1)} className={rowBtn}><FontAwesomeIcon icon={faArrowDown} /></button>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <span className={`font-bold ${r.is_active ? 'text-slate-900' : 'text-slate-500'}`}>{r.label}</span>
                </td>
                <td className="px-4 py-3.5 text-slate-600 font-medium">{r.label_fil || <span className="text-slate-400">—</span>}</td>
                <td className="px-4 py-3.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={r.is_required}
                    disabled={busy}
                    onClick={() => toggleRequired(r)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-bold transition-all cursor-pointer border ${
                      r.is_required
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                        : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                    }`}
                    title={r.is_required ? 'Click to make optional' : 'Click to make required'}
                  >
                    <span className={`w-2 h-2 rounded-full ${r.is_required ? 'bg-indigo-600' : 'bg-slate-400'}`} />
                    <span>{r.is_required ? 'Required' : 'Optional'}</span>
                  </button>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={r.is_active}
                      disabled={busy}
                      onClick={() => toggleActive(r)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        r.is_active ? 'bg-emerald-500' : 'bg-slate-300'
                      } ${busy ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={r.is_active ? 'Click to disable' : 'Click to enable'}
                    >
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-card transition duration-200 ease-in-out ${
                          r.is_active ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <span className={`text-label font-bold ${r.is_active ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {r.is_active ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => { form.setErrors({}); setEditing({ ...r, label_fil: r.label_fil || '' }); }} className={rowBtn}>Edit</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="m-0 text-label text-slate-500">Disabling a document requirement removes it from the user rent application form. Any files previously uploaded by applicants for that document remain safely stored in the database.</p>

      {editing && (
        <Modal title="Edit requirement" onClose={() => setEditing(null)} busy={busy} as="form" onSubmit={save} noValidate overlayClassName="flex items-center justify-center bg-slate-950/55 p-4" className="w-full max-w-md space-y-4 rounded-card bg-white p-6 shadow-dialog">
            <h3 className="m-0 text-title font-bold text-slate-800">Edit requirement</h3>
            <div>
              <label htmlFor="req-label" className="block text-body font-semibold text-slate-700">Document name</label>
              <input
                {...form.fieldA11y('label')}
                maxLength={REQUIREMENT_LIMITS.labelMax}
                placeholder="e.g. Proof of income"
                value={editing.label}
                onChange={(e) => { setEditing({ ...editing, label: e.target.value }); form.clearError('label'); }}
                onBlur={() => form.validateField('label', editing)}
                className="mt-1 w-full rounded-control border border-slate-300 px-3 py-2 font-normal"
              />
              <FieldError id="req-label" error={form.errors.label} />
            </div>
            <div>
              <label htmlFor="req-label_fil" className="block text-body font-semibold text-slate-700">Filipino name <span className="font-normal text-slate-500">(Optional)</span></label>
              <input
                {...form.fieldA11y('label_fil')}
                maxLength={REQUIREMENT_LIMITS.labelMax}
                value={editing.label_fil}
                onChange={(e) => { setEditing({ ...editing, label_fil: e.target.value }); form.clearError('label_fil'); }}
                onBlur={() => form.validateField('label_fil', editing)}
                className="mt-1 w-full rounded-control border border-slate-300 px-3 py-2 font-normal"
              />
              <FieldError id="req-label_fil" error={form.errors.label_fil} />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-body font-semibold text-slate-700">
              <input type="checkbox" checked={!!editing.is_required} onChange={(e) => setEditing({ ...editing, is_required: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
              Required to submit and approve an application
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" disabled={busy} onClick={() => setEditing(null)} className={btn('secondary', 'md')}>Cancel</button>
              <button type="submit" disabled={busy} className={btn('primary', 'md')}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
        </Modal>
      )}
    </section>
  );
}
