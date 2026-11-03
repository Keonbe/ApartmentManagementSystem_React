import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import api from "../api/axiosConfig";
import { LIMITS, PASSWORD_MAX_BYTES, checkEmail, checkNewPassword, checkPasswordMatch, checkPersonName, normalizeEmail } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import { useLang, t as translate } from '../config/i18n';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import PasswordChecklist from '../Components/form/PasswordChecklist';
import LegalModal from '../Components/LegalModal';
import { invalidCls } from '../Components/form/formHelpers';
import ApartmentPic from "../assets/Apartment_Pic.webp";
import '../assets/styles/responsive/user/registration.responsive.css';

const INPUT_CLS = "block px-3.5 pb-2 pt-5 w-full text-base sm:text-sm text-slate-900 bg-slate-50 rounded-xl border border-slate-200 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent peer transition-all shadow-inner box-border";
const LABEL_CLS = "absolute text-xs text-slate-600 font-semibold duration-300 transform -translate-y-2.5 scale-75 top-3 z-10 origin-[0] left-3.5 peer-focus:text-indigo-600 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-2.5 cursor-text";

const EMPTY = { firstname: '', middlename: '', lastname: '', suffix: '', email: '', password: '', conPassword: '' };

const VALIDATORS = {
    firstname: (v) => checkPersonName(v, { label: translate('profile.firstNameLabel'), max: LIMITS.firstName }),
    middlename: (v) => checkPersonName(v, { label: translate('reg.middleNameLabel'), max: LIMITS.middleName, required: false }),
    lastname: (v) => checkPersonName(v, { label: translate('profile.lastNameLabel'), max: LIMITS.lastName }),
    suffix: (v) => checkPersonName(v, { label: translate('profile.suffixLabel'), max: LIMITS.suffix, required: false }),
    email: (v) => checkEmail(v, { max: LIMITS.userEmail }),
    password: (v) => checkNewPassword(v),
    conPassword: (v, all) => checkPasswordMatch(all.password, v),
};

// A floating-label input with its error below. `trailing` is the show/hide
// button, positioned against the input only (not the error line).
function FloatingInput({ form, name, label, hint, required, error, trailing, onChange, onBlur, ...inputProps }) {
    const a11y = form.fieldA11y(name);
    return (
        <div>
            <div className="relative group">
                <input
                    {...a11y}
                    {...inputProps}
                    className={`${INPUT_CLS}${trailing ? ' pr-10' : ''}${invalidCls(error)}`}
                    placeholder={inputProps.placeholder || " "}
                    required={required}
                    onChange={onChange}
                    onBlur={onBlur}
                />
                <label htmlFor={a11y.id} className={LABEL_CLS}>
                    {label}{' '}
                    {required
                        ? <><span className="required-asterisk text-rose-500">*</span> <span className="floating-hint hidden sm:inline font-normal opacity-70">- {hint}</span></>
                        : <><span className="hidden sm:inline font-normal opacity-70 ml-1">{translate('reg.optional')}</span>{hint && <span className="floating-hint hidden sm:inline font-normal opacity-70 ml-1">- {hint}</span>}</>}
                </label>
                {trailing}
            </div>
            <FieldError id={a11y.id} error={error} />
        </div>
    );
}

