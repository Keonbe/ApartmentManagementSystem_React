import { useRef, useState } from 'react';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from "../api/axiosConfig";
import { useLang, t as translate } from '../config/i18n';
import ApartmentPic from "../assets/Apartment_Pic.webp";
import '../assets/styles/responsive/user/login.responsive.css';
import { LIMITS, checkEmail, normalizeEmail } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import { roomKindFor, landingPathFor, writeRoomCache } from '../config/tenantHome';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import { invalidCls } from '../Components/form/formHelpers';

const emailRule = (v) => checkEmail(v, { max: LIMITS.userEmail });

export default function Login({ onRegisterRedirect, onAdminRedirect, onHomeRedirect }) {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [otp, setOtp] = useState('');
    const otpInputRefs = useRef([]);
    const [showOtpStep, setShowOtpStep] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    // Set when axiosConfig bounced a request whose session had ended.
    const [message, setMessage] = useState(() =>
        new URLSearchParams(window.location.search).get('expired') ? translate('login.sessionEnded') : ''
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
        password: (v) => (v ? '' : t('login.errPassword')),
    }, { idPrefix: 'login-' });
    const forgot = useFieldErrors({ email: emailRule }, { idPrefix: 'forgot-' });

    // Leaving a field checks what was typed; an empty field is only reported
    // when the form is submitted.
    const blurEmail = (form) => {
        const clean = normalizeEmail(email);
        setEmail(clean);
        if (clean) form.validateField('email', { email: clean });
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

            if (res.data.status === 'device_verification_required') {
                setShowOtpStep(true);
                setMessage('');
            } else if (res.data.email_verification_required) {
                setMessage(res.data.message);
            } else if (res.data.valid) {
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
                    // Tenants start on My Room, applicants with an application in
                    // progress on Track Application, everyone else on Home.
                    try {
                        const roomRes = await api.get(`/my_room.php?email=${encodeURIComponent(res.data.user.email_address || '')}`);
                        const room = roomRes.data.success ? roomRes.data.data : null;
                        writeRoomCache(res.data.user.id, roomKindFor(room?.status));
                        const target = landingPathFor(room);
                        if (target !== '/home') {
                            navigate(target, { replace: true });
                            return;
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

    const handleOtpSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;
        setMessage(''); setIsSubmitting(true);
        try {
            const res = await api.post('/verify_device.php', { email_address: normalizeEmail(email), otp: otp.replace(/\s/g, '') });
            if (!res.data.valid) { setMessage(res.data.message || 'Unable to verify code.'); return; }
            for (const key of Object.keys(localStorage)) if (key === 'ams_guest_token' || key.startsWith('ams_guest_')) localStorage.removeItem(key);
            sessionStorage.setItem('loggedInUser', JSON.stringify(res.data.user));
            sessionStorage.setItem('sessionToken', res.data.sessionToken);
            window.dispatchEvent(new Event('auth-changed'));
            if (res.data.role === 'admin') onAdminRedirect();
            else {
                try {
                    const roomRes = await api.get(`/my_room.php?email=${encodeURIComponent(res.data.user.email_address || '')}`);
                    const room = roomRes.data.success ? roomRes.data.data : null;
                    writeRoomCache(res.data.user.id, roomKindFor(room?.status));
                    const target = landingPathFor(room);
                    if (target !== '/home') { navigate(target, { replace: true }); return; }
                } catch (err) { console.error('Failed to check pending status', err); }
                onHomeRedirect();
            }
        } catch (error) { setMessage(apiErrorMessage(error, 'Unable to verify code.')); }
        finally { setIsSubmitting(false); }
    };

    const updateOtpDigit = (index, value) => {
        const digit = value.replace(/\D/g, '').slice(-1);
        const digits = otp.padEnd(6, ' ').slice(0, 6).split('');
        digits[index] = digit || ' ';
        setOtp(digits.join(''));
        if (digit && index < 5) otpInputRefs.current[index + 1]?.focus();
    };

    const handleOtpKeyDown = (index, event) => {
        if (event.key === 'Backspace') {
            if (otp[index]) updateOtpDigit(index, '');
            if (index > 0) {
                if (!otp[index]) updateOtpDigit(index - 1, '');
                otpInputRefs.current[index - 1]?.focus();
            }
        } else if (event.key === 'ArrowLeft' && index > 0) {
            otpInputRefs.current[index - 1]?.focus();
        } else if (event.key === 'ArrowRight' && index < 5) {
            otpInputRefs.current[index + 1]?.focus();
        }
    };

    const handleOtpPaste = (event) => {
        event.preventDefault();
        const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        setOtp(pasted.padEnd(6, ' '));
        otpInputRefs.current[Math.min(pasted.length, 5)]?.focus();
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
            <div className="ut-native hidden md:flex md:col-span-6 relative flex-col items-center justify-center p-12 text-center text-white select-none overflow-hidden">
                <img 
                    src={ApartmentPic} 
                    alt="" 
                    className="absolute inset-0 w-full h-full object-cover object-center z-0"
                />
                <div className="absolute inset-0 bg-brand/90 z-10"></div>
                
                <div className="relative z-20 flex flex-col items-center justify-center">
                    <h1 className="custom-ams-logo text-8xl italic font-bold tracking-wider mb-2 text-white border-0 bg-transparent uppercase m-0">
                        AMS
                    </h1>
                    <div className="w-48 border-t border-white/20 my-3"></div>
                    <p className="text-xs font-light text-white/70 m-0">
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
                            <span>{isForgotPassword ? t('login.backToLogin') : t('login.backHome')}</span>
                        </button>
                    </div>

                    {/*MobileBrandingLogo*/}
                    <div className="login-mobile-logo md:hidden flex flex-col items-center mb-6 select-none">
                        <h1 className="custom-ams-logo text-6xl italic font-bold tracking-wider border-0 bg-transparent uppercase m-0 text-brand">
                            AMS
                        </h1>
                        <div className="w-24 border-t my-1.5 border-brand/20"></div>
                        <p className="text-xs font-medium m-0 text-center text-slate-500">
                            {t('login.tagline')}
                        </p>
                    </div>

                    <div className="w-full space-y-6">
                        {!showOtpStep && <div className="text-center">
                            <h2 className="login-heading text-3xl font-black tracking-tight border-0 m-0 text-brand">
                                {isForgotPassword ? t('login.resetTitle') : t('login.title')}
                            </h2>
                            <p className="text-xs text-slate-500 mt-1 m-0">
                                {isForgotPassword ? t('login.resetSubtitle') : t('login.subtitle')}
                            </p>
                        </div>}

                        {showOtpStep ? (
                            <form onSubmit={handleOtpSubmit} className="w-full space-y-7 text-center">
                                <div>
                                    <h2 className="login-heading text-2xl font-black tracking-tight border-0 m-0 text-brand">Device Verification</h2>
                                    <p className="text-sm text-slate-500 mt-3 mb-0">Enter the 6-digit code sent to {email}</p>
                                </div>
                                <div className="flex justify-center gap-2.5 sm:gap-3" onPaste={handleOtpPaste}>
                                    {Array.from({ length: 6 }, (_, index) => (
                                        <input
                                            key={index}
                                            ref={(element) => { otpInputRefs.current[index] = element; }}
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete={index === 0 ? 'one-time-code' : 'off'}
                                            aria-label={`Verification code digit ${index + 1}`}
                                            maxLength={1}
                                            value={(otp[index] || '').trim()}
                                            onChange={(event) => updateOtpDigit(index, event.target.value)}
                                            onKeyDown={(event) => handleOtpKeyDown(index, event)}
                                            className="h-12 w-10 sm:h-14 sm:w-12 rounded-xl border border-slate-200 bg-slate-50 text-center text-xl font-bold text-slate-900 shadow-inner transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    ))}
                                </div>
                                {message && <p role="alert" className="text-sm text-rose-700 m-0">{message}</p>}
                                <button type="submit" disabled={isSubmitting || otp.replace(/\s/g, '').length !== 6} className="btn-interactive w-full bg-indigo-600 text-white py-3.5 px-4 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 border-0 cursor-pointer shadow-lg shadow-indigo-200 disabled:opacity-70">{isSubmitting ? 'Verifying…' : 'Verify and Sign In'}</button>
                                <button type="button" onClick={() => { setShowOtpStep(false); setOtp(''); setMessage(''); }} className="text-sm text-indigo-600 hover:underline font-semibold bg-transparent border-0 p-0 cursor-pointer">Back to Login</button>
                            </form>
                        ) : !isForgotPassword ? (
                        <form className={`space-y-5 ${hasSubmitted ? 'has-submitted' : ''}`} onSubmit={handleSubmit} onInvalid={() => setHasSubmitted(true)} noValidate>
                            {/*EmailAddressField*/}
                            <div className="relative group">
                                <input
                                    type="email"
                                    {...login.fieldA11y('email')}
                                    inputMode="email"
                                    autoComplete="email"
                                    maxLength={LIMITS.userEmail}
                                    className={`block px-4 pb-2.5 pt-6 w-full text-base sm:text-sm text-slate-900 bg-slate-50 rounded-xl border border-slate-200 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent peer transition-all shadow-inner box-border${invalidCls(login.errors.email)}`}
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
                                    {t('login.email')} <span className="required-asterisk text-rose-500">*</span> <span className="floating-hint hidden sm:inline font-normal opacity-70">- {t('login.emailHint')}</span>
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
                                        className={`block px-4 pb-2.5 pt-6 w-full text-base sm:text-sm text-slate-900 bg-slate-50 rounded-xl border border-slate-200 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent peer transition-all shadow-inner pr-12 box-border${invalidCls(login.errors.password)}`}
                                        placeholder=" "
                                        required
                                        value={password}
                                        onChange={(e) => { setPassword(e.target.value); login.clearError('password'); }}
                                        onBlur={() => password && login.validateField('password', { password })}
                                    />
                                    <label
                                        htmlFor="login-password"
                                        className="absolute text-sm text-slate-600 font-semibold duration-300 transform -translate-y-3 scale-75 top-4 z-10 origin-[0] left-4 peer-focus:text-indigo-600 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 cursor-text"
                                    >
                                        {t('login.password')} <span className="required-asterisk text-rose-500">*</span> <span className="floating-hint hidden sm:inline font-normal opacity-70">- {t('login.passwordHint')}</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                                        className="absolute right-1 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:text-indigo-600 transition-colors bg-transparent border-0 cursor-pointer z-20 focus-visible:outline-2 focus-visible:outline-indigo-500"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <FieldError id="login-password" error={login.errors.password} />
                                <div className="flex justify-end items-center mt-1">
                                    <button type="button" onClick={() => { setIsForgotPassword(true); setMessage(''); setForgotMessage(null); setHasSubmitted(false); }} className="min-h-[44px] text-sm text-indigo-600 hover:underline font-semibold bg-transparent border-0 p-0 cursor-pointer">{t('login.forgot')}</button>
                                </div>
                            </div>

                            {message && (
                                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center justify-center font-semibold text-center shadow-sm">
                                    <span>{message}</span>
                                </div>
                            )}

                            <button type="submit" disabled={isSubmitting} className="btn-interactive w-full bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-bold py-3.5 rounded-xl shadow-md hover:shadow-indigo-200 transition-all border-0 cursor-pointer text-sm tracking-wide disabled:opacity-70">
                                {isSubmitting ? t('login.signingIn') : t('login.submit')}
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
                                    className={`block px-4 pb-2.5 pt-6 w-full text-base sm:text-sm text-slate-900 bg-slate-50 rounded-xl border border-slate-200 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent peer transition-all shadow-inner box-border${invalidCls(forgot.errors.email)}`}
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
                                    {t('login.email')} <span className="required-asterisk text-rose-500">*</span> <span className="floating-hint hidden sm:inline font-normal opacity-70">- {t('login.emailHint')}</span>
                                </label>
                                <FieldError id="forgot-email" error={forgot.errors.email} />
                            </div>

                            <div className="pt-2 flex flex-col space-y-3">
                                <button
                                    type="submit"
                                    disabled={isSubmittingForgot}
                                    className="btn-interactive w-full bg-indigo-600 text-white py-3.5 px-4 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 border-0 cursor-pointer shadow-lg shadow-indigo-200 disabled:opacity-70 box-border"
                                >
                                    {isSubmittingForgot ? t('common.sending') : t('login.sendResetLink')}
                                </button>
                            </div>
                        </form>
                        )}

                        {!isForgotPassword && !showOtpStep && (
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