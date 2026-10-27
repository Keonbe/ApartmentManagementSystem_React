import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/axiosConfig';
import ApartmentPic from "../assets/Apartment_Pic.webp";
import { checkNewPassword, checkPasswordMatch } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import PasswordField from '../Components/form/PasswordField';
import PasswordChecklist from '../Components/form/PasswordChecklist';
import { useLang } from '../config/i18n';
import '../assets/styles/responsive/user/login.responsive.css';

const LABEL_CLS = "text-xs font-bold text-slate-700 block";
const INPUT_CLS = "focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 text-base sm:text-sm transition-all shadow-inner pr-12 box-border";

const VALIDATORS = {
    new_password: (v) => checkNewPassword(v),
    confirm_password: (v, all) => checkPasswordMatch(all.new_password, v),
};

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');
    const { lang } = useLang();
    const isFil = lang === 'fil';

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [message, setMessage] = useState(() => (!token ? (isFil ? 'Hindi wasto ang link para i-reset ang password.' : 'Invalid password reset link.') : ''));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [showInvalid, setShowInvalid] = useState(false);
    const form = useFieldErrors(VALIDATORS, { idPrefix: 'reset-' });
    const values = { new_password: password, confirm_password: confirmPassword };

    useEffect(() => {
        if (isSuccess) {
            const timer = window.setTimeout(() => navigate('/login'), 2000);
            return () => window.clearTimeout(timer);
        }
        return undefined;
    }, [isSuccess, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;
        setMessage('');
        if (!form.validateAll(values)) return;

        setIsSubmitting(true);
        try {
            const res = await api.post("/reset_password.php", {
                token,
                new_password: password,
                confirm_password: confirmPassword
            });

            if (res.data.success) {
                setIsSuccess(true);
                setMessage(res.data.message);
            } else if (!form.applyServerErrors(res)) {
                setMessage(res.data.message);
                if (/invalid|expired/i.test(res.data.message || '')) setShowInvalid(true);
            }
        } catch (error) {
            if (!form.applyServerErrors(error)) {
                setMessage(apiErrorMessage(error, "Failed to reset password. The link might be expired."));
                if (error.response?.status === 404 || /invalid|expired/i.test(error.response?.data?.message || '')) setShowInvalid(true);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="login-page-root min-h-screen w-full grid grid-cols-1 md:grid-cols-12 overflow-hidden bg-slate-50 text-left">
            <style>
                {`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,700&display=swap');
          .custom-ams-logo {
            font-family: 'Playfair Display', Georgia, serif !important;
          }
        `}
            </style>

            {/*LeftSplashPanelWithImageBackground*/}
            <div className="hidden md:flex md:col-span-6 relative flex-col items-center justify-center p-12 text-center text-white select-none overflow-hidden">
                <img 
                    src={ApartmentPic} 
                    alt="Apartment Splash" 
                    className="absolute inset-0 w-full h-full object-cover object-center z-0"
                />
                <div className="absolute inset-0 bg-[#3b4276]/90 z-10"></div>
                
                <div className="relative z-20 flex flex-col items-center justify-center">
                    <h1 className="custom-ams-logo text-8xl italic font-bold tracking-wider mb-2 text-white border-0 bg-transparent uppercase m-0">
                        AMS
                    </h1>
                    <div className="w-48 border-t border-white/20 my-3"></div>
                    <p className="text-xs font-light text-white/70 m-0">
                        Apartment Management System
                    </p>
                </div>
            </div>

            {/*RightFormPanel*/}
            <div className="login-form-panel col-span-1 md:col-span-6 flex flex-col justify-center items-center p-8 sm:p-16 bg-white shadow-xl md:shadow-none">
                <div className="w-full max-w-md flex flex-col items-center">

                    {/*MobileBrandingLogo*/}
                    <div className="login-mobile-logo md:hidden flex flex-col items-center mb-6 select-none">
                        <h1 className="custom-ams-logo text-6xl italic font-bold tracking-wider border-0 bg-transparent uppercase m-0" style={{ color: '#3b4276' }}>
                            AMS
                        </h1>
                        <div className="w-24 border-t my-1.5" style={{ borderColor: 'rgba(59, 66, 118, 0.2)' }}></div>
                        <p className="text-xs font-medium m-0 text-center text-slate-500">
                            Apartment Management System
                        </p>
                    </div>

                    <div className="w-full space-y-6">
                        <div className="text-center">
                            <h2 className="login-heading text-3xl font-extrabold tracking-tight border-0 m-0" style={{ color: '#3b4276' }}>
                                {isFil ? 'Gumawa ng Bagong Password' : 'Create New Password'}
                            </h2>
                            <p className="text-xs text-slate-500 mt-1 m-0">
                                {isFil ? 'Maglagay ng bagong ligtas na password para sa iyong account.' : 'Enter a new secure password for your account.'}
                            </p>
                        </div>

                        {showInvalid ? <div className="space-y-4 text-center"><p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{message || (isFil ? 'Hindi wasto o nag-expire na ang link.' : 'This reset link is invalid or expired.')}</p><Link to="/login?forgot=1" className="inline-flex items-center min-h-[44px] font-bold text-indigo-600">{isFil ? 'Humiling ng bagong link' : 'Request a new link'}</Link></div> : isSuccess ? (
                            <div className="space-y-4 text-center mt-6">
                                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold rounded-xl">
                                    {message}
                                </div>
                                <button
                                    onClick={() => navigate('/login')}
                                    className="btn-interactive w-full bg-[#3b4276] text-white py-3 px-4 rounded-xl font-bold text-sm hover:bg-[#2c325c] transition-colors border-0 cursor-pointer shadow-lg mt-2 box-border"
                                >
                                    {isFil ? 'Magpatuloy sa Pag-login' : 'Proceed to Login'}
                                </button>
                            </div>
                        ) : (
                            <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                                {!token ? (
                                    // A link without a token: the way forward is a new link
                                    // (this used to be a red box with nothing to do).
                                    <div className="space-y-3 text-center">
                                        <div role="alert" className="p-3 bg-rose-50 border border-rose-100 text-rose-700 text-xs rounded-xl font-semibold">
                                            {message}
                                        </div>
                                        <Link to="/login?forgot=1" className="inline-flex items-center min-h-[44px] font-bold text-indigo-600">
                                            {isFil ? 'Humiling ng bagong link' : 'Request a new link'}
                                        </Link>
                                    </div>
                                ) : (
                                    <>
                                        <PasswordField
                                            a11y={form.fieldA11y('new_password')}
                                            label={isFil ? 'Bagong Password' : 'New Password'}
                                            labelClassName={LABEL_CLS}
                                            inputClassName={INPUT_CLS}
                                            value={password}
                                            onChange={(e) => { setPassword(e.target.value); form.clearError('new_password'); }}
                                            onBlur={() => password && form.validateField('new_password', values)}
                                            error={form.errors.new_password}
                                        >
                                            <PasswordChecklist password={password} />
                                        </PasswordField>

                                        <PasswordField
                                            a11y={form.fieldA11y('confirm_password')}
                                            label={isFil ? 'Kumpirmahin ang Password' : 'Confirm Password'}
                                            labelClassName={LABEL_CLS}
                                            inputClassName={INPUT_CLS}
                                            value={confirmPassword}
                                            onChange={(e) => { setConfirmPassword(e.target.value); form.clearError('confirm_password'); }}
                                            onBlur={() => confirmPassword && form.validateField('confirm_password', values)}
                                            error={form.errors.confirm_password}
                                        />

                                        {message && (
                                            <p role="alert" className="text-center text-xs font-semibold text-rose-500 m-0 pt-1">
                                                {message}
                                            </p>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="btn-interactive w-full bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-bold py-3.5 rounded-xl shadow-md hover:shadow-indigo-200 transition-all border-0 cursor-pointer text-sm tracking-wide disabled:opacity-70 mt-2"
                                        >
                                            {isSubmitting ? (isFil ? 'Nire-reset...' : 'Resetting...') : (isFil ? 'I-reset ang Password' : 'Reset Password')}
                                        </button>
                                    </>
                                )}
                            </form>
                        )}
                        
                        <div className="text-center pt-2 border-t border-slate-100">
                            <p className="text-xs text-slate-500 m-0">
                                <Link to="/login" className="text-indigo-600 font-bold hover:underline no-underline">
                                    Return to Login
                                </Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