export default function Registration({ onLoginRedirect }) {
    const navigate = useNavigate();
    const [values, setValues] = useState(EMPTY);
    const [showPass, setShowPass] = useState(false);
    const [showConfirmPass, setShowConfirmPass] = useState(false);
    const [message, setMessage] = useState('');
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [legalDoc, setLegalDoc] = useState(null);
    const { t } = useLang();
    const form = useFieldErrors(VALIDATORS, { idPrefix: 'reg-' });

    const goToLogin = () => (onLoginRedirect ? onLoginRedirect() : navigate('/login'));

    const handleChange = (name) => (e) => {
        const next = { ...values, [name]: e.target.value };
        setValues(next);
        form.clearError(name);
        // A changed password makes an earlier "does not match" stale.
        if (name === 'password' && form.errors.conPassword && next.conPassword) {
            form.validateField('conPassword', next);
        }
    };

    // Trim text (and lowercase email) when leaving a field, then check it.
    const handleBlur = (name) => () => {
        let v = values[name];
        if (name === 'email') v = normalizeEmail(v);
        else if (name !== 'password' && name !== 'conPassword') v = v.trim();
        const next = { ...values, [name]: v };
        setValues(next);
        // An empty field is only reported when the form is submitted.
        if (v === '') return;
        form.validateField(name, next);
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;
        setHasSubmitted(true);
        setMessage('');

        const clean = {
            ...values,
            firstname: values.firstname.trim(),
            middlename: values.middlename.trim(),
            lastname: values.lastname.trim(),
            suffix: values.suffix.trim(),
            email: normalizeEmail(values.email),
        };
        setValues(clean);
        if (!form.validateAll(clean)) return;

        const payload = {
            first_name: clean.firstname,
            middle_name: clean.middlename,
            last_name: clean.lastname,
            suffix: clean.suffix,
            email_address: clean.email,
            password: clean.password,
            conPassword: clean.conPassword
        };

        setIsSubmitting(true);
        try {
            const res = await api.post("/registration.php", payload);
            if (res.data.success) {
                navigate('/login', { state: { successMessage: 'Account created successfully! Please check your email to verify your address.' } });
            } else if (!form.applyServerErrors(res)) {
                setMessage(res.data.message);
            }
        }
        catch (err) {
            console.error("Error:", err);
            if (!form.applyServerErrors(err)) setMessage(apiErrorMessage(err, "Unable to register account. Please try again."));
        } finally {
            setIsSubmitting(false);
        }
    };

    const eyeButton = (shown, toggle, label) => (
        <button
            type="button"
            onClick={toggle}
            aria-label={translate(shown ? 'reg.hideField' : 'reg.showField', { label })}
            className="absolute right-1 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:text-indigo-600 transition-colors bg-transparent border-0 cursor-pointer z-20 focus-visible:outline-2 focus-visible:outline-indigo-500"
        >
            {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
    );

    const field = (name) => ({
        form,
        name,
        value: values[name],
        error: form.errors[name],
        onChange: handleChange(name),
        onBlur: handleBlur(name),
    });

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
            form.has-submitted input[aria-invalid="true"] ~ label .required-asterisk,
            .has-error input:invalid ~ label .required-asterisk {
                display: inline !important;
            }
        `}
            </style>

            {/*LeftSplashPanelWithImageBackground*/}
            <div className="auth-splash ut-native hidden md:flex md:col-span-6 relative flex-col items-center justify-center p-12 text-center text-white select-none overflow-hidden">
                <img
                    src={ApartmentPic}
                    alt=""
                    className="auth-splash-photo absolute inset-0 w-full h-full object-cover object-center z-0"
                />
                <div className="auth-splash-tint absolute inset-0 bg-brand/90 z-10"></div>

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
            <div className="registration-form-panel col-span-1 md:col-span-6 flex flex-col justify-center items-center p-6 sm:p-12 bg-white overflow-y-auto">
                <div className="w-full max-w-md flex flex-col items-center my-auto">

                    {/* Back to Login Action */}
                    <div className="w-full flex justify-start mb-3">
                        <button
                            type="button"
                            onClick={goToLogin}
                            className="flex items-center space-x-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors bg-transparent border-0 cursor-pointer p-0 select-none py-1.5"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            <span>{t('login.backToLogin')}</span>
                        </button>
                    </div>

                    {/*MobileBrandingLogo*/}
                    <div className="registration-mobile-logo md:hidden flex flex-col items-center mb-6 select-none">
                        <h1 className="custom-ams-logo text-6xl italic font-bold tracking-wider border-0 bg-transparent uppercase m-0 text-brand">
                            AMS
                        </h1>
                        <div className="w-24 border-t my-1.5 border-brand/20"></div>
                        <p className="text-xs font-medium m-0 text-center text-slate-500">
                            {t('login.tagline')}
                        </p>
                    </div>

                    <div className="w-full space-y-5">
                        <div className="text-center">
                            <h2 className="registration-heading text-3xl font-black tracking-tight border-0 m-0 text-brand">
                                {t('login.createAccount')}
                            </h2>
                            <p className="text-xs text-slate-500 mt-1 m-0">{t('reg.subtitle')}</p>
                        </div>

                        <form className={`space-y-4 ${hasSubmitted ? 'has-submitted' : ''}`} onSubmit={handleRegister} noValidate>
                            {/*NameGroupFirstAndMiddle*/}
                            <div className="registration-name-grid grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <FloatingInput {...field('firstname')} type="text" autoComplete="given-name" maxLength={LIMITS.firstName} required label={t('reg.firstName')} hint="Enter first name" />
                                <FloatingInput {...field('middlename')} type="text" autoComplete="additional-name" maxLength={LIMITS.middleName} label={t('reg.middleName')} />
                            </div>

                            {/*NameGroupLastAndSuffix*/}
                            <div className="registration-name-grid grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <FloatingInput {...field('lastname')} type="text" autoComplete="family-name" maxLength={LIMITS.lastName} required label={t('reg.lastName')} hint="Enter last name" />
                                <FloatingInput {...field('suffix')} type="text" autoComplete="honorific-suffix" maxLength={LIMITS.suffix} label={t('reg.suffix')} hint="e.g. Jr, Sr, III" />
                            </div>

                            {/*EmailAddressField*/}
                            <FloatingInput {...field('email')} type="email" inputMode="email" autoComplete="email" maxLength={LIMITS.userEmail} required label={t('reg.email')} hint="Enter email address" />

                            {/*PasswordFields*/}
                            <div className="registration-password-grid grid grid-cols-1 gap-4">
                                <div>
                                    <FloatingInput
                                        {...field('password')}
                                        type={showPass ? "text" : "password"}
                                        autoComplete="new-password"
                                        maxLength={PASSWORD_MAX_BYTES}
                                        required
                                        label={t('reg.password')}
                                        hint="Create password"
                                        trailing={eyeButton(showPass, () => setShowPass(!showPass), 'password')}
                                    />
                                    <PasswordChecklist password={values.password} />
                                </div>

                                <FloatingInput
                                    {...field('conPassword')}
                                    type={showConfirmPass ? "text" : "password"}
                                    autoComplete="new-password"
                                    maxLength={PASSWORD_MAX_BYTES}
                                    required
                                    label={t('reg.confirmPassword')}
                                    hint="Confirm password"
                                    trailing={eyeButton(showConfirmPass, () => setShowConfirmPass(!showConfirmPass), 'confirm password')}
                                />
                            </div>

                            {message && (
                                <div role="alert" className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center justify-center font-semibold text-center shadow-sm">
                                    <span>{message}</span>
                                </div>
                            )}

                            <p className="text-[11px] text-slate-500 text-center m-0 leading-relaxed">
                                {t('reg.agreePrefix')}{' '}
                                <button type="button" onClick={() => setLegalDoc('terms')} className="text-indigo-600 font-semibold hover:underline bg-transparent border-0 p-0 cursor-pointer text-[11px]">
                                    {t('reg.termsLink')}
                                </button>{' '}
                                {t('reg.and')}{' '}
                                <button type="button" onClick={() => setLegalDoc('privacy')} className="text-indigo-600 font-semibold hover:underline bg-transparent border-0 p-0 cursor-pointer text-[11px]">
                                    {t('reg.privacyLink')}
                                </button>.
                            </p>

                            <button type="submit" disabled={isSubmitting} className="btn-interactive w-full bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-bold py-3.5 rounded-xl shadow-md hover:shadow-indigo-200 transition-all border-0 cursor-pointer text-sm tracking-wide mt-2 disabled:opacity-70">
                                {isSubmitting ? t('reg.creating') : t('reg.submit')}
                            </button>
                        </form>

                        <div className="text-center pt-2 border-t border-slate-100">
                            <p className="text-xs text-slate-500 m-0">
                                {t('reg.hasAccount')}{' '}
                                <button type="button" onClick={goToLogin} className="text-indigo-600 font-bold hover:underline bg-transparent border-0 p-0 cursor-pointer">
                                    {t('reg.signIn')}
                                </button>
                            </p>
                        </div>
                    </div>

                </div>
            </div>
            {legalDoc && <LegalModal initialDoc={legalDoc} onClose={() => setLegalDoc(null)} />}
        </div>
    );
}
