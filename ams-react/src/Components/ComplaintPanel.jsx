import { useState } from 'react';
import api from '../api/axiosConfig';
import { apiErrorMessage } from '../utils/apiError';
import { useLang } from '../config/i18n';

// Tenant side of complaints (SPRINT 189): shows the status of the unresolved
// complaint, or a small form to file one. Filing is HTTP only (file_complaint.php);
// the chat thread then follows the complaint on the server. `onFiled` refreshes the
// chat state.
const COMPLAINT_CATEGORIES = ['Maintenance', 'Billing', 'Neighbor', 'Noise', 'Staff', 'Other'];

export default function ComplaintPanel({ complaint, onFiled }) {
    const { t } = useLang();
    const [open, setOpen] = useState(false);
    const [category, setCategory] = useState('Maintenance');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    if (complaint) {
        return (
            <p role="status" className="m-0 shrink-0 border-b border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {t('complaint.statusLine', {
                    category: t(`complaint.cat.${complaint.category}`),
                    status: t(`complaint.status.${complaint.status}`),
                })}
            </p>
        );
    }

    const submit = async (event) => {
        event.preventDefault();
        if (busy) return;
        if (message.trim().length < 5) { setError(t('complaint.tooShort')); return; }
        setBusy(true);
        setError('');
        try {
            await api.post('file_complaint.php', { category, message: message.trim() });
            setOpen(false);
            setMessage('');
            await onFiled?.();
        } catch (err) {
            setError(apiErrorMessage(err, t('complaint.failed')));
        } finally {
            setBusy(false);
        }
    };

    if (!open) {
        return (
            <button type="button" onClick={() => setOpen(true)}
                className="mt-3 min-h-[44px] rounded-full border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 cursor-pointer hover:bg-rose-50">
                {t('complaint.report')}
            </button>
        );
    }

    return (
        <form onSubmit={submit} className="w-full space-y-2 border-t border-slate-100 bg-white p-3 text-left">
            <p className="m-0 text-xs text-slate-500">{t('complaint.hint')}</p>
            <label className="block text-xs font-semibold text-slate-700" htmlFor="complaintCategory">{t('complaint.category')}</label>
            <select id="complaintCategory" value={category} onChange={(e) => setCategory(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-2 text-sm">
                {COMPLAINT_CATEGORIES.map((c) => <option key={c} value={c}>{t(`complaint.cat.${c}`)}</option>)}
            </select>
            <label className="block text-xs font-semibold text-slate-700" htmlFor="complaintMessage">{t('complaint.message')}</label>
            <textarea id="complaintMessage" value={message} maxLength={2000} rows={3} onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm" />
            {error && <p role="alert" className="m-0 text-xs text-rose-600">{error}</p>}
            <div className="flex gap-2">
                <button type="submit" disabled={busy}
                    className="min-h-[44px] flex-1 rounded-lg border-0 bg-rose-600 px-3 text-sm font-semibold text-white cursor-pointer disabled:opacity-50">
                    {busy ? t('complaint.sending') : t('complaint.send')}
                </button>
                <button type="button" onClick={() => { setOpen(false); setError(''); }}
                    className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm cursor-pointer">
                    {t('complaint.cancel')}
                </button>
            </div>
        </form>
    );
}
