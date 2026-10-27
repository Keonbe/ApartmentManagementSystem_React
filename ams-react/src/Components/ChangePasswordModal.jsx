import { useState } from 'react';
import api from '../api/axiosConfig';
import { checkNewPassword, checkPasswordMatch } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import PasswordField from './form/PasswordField';
import PasswordChecklist from './form/PasswordChecklist';

const EMPTY = { current_password: '', new_password: '', confirm_password: '' };

// Field names match change_password.php's body keys, so a server field error
// lands on the right input.
const VALIDATORS = {
    current_password: (v) => (v ? '' : 'Current password is required.'),
    new_password: (v, all) => checkNewPassword(v)
        || (v && v === all.current_password ? 'New password must be different from the current password.' : ''),
    confirm_password: (v, all) => checkPasswordMatch(all.new_password, v),
};

export default function ChangePasswordModal({ isOpen, onClose }) {
    const [values, setValues] = useState(EMPTY);
    const [message, setMessage] = useState('');
    const [isSuccess, setIsSuccess] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const form = useFieldErrors(VALIDATORS, { idPrefix: 'chpw-' });

    if (!isOpen) return null;

    // Closing without saving shouldn't leave passwords or errors behind.
    const close = () => {
        if (isSaving) return;
        setValues(EMPTY);
        setMessage('');
        setIsSuccess(false);
        form.setErrors({});
        onClose();
    };

    const change = (name) => (e) => {
        setValues({ ...values, [name]: e.target.value });
        form.clearError(name);
    };
    const blur = (name) => () => {
        if (values[name]) form.validateField(name, values);
    };

    const handlePasswordSave = async (e) => {
        e.preventDefault();
        if (isSaving) return;
        setMessage('');
        setIsSuccess(false);
        if (!form.validateAll(values)) return;

        setIsSaving(true);
        try {
            // The account is identified by the session token, not by an email in the body.
            const res = await api.post("/change_password.php", values);

            if (res.data.success) {
                setIsSuccess(true);
                setMessage(res.data.message);
                setValues(EMPTY);
                setTimeout(() => {
                    setMessage('');
                    setIsSuccess(false);
                    onClose();
                }, 2000);
            } else if (!form.applyServerErrors(res)) {
                setMessage(res.data.message || "Failed to update password.");
            }
        } catch (error) {
            console.error("Error updating password:", error);
            if (!form.applyServerErrors(error)) {
                setMessage(apiErrorMessage(error, "Unable to save password change. Please try again."));
            }
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div
            onClick={close}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in modal-overlay-anim"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="modal-card-anim sheet-mobile bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden text-left"
            >
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-lg font-bold m-0 text-slate-800">Change Password</h3>
                    <button
                        type="button"
                        onClick={close}
                        aria-label="Close"
                        className="text-slate-500 hover:text-slate-600 font-bold bg-transparent border-0 cursor-pointer text-base"
                    >✕</button>
                </div>

                <form onSubmit={handlePasswordSave} className="p-6 space-y-4 m-0" noValidate>
                    <PasswordField
                        a11y={form.fieldA11y('current_password')}
                        label="Current Password"
                        autoComplete="current-password"
                        maxLength={128}
                        value={values.current_password}
                        onChange={change('current_password')}
                        onBlur={blur('current_password')}
                        error={form.errors.current_password}
                    />

                    <PasswordField
                        a11y={form.fieldA11y('new_password')}
                        label="New Password"
                        value={values.new_password}
                        onChange={change('new_password')}
                        onBlur={blur('new_password')}
                        error={form.errors.new_password}
                    >
                        <PasswordChecklist password={values.new_password} />
                    </PasswordField>

                    <PasswordField
                        a11y={form.fieldA11y('confirm_password')}
                        label="Confirm New Password"
                        value={values.confirm_password}
                        onChange={change('confirm_password')}
                        onBlur={blur('confirm_password')}
                        error={form.errors.confirm_password}
                    />

                    {/*Feedback Message Status Alert Row Container*/}
                    {message && (
                        <p role={isSuccess ? 'status' : 'alert'} className={`text-sm text-center font-medium m-0 pt-1 ${isSuccess ? 'text-emerald-500' : 'text-red-500'}`}>
                            {message}
                        </p>
                    )}

                    <div className="pt-2 flex justify-end">
                        <button
                            type="submit"
                            disabled={isSaving || isSuccess}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm border-0 cursor-pointer transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isSaving ? 'Updating…' : 'Update Password'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
