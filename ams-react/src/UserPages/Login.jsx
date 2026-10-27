import { useState } from 'react';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from "../api/axiosConfig";
import { useLang } from '../config/i18n';
import ApartmentPic from "../assets/Apartment_Pic.webp";
import '../assets/styles/responsive/user/login.responsive.css';
import { LIMITS, checkEmail, normalizeEmail } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import { invalidCls } from '../Components/form/formHelpers';

const emailRule = (v) => checkEmail(v, { max: LIMITS.userEmail });

export default function Login({ onRegisterRedirect, onAdminRedirect, onHomeRedirect }) {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    // Set when axiosConfig bounced a request whose session had ended.
    const [message, setMessage] = useState(() =>
        new URLSearchParams(window.location.search).get('expired') ? 'Your session has ended. Please sign in again.' : ''
    );
    // /login?forgot=1 opens straight into "forgot password" (Reset Password links here).
    const [isForgotPassword, setIsForgotPassword] = useState(() => new URLSearchParams(window.location.search).get('forgot') === '1');
    // { ok, text }: a failure is shown as an error, not in the success style.
    const [forgotMessage, setForgotMessage] = useState(null);
    const [isSubmittingForgot, setIsSubmittingForgot] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { t, lang } = useLang();
    // Login only checks presence: older passwords may predate the new-password rules.
    const login = useFieldErrors({
        email: emailRule,
        password: (v) => (v ? '' : 'Password is required.'),
    }, { idPrefix: 'login-' });
    const forgot = useFieldErrors({ email: emailRule }, { idPrefix: 'forgot-' });

    const blurEmail = (form) => {
        const clean = normalizeEmail(email);
        setEmail(clean);
        form.validateField('email', { email: clean });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;
        setHasSubmitted(true);
        setMessage('');
        const clean = normalizeEmail(email);
        setEmail(clean);
        if (!login.validateAll({ email: clean, password })) return;

        setIsSubmitting(true);
        try {
            // Sent so a guest chat started in this browser follows the account.
            const res = await api.post("/login.php", {
                email_address: clean,
                password,
                guest_token: localStorage.getItem('ams_guest_token') || undefined
            });

            if (res.data.valid) {
                for (const key of Object.keys(localStorage)) {
                    if (key === 'ams_guest_token' || key.startsWith('ams_guest_')) localStorage.removeItem(key);
                }
                sessionStorage.setItem("loggedInUser", JSON.stringify(res.data.user));
                if (res.data.sessionToken) {
                    sessionStorage.setItem("sessionToken", res.data.sessionToken);
                }
                window.dispatchEvent(new Event('auth-changed'));

                if (res.data.role === 'admin') {
                    onAdminRedirect();
                } else {
                    try {
                        const roomRes = await api.get(`/my_room.php?email=${encodeURIComponent(res.data.user.email_address || '')}`);
                        if (roomRes.data.success && roomRes.data.data) {
                            const status = roomRes.data.data.status?.toLowerCase();
                            if (['pending', 'pending review', 'approved', 'action required', 'pending deposit'].includes(status) || roomRes.data.data.has_pending_first_payment) {
                                navigate('/track-application', { replace: true });
                                return;
                            }
                        }
                    } catch (err) {
                        console.error("Failed to check pending status", err);
                    }
                    onHomeRedirect();
                }
            } else {
                // login.php says valid: false for a wrong email or password; the
                // page used to recognise it by comparing the English message.
                setMessage(res.data.valid === false ? t('login.invalidCredentials') : (res.data.message || t('login.error')));
            }
        } catch (error) {
            // 429 carries the lockout message; anything else is a generic failure.
            if (!login.applyServerErrors(error)) setMessage(apiErrorMessage(error, t('login.error')));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleForgotSubmit = async (e) => {
        e.preventDefault();
        if (isSubmittingForgot) return;
        setHasSubmitted(true);
        setForgotMessage(null);
        const clean = normalizeEmail(email);
        setEmail(clean);
        if (!forgot.validateAll({ email: clean })) return;
        setIsSubmittingForgot(true);

        try {
            const res = await api.post("/forgot_password.php", {
                email: clean,
                lang,
                frontend_url: window.location.origin,
            });
            setForgotMessage({ ok: res.data.success !== false, text: res.data.message });
        } catch (error) {
            if (!forgot.applyServerErrors(error)) setForgotMessage({ ok: false, text: apiErrorMessage(error, "Failed to send reset link.") });
        } finally {
            setIsSubmittingForgot(false);
        }
    };

    return (
        <div className="login-page-root min-h-[100vh] min-h-[100dvh] w-full grid grid-cols-1 md:grid-cols-12 overflow-hidden bg-white text-left">
            <style>
                {`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,700&display=swap');
          .custom-ams-logo {
            font-family: 'Playfair Display', Georgia, serif !important;
          }
          input:focus ~ label .floating-hint,
          input:not(:placeholder-shown) ~ label .floating-hint {
            display: none !important;
          }
          .required-asterisk {
            display: none !important;
          }
          form.has-submitted input:invalid ~ label .required-asterisk,
          .has-error input:invalid ~ label .required-asterisk {
            display: inline !important;
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
                    <p className="text-xs font-light uppercase tracking-widest text-white/70 m-0">
                        {t('login.tagline')}
                    </p>
                </div>
            </div>

            {/*RightFormPanel*/}
            <div className="login-form-panel col-span-1 md:col-span-6 flex flex-col justify-center items-center p-8 sm:p-16 bg-white shadow-xl md:shadow-none">
                <div className="w-full max-w-md flex flex-col items-center">

                    {/* Back Action */}
                    <div className="w-full flex justify-start mb-4">
                        <button
                            type="button"
                            onClick={isForgotPassword ? () => { setIsForgotPassword(false); setForgotMessage(null); setHasSubmitted(false); } : onHomeRedirect}
                            className="flex items-center space-x-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors bg-transparent border-0 cursor-pointer p-0 select-none py-1.5"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            <span>{isForgotPassword ? 'Back to Login' : t('login.backHome')}</span>
                        </button>
                    </div>

                    {/*MobileBrandingLogo*/}
                    <div className="login-mobile-logo md:hidden flex flex-col items-center mb-6 select-none">
                        <h1 className="custom-ams-logo text-6xl italic font-bold tracking-wider border-0 bg-transparent uppercase m-0" style={{ color: '#3b4276' }}>
                            AMS
                        </h1>
                        <div className="w-24 border-t my-1.5" style={{ borderColor: 'rgba(59, 66, 118, 0.2)' }}></div>
                        <p className="text-[9px] font-medium uppercase tracking-widest m-0 text-center text-slate-500">
                            {t('login.tagline')}
                        </p>
                    </div>

                    <div className="w-full space-y-6">
                        <div className="text-center">
                            <h2 className="login-heading text-3xl font-black tracking-tight border-0 m-0" style={{ color: '#3b4276' }}>
                                {isForgotPassword ? (lang === 'fil' ? 'I-reset ang Password' : 'Reset Password') : "Log In"}
                            </h2>
                            <p className="text-xs text-slate-500 mt-1 m-0">
                                {isForgotPassword ? (lang === 'fil' ? 'Ilagay ang iyong email upang makatanggap ng link.' : 'Enter your email to receive a reset link') : t('login.subtitle')}
                            </p>
                        </div>

                        {!isForgotPassword ? (
                        <form className={`space-y-5 ${hasSubmitted ? 'has-submitted' : ''}`} onSubmit={handleSubmit} onInvalid={() => setHasSubmitted(true)} noValidate>
                            {/*EmailAddressField*/}
                            <div className="relative group">
                                <input
                                    type="email"
                                    {...login.fieldA11y('email')}
                                    inputMode="email"
                                    autoComplete="email"
                                    maxLength={LIMITS.userEmail}
                                    className={`block px-4 pb-2.5 pt-6 w-full text-sm text-slate-900 bg-slate-50 rounded-xl border border-slate-200 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent peer transition-all shadow-inner box-border${invalidCls(login.errors.email)}`}
                                    placeholder=" "
                                    required
                                    value={email}
                                    onChange={(e) => { setEmail(e.target.value); login.clearError('email'); }}
                                    onBlur={() => blurEmail(login)}
                                />
                                <label
                                    htmlFor="login-email"
                                    className="absolute text-sm text-slate-600 font-semibold duration-300 transform -translate-y-3 scale-75 top-4 z-10 origin-[0] left-4 peer-focus:text-indigo-600 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 cursor-text"
                                >
                                    {t('login.email')} <span className="required-asterisk text-rose-500">*</span> <span className="floating-hint hidden sm:inline font-normal opacity-70">- Enter your registered email</span>
                                </label>
                                <FieldError id="login-email" error={login.errors.email} />
                            </div>

                            {/*PasswordField*/}
                            <div className="space-y-1.5">
                                <div className="relative group">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        {...login.fieldA11y('password')}
                                        autoComplete="current-password"
                                        maxLength={128}
                                        className={`block px-4 pb-2.5 pt-6 w-full text-sm text-slate-900 bg-slate-50 rounded-xl border border-slate-200 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent peer transition-all shadow-inner pr-12 box-border${invalidCls(login.errors.password)}`}
                                        placeholder=" "
                                        required
                                        value={password}
                                        onChange={(e) => { setPassword(e.target.value); login.clearError('password'); }}
                                        onBlur={() => login.validateField('password', { password })}
                                    />
                                    <label
                                        htmlFor="login-password"
                                        className="absolute text-sm text-slate-600 font-semibold duration-300 transform -translate-y-3 scale-75 top-4 z-10 origin-[0] left-4 peer-focus:text-indigo-600 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 cursor-text"
                                    >
                                        {t('login.password')} <span className="required-asterisk text-rose-500">*</span> <span className="floating-hint hidden sm:inline font-normal opacity-70">- Enter your password</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors bg-transparent border-0 cursor-pointer z-20"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <FieldError id="login-password" error={login.errors.password} />
                                <div className="flex justify-end items-center mt-1">
                                    <button type="button" onClick={() => { setIsForgotPassword(true); setMessage(''); setForgotMessage(null); setHasSubmitted(false); }} className="text-xs text-indigo-600 hover:underline font-semibold bg-transparent border-0 p-0 cursor-pointer">{t('login.forgot')}</button>
                                </div>
                            </div>

                            {message && (
                                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center justify-center font-semibold text-center shadow-sm">
                                    <span>{message}</span>
                                </div>
                            )}

                            <button type="submit" disabled={isSubmitting} className="btn-interactive w-full bg-[#6366f1] hover:bg-[#4f46e5] active:scale-[0.98] text-white font-bold py-3.5 rounded-xl shadow-md hover:shadow-indigo-200 transition-all border-0 cursor-pointer text-sm tracking-wide disabled:opacity-70">
                                {isSubmitting ? 'Signing in…' : t('login.submit')}
                            </button>
                        </form>
                        ) : (
                        <form className={`space-y-5 ${hasSubmitted ? 'has-submitted' : ''}`} onSubmit={handleForgotSubmit} onInvalid={() => setHasSubmitted(true)} noValidate>
                            {forgotMessage && (
                                <div role={forgotMessage.ok ? 'status' : 'alert'} className={`p-3 border text-xs rounded-xl flex items-center justify-between ${forgotMessage.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                                    <span>{forgotMessage.text}</span>
                                </div>
                            )}
                            
                            <div className="relative group">
                                <input
                                    type="email"
                                    {...forgot.fieldA11y('email')}
                                    inputMode="email"
                                    autoComplete="email"
                                    maxLength={LIMITS.userEmail}
                                    className={`block px-4 pb-2.5 pt-6 w-full text-sm text-slate-900 bg-slate-50 rounded-xl border border-slate-200 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent peer transition-all shadow-inner box-border${invalidCls(forgot.errors.email)}`}
                                    placeholder=" "
                                    required
                                    value={email}
                                    onChange={(e) => { setEmail(e.target.value); forgot.clearError('email'); }}
                                    onBlur={() => blurEmail(forgot)}
                                />
                                <label
                                    htmlFor="forgot-email"
                                    className="absolute text-sm text-slate-600 font-semibold duration-300 transform -translate-y-3 scale-75 top-4 z-10 origin-[0] left-4 peer-focus:text-indigo-600 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 cursor-text"
                                >
                                    {t('login.email')} <span className="required-asterisk text-rose-500">*</span> <span className="floating-hint hidden sm:inline font-normal opacity-70">- Enter your registered email</span>
                                </label>
                                <FieldError id="forgot-email" error={forgot.errors.email} />
                            </div>

                            <div className="pt-2 flex flex-col space-y-3">
                                <button
                                    type="submit"
                                    disabled={isSubmittingForgot}
                                    className="btn-interactive w-full bg-[#6366f1] text-white py-3.5 px-4 rounded-xl font-bold text-sm hover:bg-[#4f46e5] transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 border-0 cursor-pointer shadow-lg shadow-indigo-200 disabled:opacity-70 box-border"
                                >
                                    {isSubmittingForgot ? (lang === 'fil' ? 'Nagpapadala...' : 'Sending...') : (lang === 'fil' ? 'Ipadala ang Reset Link' : 'Send Reset Link')}
                                </button>
                            </div>
                        </form>
                        )}

                        {!isForgotPassword && (
                            <div className="text-center pt-2 border-t border-slate-100">
                                <p className="text-xs text-slate-500 m-0">
                                    {t('login.noAccount')}{' '}
                                    <button onClick={onRegisterRedirect} className="text-indigo-600 font-bold hover:underline bg-transparent border-0 p-0 cursor-pointer">
                                        {t('login.createAccount')}
                                    </button>
                                </p>
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}