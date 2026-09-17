import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash, faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import api from "../api/axiosConfig";
import { useLang } from '../config/i18n';
import ApartmentPic from "../assets/Apartment_Pic.png";
import '../assets/styles/responsive/user/login.responsive.css';

export default function Login({ onRegisterRedirect, onAdminRedirect, onHomeRedirect }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    // Set when axiosConfig bounced a request whose session had ended.
    const [message, setMessage] = useState(() =>
        new URLSearchParams(window.location.search).get('expired') ? 'Your session has ended. Please sign in again.' : ''
    );
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [forgotMessage, setForgotMessage] = useState('');
    const [forgotToken, setForgotToken] = useState('');
    const [isSubmittingForgot, setIsSubmittingForgot] = useState(false);
    const { t } = useLang();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('');

        try {
            const res = await api.post("/login.php", {
                email_address: email.trim(),
                password
            });

            if (res.data.valid) {
                sessionStorage.setItem("loggedInUser", JSON.stringify(res.data.user));
                if (res.data.sessionToken) {
                    sessionStorage.setItem("sessionToken", res.data.sessionToken);
                }

                if (res.data.role === 'admin') {
                    onAdminRedirect();
                } else {
                    onHomeRedirect();
                }
            } else {
                setMessage(res.data.message || t('login.error'));
            }
        } catch (error) {
            // 429 carries the lockout message; anything else is a generic failure.
            setMessage(error?.response?.data?.message || t('login.error'));
        }
    };

    const handleForgotSubmit = async (e) => {
        e.preventDefault();
        setForgotMessage('');
        setForgotToken('');
        setIsSubmittingForgot(true);

        try {
            const res = await api.post("/forgot_password.php", { email: email.trim() });
            setForgotMessage(res.data.message);
            if (res.data.dev_token) {
                setForgotToken(res.data.dev_token);
            }
        } catch (error) {
            setForgotMessage(error.response?.data?.message || "Failed to send reset link.");
        } finally {
            setIsSubmittingForgot(false);
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
                    <p className="text-xs font-light uppercase tracking-widest text-white/70 m-0">
                        {t('login.tagline')}
                    </p>
                </div>
            </div>

            {/*RightFormPanel*/}
            <div className="login-form-panel col-span-1 md:col-span-6 flex flex-col justify-center items-center p-8 sm:p-16 bg-white shadow-xl md:shadow-none">
                <div className="w-full max-w-md flex flex-col items-center">

                    {/* Back to Home Action */}
                    <div className="w-full flex justify-start mb-4">
                        <button
                            type="button"
                            onClick={onHomeRedirect}
                            className="flex items-center space-x-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors bg-transparent border-0 cursor-pointer p-0 select-none py-1.5"
                        >
                            <FontAwesomeIcon icon={faArrowLeft} className="text-xs" />
                            <span>{t('login.backHome')}</span>
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
                            <h2 className="login-heading text-3xl font-extrabold tracking-tight border-0 m-0" style={{ color: '#3b4276' }}>
                                {isForgotPassword ? "Reset Password" : t('login.heading')}
                            </h2>
                            <p className="text-xs text-slate-500 mt-1 m-0">
                                {isForgotPassword ? "Enter your email to receive a reset link" : t('login.subtitle')}
                            </p>
                        </div>

                        {!isForgotPassword ? (
                        <form className="space-y-5" onSubmit={handleSubmit}>
                            {/*EmailAddressField*/}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">{t('login.email')}</label>
                                <input
                                    type="email"
                                    placeholder="JuanDelaCruz@email.com"
                                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 text-sm transition-all shadow-inner box-border"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>

                            {/*PasswordField*/}
                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">{t('login.password')}</label>
                                    <button type="button" onClick={() => { setIsForgotPassword(true); setMessage(''); setForgotMessage(''); }} className="text-xs text-indigo-600 hover:underline font-semibold bg-transparent border-0 p-0 cursor-pointer">{t('login.forgot')}</button>
                                </div>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        placeholder="••••••••••••"
                                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 text-sm transition-all shadow-inner pr-12 box-border"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-3.5 text-slate-400 hover:text-slate-600 transition-colors bg-transparent border-0 cursor-pointer"
                                    >
                                        <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
                                    </button>
                                </div>
                            </div>

                            {message && (
                                <p className="text-center text-xs font-semibold text-rose-500 m-0 pt-1">
                                    {message}
                                </p>
                            )}

                            <button type="submit" className="w-full bg-[#6366f1] hover:bg-[#4f46e5] active:scale-[0.98] text-white font-bold py-3.5 rounded-xl shadow-md hover:shadow-indigo-200 transition-all border-0 cursor-pointer text-sm tracking-wide">
                                {t('login.submit')}
                            </button>
                        </form>
                        ) : (
                        <form className="space-y-5" onSubmit={handleForgotSubmit}>
                            {forgotMessage && (
                                <div className="p-3 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs rounded-xl flex items-center justify-between">
                                    <span>{forgotMessage}</span>
                                </div>
                            )}
                            
                            {forgotToken && (
                                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex flex-col space-y-2">
                                    <p className="m-0 font-semibold">[DEV MODE] Email delivery simulated.</p>
                                    <a href={`/reset-password?email=${encodeURIComponent(email)}&token=${forgotToken}`} className="bg-emerald-600 text-white font-bold py-2 px-4 rounded-lg text-center no-underline hover:bg-emerald-700 transition-colors block">
                                        Click here to reset password
                                    </a>
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">{t('login.email')}</label>
                                <input
                                    type="email"
                                    placeholder="JuanDelaCruz@email.com"
                                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 text-sm transition-all shadow-inner box-border"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>

                            <div className="pt-2 flex flex-col space-y-3">
                                <button
                                    type="submit"
                                    disabled={isSubmittingForgot}
                                    className="w-full bg-[#3b4276] text-white py-3 px-4 rounded-xl font-bold text-sm hover:bg-[#2c325c] transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 border-0 cursor-pointer shadow-lg shadow-indigo-200 disabled:opacity-70 box-border"
                                >
                                    {isSubmittingForgot ? 'Sending...' : 'Send Reset Link'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setIsForgotPassword(false); setForgotMessage(''); setForgotToken(''); }}
                                    className="w-full bg-white text-slate-600 py-3 px-4 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors focus:outline-none border border-slate-200 cursor-pointer box-border"
                                >
                                    Back to Login
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