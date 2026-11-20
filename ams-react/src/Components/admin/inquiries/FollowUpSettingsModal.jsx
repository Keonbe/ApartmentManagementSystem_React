import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear, faTimes } from '@fortawesome/free-solid-svg-icons';
import api from '../../../api/axiosConfig';
import { apiErrorMessage } from '../../../utils/apiError';
import { getSystemSettings } from '../../../config/systemSettings';
import Modal from '../Modal';
import { btn } from '../ui/styles';

// Inquiries → the gear: how long a quiet conversation waits before it finishes
// itself (backend/followups.php, run when Inquiries loads and by the daily cron).
//   inquiry_auto_close_days      an inquiry the office opened that waits on the
//                                prospect (New or Contacted) and saw no message or
//                                change in that many days is Closed
//   complaint_auto_resolve_days  a problem report the office answered last, left
//                                by the tenant that many days, is Resolved
// 0 = never. Only these two keys are posted (update_system_settings.php, 0-365).
const FIELDS = [
  {
    key: 'inquiry_auto_close_days', prop: 'inquiryAutoCloseDays', label: 'Close quiet inquiries after',
    hint: 'Opened inquiries waiting on the prospect (New or Contacted) with no message or change. They are closed with the reason "No activity". Never-opened, scheduled and reserved ones are left alone.',
  },
  {
    key: 'complaint_auto_resolve_days', prop: 'complaintAutoResolveDays', label: 'Resolve answered problem reports after',
    hint: 'Reports where the office replied last and the tenant has not answered. The tenant is told and can message to reopen it.',
  },
];
const PRESETS = [0, 7, 14, 30, 60];

export default function FollowUpSettingsModal({ onClose, onSaved }) {
  const [values, setValues] = useState(null); // { key: string }
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    getSystemSettings({ strict: true })
      .then((s) => { if (active) setValues(Object.fromEntries(FIELDS.map((f) => [f.key, String(s[f.prop] ?? '')]))); })
      .catch((err) => { if (active) setMessage(apiErrorMessage(err, 'The settings did not load.')); });
    return () => { active = false; };
  }, []);

  const check = (v) => (/^\d{1,3}$/.test(v) && Number(v) <= 365 ? '' : 'Enter 0 to 365 days.');

  const save = async (e) => {
    e.preventDefault();
    if (!values || saving) return;
    const found = Object.fromEntries(FIELDS.map((f) => [f.key, check(values[f.key])]).filter(([, err]) => err));
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setMessage('');
    try {
      await api.post('update_system_settings.php', Object.fromEntries(FIELDS.map((f) => [f.key, String(Number(values[f.key]))])));
      onSaved?.();
      onClose();
    } catch (err) {
      const server = err?.response?.data?.errors;
      if (server) setErrors(server);
      setMessage(apiErrorMessage(err, 'The settings were not saved. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Inquiry settings" onClose={onClose} busy={saving} as="form" onSubmit={save} noValidate
      overlayClassName="flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      className="bg-white rounded-card shadow-dialog border border-slate-200 w-full max-w-md overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
        <h3 className="m-0 flex items-center gap-2 text-title font-bold text-slate-800">
          <FontAwesomeIcon icon={faGear} className="text-slate-400" aria-hidden="true" /> Follow-up settings
        </h3>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded-control border-0 bg-transparent p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"><FontAwesomeIcon icon={faTimes} /></button>
      </div>
      <div className="space-y-5 p-5">
        <p className="m-0 text-label text-slate-600">Quiet conversations finish themselves so the open lists stay current. 0 days turns it off.</p>
        {!values && !message && <p className="m-0 text-label text-slate-500">Loading…</p>}
        {values && FIELDS.map((f) => (
          <div key={f.key}>
            <label htmlFor={`fu-${f.key}`} className="block text-label font-semibold text-slate-800">{f.label}</label>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <div className={`flex h-10 w-32 items-center rounded-control border bg-white px-3 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 ${errors[f.key] ? 'border-red-400' : 'border-slate-300'}`}>
                <input
                  id={`fu-${f.key}`}
                  inputMode="numeric"
                  value={values[f.key]}
                  onChange={(e) => { setValues((v) => ({ ...v, [f.key]: e.target.value.replace(/\D/g, '').slice(0, 3) })); setErrors((x) => ({ ...x, [f.key]: '' })); }}
                  aria-invalid={errors[f.key] ? true : undefined}
                  aria-describedby={`fu-${f.key}-hint`}
                  className="w-full min-w-0 border-0 bg-transparent p-0 text-body text-slate-800 outline-none focus-visible:outline-none focus-visible:ring-0"
                />
                <span className="text-label text-slate-500">days</span>
              </div>
              <div className="flex flex-wrap gap-1" role="group" aria-label={`${f.label}: quick picks`}>
                {PRESETS.map((d) => (
                  <button key={d} type="button" onClick={() => { setValues((v) => ({ ...v, [f.key]: String(d) })); setErrors((x) => ({ ...x, [f.key]: '' })); }}
                    className={`min-h-[28px] rounded-full border px-2.5 text-caption font-semibold cursor-pointer ${values[f.key] === String(d) ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                    {d === 0 ? 'Never' : `${d}`}
                  </button>
                ))}
              </div>
            </div>
            {errors[f.key] && <p className="m-0 mt-1 text-caption font-semibold text-red-600">{errors[f.key]}</p>}
            <p id={`fu-${f.key}-hint`} className="m-0 mt-1 text-caption text-slate-500">{f.hint}</p>
          </div>
        ))}
        {message && <p role="alert" className="m-0 text-label font-semibold text-red-600">{message}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
        <button type="button" onClick={onClose} className={btn('ghost', 'md')}>Cancel</button>
        <button type="submit" disabled={!values || saving} className={btn('primary', 'md')}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  );
}
