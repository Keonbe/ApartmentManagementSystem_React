import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
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

    const [hasSubmitted, setHasSubmitted] = useState(false);

    const handleRegister = async (e) => {
        e.preventDefault();
        setHasSubmitted(true);
        setMessage('');

        // Validations
        if (password.length < 6) {
            setMessage("Password must be at least 6 characters.");
            return;
        }
        if (password !== conPassword) {
            setMessage("Passwords do not match.");
            return;
        }

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
        <div className="registration-page-root min-h-screen w-full grid grid-cols-1 md:grid-cols-12 overflow-hidden bg-white text-left">
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
            <div className="registration-form-panel col-span-1 md:col-span-6 flex flex-col justify-center items-center p-6 sm:p-12 bg-white overflow-y-auto">
                <div className="w-full max-w-md flex flex-col items-center my-auto">

                    {/* Back to Login Action */}
                    <div className="w-full flex justify-start mb-3">
                        <button
                            type="button"
                            onClick={onLoginRedirect}
                            className="flex items-center space-x-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors bg-transparent border-0 cursor-pointer p-0 select-none py-1.5"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            <span>Back to Login</span>
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
                            <h2 className="registration-heading text-3xl font-black tracking-tight border-0 m-0" style={{ color: '#3b4276' }}>
                                Create Account
                            </h2>
                            <p className="text-xs text-slate-500 mt-1 m-0">{t('reg.subtitle')}</p>
                        </div>

                        <form className={`space-y-4 ${hasSubmitted ? 'has-submitted' : ''}`} onSubmit={handleRegister} onInvalid={() => setHasSubmitted(true)}>
                            {/*NameGroupFirstAndMiddle*/}
                            <div className="registration-name-grid grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="relative group">
                                    <input
                                        value={firstname}
                                        type="text"
                                        id="reg-firstname"
                                        className="block px-3.5 pb-2 pt-5 w-full text-sm text-slate-900 bg-slate-50 rounded-xl border border-slate-200 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent peer transition-all shadow-inner box-border"
                                        placeholder=" "
                                        required
                                        onChange={(e) => setFirstName(e.target.value)}
                                    />
                                    <label
                                        htmlFor="reg-firstname"
                                        className="absolute text-xs text-slate-600 font-semibold duration-300 transform -translate-y-2.5 scale-75 top-3 z-10 origin-[0] left-3.5 peer-focus:text-indigo-600 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-2.5 cursor-text"
                                    >
                                        {t('reg.firstName')} <span className="required-asterisk text-rose-500">*</span> <span className="floating-hint hidden sm:inline font-normal opacity-70">- Enter first name</span>
                                    </label>
                                </div>
                                <div className="relative group">
                                    <input
                                        value={middlename}
                                        type="text"
                                        id="reg-middlename"
                                        className="block px-3.5 pb-2 pt-5 w-full text-sm text-slate-900 bg-slate-50 rounded-xl border border-slate-200 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent peer transition-all shadow-inner box-border"
                                        placeholder=" "
                                        onChange={(e) => setMiddleName(e.target.value)}
                                    />
                                    <label
                                        htmlFor="reg-middlename"
                                        className="absolute text-xs text-slate-600 font-semibold duration-300 transform -translate-y-2.5 scale-75 top-3 z-10 origin-[0] left-3.5 peer-focus:text-indigo-600 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-2.5 cursor-text"
                                    >
                                        {t('reg.middleName')} <span className="hidden sm:inline font-normal opacity-70 ml-1">(Optional)</span>
                                    </label>
                                </div>
                            </div>

                            {/*NameGroupLastAndSuffix*/}
                            <div className="registration-name-grid grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="relative group">
                                    <input
                                        value={lastname}
                                        type="text"
                                        id="reg-lastname"
                                        className="block px-3.5 pb-2 pt-5 w-full text-sm text-slate-900 bg-slate-50 rounded-xl border border-slate-200 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent peer transition-all shadow-inner box-border"
                                        placeholder=" "
                                        required
                                        onChange={(e) => setLastName(e.target.value)}
                                    />
                                    <label
                                        htmlFor="reg-lastname"
                                        className="absolute text-xs text-slate-600 font-semibold duration-300 transform -translate-y-2.5 scale-75 top-3 z-10 origin-[0] left-3.5 peer-focus:text-indigo-600 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-2.5 cursor-text"
                                    >
                                        {t('reg.lastName')} <span className="required-asterisk text-rose-500">*</span> <span className="floating-hint hidden sm:inline font-normal opacity-70">- Enter last name</span>
                                    </label>
                                </div>
                                <div className="relative group">
                                    <input
                                        value={suffix}
                                        type="text"
                                        id="reg-suffix"
                                        className="block px-3.5 pb-2 pt-5 w-full text-sm text-slate-900 bg-slate-50 rounded-xl border border-slate-200 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent peer transition-all shadow-inner box-border"
                                        placeholder=" "
                                        onChange={(e) => setSuffix(e.target.value)}
                                    />
                                    <label
                                        htmlFor="reg-suffix"
                                        className="absolute text-xs text-slate-600 font-semibold duration-300 transform -translate-y-2.5 scale-75 top-3 z-10 origin-[0] left-3.5 peer-focus:text-indigo-600 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-2.5 cursor-text"
                                    >
                                        {t('reg.suffix')} <span className="hidden sm:inline font-normal opacity-70 ml-1">(Optional)</span>
                                    </label>
                                </div>
                            </div>

                            {/*EmailAddressField*/}
                            <div className="relative group">
                                <input
                                    value={email}
                                    type="email"
                                    id="reg-email"
                                    className="block px-3.5 pb-2 pt-5 w-full text-sm text-slate-900 bg-slate-50 rounded-xl border border-slate-200 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent peer transition-all shadow-inner box-border"
                                    placeholder=" "
                                    required
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                                <label
                                    htmlFor="reg-email"
                                    className="absolute text-xs text-slate-600 font-semibold duration-300 transform -translate-y-2.5 scale-75 top-3 z-10 origin-[0] left-3.5 peer-focus:text-indigo-600 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-2.5 cursor-text"
                                >
                                    {t('reg.email')} <span className="required-asterisk text-rose-500">*</span> <span className="floating-hint hidden sm:inline font-normal opacity-70">- Enter email address</span>
                                </label>
                            </div>

                            {/*PasswordFields*/}
                            <div className="registration-password-grid grid grid-cols-1 gap-4">
                                <div className="relative group">
                                    <input
                                        value={password}
                                        type={showPass ? "text" : "password"}
                                        id="reg-password"
                                        className="block px-3.5 pb-2 pt-5 w-full text-sm text-slate-900 bg-slate-50 rounded-xl border border-slate-200 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent peer transition-all shadow-inner pr-10 box-border"
                                        placeholder=" "
                                        required
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                    <label
                                        htmlFor="reg-password"
                                        className="absolute text-xs text-slate-600 font-semibold duration-300 transform -translate-y-2.5 scale-75 top-3 z-10 origin-[0] left-3.5 peer-focus:text-indigo-600 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-2.5 cursor-text"
                                    >
                                        {t('reg.password')} <span className="required-asterisk text-rose-500">*</span> <span className="floating-hint hidden sm:inline font-normal opacity-70">- Create password</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setShowPass(!showPass)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors bg-transparent border-0 cursor-pointer z-20"
                                    >
                                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>

                                <div className="relative group">
                                    <input
                                        value={conPassword}
                                        type={showConfirmPass ? "text" : "password"}
                                        id="reg-confirm"
                                        className="block px-3.5 pb-2 pt-5 w-full text-sm text-slate-900 bg-slate-50 rounded-xl border border-slate-200 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent peer transition-all shadow-inner pr-10 box-border"
                                        placeholder=" "
                                        required
                                        onChange={(e) => setConPassword(e.target.value)}
                                    />
                                    <label
                                        htmlFor="reg-confirm"
                                        className="absolute text-xs text-slate-600 font-semibold duration-300 transform -translate-y-2.5 scale-75 top-3 z-10 origin-[0] left-3.5 peer-focus:text-indigo-600 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-2.5 cursor-text"
                                    >
                                        {t('reg.confirmPassword')} <span className="required-asterisk text-rose-500">*</span> <span className="floating-hint hidden sm:inline font-normal opacity-70">- Confirm password</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPass(!showConfirmPass)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors bg-transparent border-0 cursor-pointer z-20"
                                    >
                                        {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {message && (
                                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center justify-center font-semibold text-center shadow-sm">
                                    <span>{message}</span>
                                </div>
                            )}

                            <button type="submit" className="btn-interactive w-full bg-[#6366f1] hover:bg-[#4f46e5] active:scale-[0.98] text-white font-bold py-3.5 rounded-xl shadow-md hover:shadow-indigo-200 transition-all border-0 cursor-pointer text-sm tracking-wide mt-2">
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