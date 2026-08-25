import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash, faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import api from "../api/axiosConfig";
import { useLang } from '../config/i18n';
import ApartmentPic from "../assets/Apartment_Pic.png";
import '../assets/styles/responsive/user/registration.responsive.css';

export default function Registration({ onLoginRedirect, onHomeRedirect }) {
    const navigate = useNavigate();
    const [firstname, setFirstName] = useState('');
    const [middlename, setMiddleName] = useState('');
    const [lastname, setLastName] = useState('');
    const [suffix, setSuffix] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [conPassword, setConPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [showConfirmPass, setShowConfirmPass] = useState(false);
    const [message, setMessage] = useState('');
    const { t } = useLang();

    const handleBackHome = () => {
        if (onHomeRedirect) {
            onHomeRedirect();
        } else {
            navigate('/home');
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();

        const payload = {
            first_name: firstname.trim(),
            middle_name: middlename.trim(),
            last_name: lastname.trim(),
            suffix: suffix.trim(),
            email_address: email.trim(),
            password: password,
            conPassword: conPassword
        };

        try {
            const res = await api.post("/registration.php", payload);
            if(res.data.success){
                onLoginRedirect();
            }
            else{
                setMessage(res.data.message);
            }
        }
        catch (e) {
            console.error("Error:", e);
            setMessage("Unable to register account. Please try again.");
        }
    };

    return (
        <div className="registration-page-root min-h-screen w-full grid grid-cols-1 md:grid-cols-12 overflow-hidden bg-slate-50 text-left">
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
            <div className="registration-form-panel col-span-1 md:col-span-6 flex flex-col justify-center items-center p-6 sm:p-12 bg-white overflow-y-auto">
                <div className="w-full max-w-md flex flex-col items-center my-auto">

                    {/* Back to Home Action */}
                    <div className="w-full flex justify-start mb-3">
                        <button
                            type="button"
                            onClick={handleBackHome}
                            className="flex items-center space-x-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors bg-transparent border-0 cursor-pointer p-0 select-none py-1.5"
                        >
                            <FontAwesomeIcon icon={faArrowLeft} className="text-xs" />
                            <span>{t('reg.backHome')}</span>
                        </button>
                    </div>

                    {/*MobileBrandingLogo*/}
                    <div className="registration-mobile-logo md:hidden flex flex-col items-center mb-6 select-none">
                        <h1 className="custom-ams-logo text-6xl italic font-bold tracking-wider border-0 bg-transparent uppercase m-0" style={{ color: '#3b4276' }}>
                            AMS
                        </h1>
                        <div className="w-24 border-t my-1.5" style={{ borderColor: 'rgba(59, 66, 118, 0.2)' }}></div>
                        <p className="text-[9px] font-medium uppercase tracking-widest m-0 text-center text-slate-500">
                            {t('login.tagline')}
                        </p>
                    </div>

                    <div className="w-full space-y-5">
                        <div className="text-center">
                            <h2 className="registration-heading text-3xl font-extrabold tracking-tight border-0 m-0" style={{ color: '#3b4276' }}>
                                {t('reg.heading')}
                            </h2>
                            <p className="text-xs text-slate-500 mt-1 m-0">{t('reg.subtitle')}</p>
                        </div>

                        <form className="space-y-4" onSubmit={handleRegister}>
                            {/*NameGroupFirstAndMiddle*/}
                            <div className="registration-name-grid grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">{t('reg.firstName')}</label>
                                    <input
                                        value={firstname}
                                        type="text"
                                        placeholder="Juan"
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 text-sm transition-all shadow-inner box-border"
                                        required
                                        onChange={(e) => setFirstName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">{t('reg.middleName')}</label>
                                    <input
                                        value={middlename}
                                        type="text"
                                        placeholder="Optional"
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 text-sm transition-all shadow-inner box-border"
                                        onChange={(e) => setMiddleName(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/*NameGroupLastAndSuffix*/}
                            <div className="registration-name-grid grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">{t('reg.lastName')}</label>
                                    <input
                                        value={lastname}
                                        type="text"
                                        placeholder="Dela Cruz"
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 text-sm transition-all shadow-inner box-border"
                                        required
                                        onChange={(e) => setLastName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">{t('reg.suffix')}</label>
                                    <input
                                        value={suffix}
                                        type="text"
                                        placeholder="Jr, III (Optional)"
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 text-sm transition-all shadow-inner box-border"
                                        onChange={(e) => setSuffix(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/*EmailAddressField*/}
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">{t('reg.email')}</label>
                                <input
                                    value={email}
                                    type="email"
                                    placeholder="JuanDelaCruz@email.com"
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 text-sm transition-all shadow-inner box-border"
                                    required
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>

                            {/*PasswordFields*/}
                            <div className="registration-password-grid grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">{t('reg.password')}</label>
                                    <div className="relative">
                                        <input
                                            value={password}
                                            type={showPass ? "text" : "password"}
                                            placeholder="••••••••••••"
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 text-sm transition-all shadow-inner pr-10 box-border"
                                            required
                                            onChange={(e) => setPassword(e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPass(!showPass)}
                                            className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer"
                                        >
                                            <FontAwesomeIcon icon={showPass ? faEyeSlash : faEye} className="text-xs" />
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">{t('reg.confirmPassword')}</label>
                                    <div className="relative">
                                        <input
                                            value={conPassword}
                                            type={showConfirmPass ? "text" : "password"}
                                            placeholder="••••••••••••"
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 text-sm transition-all shadow-inner pr-10 box-border"
                                            required
                                            onChange={(e) => setConPassword(e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmPass(!showConfirmPass)}
                                            className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer"
                                        >
                                            <FontAwesomeIcon icon={showConfirmPass ? faEyeSlash : faEye} className="text-xs" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {message && (
                                <p className="text-center text-xs font-semibold text-rose-500 m-0 pt-1">
                                    {message}
                                </p>
                            )}

                            <button type="submit" className="w-full bg-[#6366f1] hover:bg-[#4f46e5] active:scale-[0.98] text-white font-bold py-3.5 rounded-xl shadow-md hover:shadow-indigo-200 transition-all border-0 cursor-pointer text-sm tracking-wide mt-2">
                                {t('reg.submit')}
                            </button>
                        </form>

                        <div className="text-center pt-2 border-t border-slate-100">
                            <p className="text-xs text-slate-500 m-0">
                                {t('reg.hasAccount')}{' '}
                                <button onClick={onLoginRedirect} className="text-indigo-600 font-bold hover:underline bg-transparent border-0 p-0 cursor-pointer">
                                    {t('reg.signIn')}
                                </button>
                            </p>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}