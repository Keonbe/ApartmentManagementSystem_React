import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faWrench,
    faTimes,
    faExclamationTriangle,
    faCheck,
    faSpinner,
    faClock,
} from '@fortawesome/free-solid-svg-icons';
import api from '../../api/axiosConfig';

export default function SetUnderMaintenanceModal({ isOpen, onClose, unit, onSuccess }) {
    // Current date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    
    // Default to 7 days from now
    const defaultFuture = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        return d.toISOString().split('T')[0];
    })();

    const [completionDate, setCompletionDate] = useState(defaultFuture);
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen || !unit) return null;

    // Strict validation
    const handleDateChange = (e) => {
        const val = e.target.value;
        setCompletionDate(val);
        if (val && val < today) {
            setError('Estimated completion date cannot be in the past.');
        } else {
            setError('');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!completionDate) {
            setError('Please specify an estimated completion date.');
            return;
        }

        if (completionDate < today) {
            setError('Estimated completion date cannot be in the past.');
            return;
        }

        setSubmitting(true);
        try {
            const res = await api.post('set_unit_maintenance.php', {
                unitId: unit.id,
                action: 'start',
                completionDate,
                notes: notes.trim(),
            });

            if (res.data.success) {
                if (onSuccess) onSuccess(res.data.message);
                onClose();
            } else {
                setError(res.data.message || 'Failed to update unit maintenance status.');
            }
        } catch (err) {
            console.error('Maintenance error:', err);
            setError(err.response?.data?.message || 'Server error setting maintenance status.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
            <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-left">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-amber-50/60">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                            <FontAwesomeIcon icon={faWrench} className="text-base" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800 m-0">Set Unit Under Maintenance</h2>
                            <p className="text-xs text-slate-500 m-0 mt-0.5">
                                Unit {unit.id} • {unit.type} • {unit.floor}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors border-0 cursor-pointer"
                        aria-label="Close"
                    >
                        <FontAwesomeIcon icon={faTimes} className="text-sm" />
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Notice */}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3 text-xs text-amber-800 leading-relaxed">
                        <FontAwesomeIcon icon={faClock} className="text-amber-600 mt-0.5 shrink-0" />
                        <div>
                            <span className="font-bold">Coming Soon Flag:</span> Putting this unit under maintenance marks it as <strong>Under Maintenance (Coming Soon)</strong> in the units list and floor plan view. Once repairs are completed, you can mark it as available again.
                        </div>
                    </div>

                    {error && (
                        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl p-3 flex items-center gap-2">
                            <FontAwesomeIcon icon={faExclamationTriangle} className="text-rose-500 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Completion Date */}
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                            Estimated Completion Date <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                            <input
                                type="date"
                                min={today}
                                value={completionDate}
                                onChange={handleDateChange}
                                required
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all shadow-xs"
                            />
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 m-0">
                            Must be today or a future date. This date informs management when the unit will be available again.
                        </p>
                    </div>

                    {/* Maintenance Scope Notes */}
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                            Maintenance Scope / Work Notes <span className="text-slate-400 font-normal">(Optional)</span>
                        </label>
                        <textarea
                            rows={3}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="e.g., Repainting bedroom, replacement of kitchen faucet, AC deep cleaning..."
                            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 transition-all shadow-xs resize-none"
                        />
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || !!error}
                            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-bold shadow-sm transition-all border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting ? (
                                <>
                                    <FontAwesomeIcon icon={faSpinner} className="animate-spin text-xs" />
                                    <span>Updating...</span>
                                </>
                            ) : (
                                <>
                                    <FontAwesomeIcon icon={faCheck} className="text-xs" />
                                    <span>Set as Under Maintenance</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

