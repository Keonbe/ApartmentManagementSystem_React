import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { useNavigate, useLocation } from 'react-router-dom';
import SuccessModal from '../Components/SuccessModal';
import RulesGroups from '../Components/RulesGroups';
import useAllRules from '../hooks/useAllRules';
import api from '../api/axiosConfig';
import { LIMITS, checkDate, checkEmail, checkIntRange, checkPersonName, checkPhMobile, checkText, localDateString, addMonths, normalizeEmail, toPhLocal10, toPhE164 } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import PhoneInput from '../Components/PhoneInput';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import InlineAlert from '../Components/InlineAlert';
import CharCount from '../Components/form/CharCount';
import { blockNonIntegerKeys, invalidCls } from '../Components/form/formHelpers';
import { useLang, dateLocale } from '../config/i18n';
import { GUEST_CHAT_OPENED_EVENT } from '../config/appEvents';
import { useChat } from '../context/ChatContext';
import { formatAvailable } from '../utils/availableDate';
import { usePublicSettings } from '../config/publicSettings';
import Collapsible from '../Components/tenant/Collapsible';
import { Bone, SkeletonGroup } from '../Components/tenant/Skeleton';

// Until the settings arrive (Settings → Rental; the shipped defaults).
const DEFAULT_MAX_OCCUPANTS = 8;
const DEFAULT_MOVE_IN_MONTHS = 6;
import '../assets/styles/responsive/user/inquiry-form.responsive.css';

// Reads the stored session so the form can prefill for a logged-in visitor.
// Guests get an empty object and type their details in themselves.
function sessionPrefill() {
    const stored = sessionStorage.getItem('loggedInUser') || localStorage.getItem('loggedInUser');
    if (!stored) return {};
    try {
        const user = JSON.parse(stored);
        return {
            name: [user.first_name, user.last_name].filter(Boolean).join(' ').trim(),
            email: user.email_address || user.email || '',
            contact: toPhLocal10(user.contact_no),
        };
    } catch {
        return {}; // Corrupt session payload — leave the form blank.
    }
}

export default function InquiryForm() {
    const { t } = useLang();
    const navigate = useNavigate();
    const location = useLocation();

    const [fullName, setFullName] = useState(() => sessionPrefill().name || '');
    const [email, setEmail] = useState(() => sessionPrefill().email || '');
    const [contactNo, setContactNo] = useState(() => sessionPrefill().contact || '');
    const [roomName, setRoomName] = useState(location.state?.selectedRoomId || '');
    const [occupants, setOccupants] = useState('');
    const [moveIn, setMoveIn] = useState('');
    const [message, setMessage] = useState('');
    const [honeypot, setHoneypot] = useState('');

    const [rooms, setRooms] = useState([]);
    const [loadingRooms, setLoadingRooms] = useState(true);
    // House rules, children and pets, and parking, shown together beside the form.
    const { rules: houseRules, loading: loadingHouseRules, error: houseRulesFailed } = useAllRules();
    const houseRulesError = houseRulesFailed ? t('houseRules.inquiryError') : '';
    const [submitting, setSubmitting] = useState(false);
    const [hasAgreedToRules, setHasAgreedToRules] = useState(false);
    // The submit button stays enabled; an unticked box is reported here, under it.
    const [rulesError, setRulesError] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    // A repeat inquiry from an email/phone that already has a conversation:
    // no chat opens here; the owner gets a link by email (submit_inquiry.php).
    const [existingThread, setExistingThread] = useState(false);

    // "Continue your conversation": a one-time code from an emailed link
    // (?resume=) is exchanged for the chat key (guest_chat_resume.php), or the
    // guest asks for a new link by email.
    const [resumeCode] = useState(() => new URLSearchParams(location.search).get('resume'));
    const [resumeOpen, setResumeOpen] = useState(false);
    const [resumeEmail, setResumeEmail] = useState('');
    const [resumeBusy, setResumeBusy] = useState(false);
    const [resumeMsg, setResumeMsg] = useState(null); // { ok, text }
    const redeemed = useRef(false);
    const { setIsChatOpen } = useChat();

    useEffect(() => {
        if (!resumeCode || redeemed.current) return;
        redeemed.current = true; // a code works once; StrictMode must not send it twice
        navigate(location.pathname, { replace: true }); // the code leaves the address bar
        setResumeMsg({ ok: true, text: t('inquiry.resumeOpening') });
        api.post('guest_chat_resume.php', { action: 'redeem', code: resumeCode })
            .then((res) => {
                if (!res.data?.success || !res.data.guest_token) throw new Error('redeem failed');
                localStorage.setItem('ams_guest_token', res.data.guest_token);
                localStorage.setItem('ams_guest_info', JSON.stringify({ thread_id: res.data.thread_id }));
                // Mounts the widget (App) and opens it (shared chat state).
                window.dispatchEvent(new Event(GUEST_CHAT_OPENED_EVENT));
                setIsChatOpen(true);
                setResumeMsg({ ok: true, text: t('inquiry.resumeOpened') });
            })
            .catch(() => {
                setResumeMsg({ ok: false, text: t('inquiry.resumeFailed') });
                setResumeOpen(true);
            });
    }, [resumeCode, navigate, location.pathname, t, setIsChatOpen]);

    const requestResumeLink = async (e) => {
        e.preventDefault();
        if (resumeBusy) return;
        const clean = normalizeEmail(resumeEmail);
        const emailError = checkEmail(clean, { max: LIMITS.email });
        if (emailError) { setResumeMsg({ ok: false, text: emailError }); return; }
        setResumeBusy(true);
        try {
            const res = await api.post('guest_chat_resume.php', { action: 'request', email: clean });
            setResumeMsg({ ok: !!res.data?.success, text: res.data?.message || '' });
        } catch (err) {
            setResumeMsg({ ok: false, text: apiErrorMessage(err, t('inquiry.errorNetwork')) });
        } finally {
            setResumeBusy(false);
        }
    };

    useEffect(() => {
        const fetchRooms = async () => {
            try {
                const res = await api.get('get_rooms.php');
                if (res.data.success && Array.isArray(res.data.rooms)) {
                    // Vacant units, and occupied ones that will free up (Preview's "Coming soon").
                    setRooms(res.data.rooms.filter(r => (r.status && r.status.toLowerCase() === 'vacant') || r.availableFrom));
                }
            } catch (error) {
                console.error('Failed to fetch available rooms', error);
            } finally {
                setLoadingRooms(false);
            }
        };
        fetchRooms();
    }, []);

    // Settings → Rental: Maximum Occupants per Unit and Inquiry Move-In Date.
    // submit_inquiry.php checks the same limits.
    const publicSettings = usePublicSettings();
    const maxOccupants = publicSettings?.maxOccupantsPerUnit || DEFAULT_MAX_OCCUPANTS;
    const moveInMonths = publicSettings?.inquiryMoveInMaxMonths || DEFAULT_MOVE_IN_MONTHS;
    const latestMoveIn = addMonths(moveInMonths);
    const latestMoveInText = new Date(`${latestMoveIn}T00:00:00`).toLocaleDateString(dateLocale(), { month: 'long', day: 'numeric', year: 'numeric' });

    // Keys match submit_inquiry.php's body.
    const form = useFieldErrors({
        full_name: (v) => checkPersonName(v, { label: t('inquiry.fullNameLabel'), max: LIMITS.fullName }),
        contact_no: (v) => checkPhMobile(v),
        email: (v) => checkEmail(v, { max: LIMITS.email }),
        room_name: (v) => (!v || rooms.some(r => String(r.id) === String(v)) ? '' : t('inquiry.errUnit')),
        occupants: (v) => (v !== '' && v != null && checkIntRange(v, 1, maxOccupants, 'Occupants') ? t('inquiry.errOccupants', { max: maxOccupants }) : ''),
        // checkDate covers a bad or past date; the upper limit gets a readable message.
        preferred_move_in: (v) => {
            if (!v) return '';
            return checkDate(v, { min: localDateString(), label: t('inquiry.moveInLabel') })
                || (v > latestMoveIn ? t('inquiry.errMoveInMax', { n: moveInMonths, date: latestMoveInText }) : '');
        },
        message: (v) => checkText(v, { label: 'Message', max: LIMITS.message, required: false }),
    }, { idPrefix: 'inquiry-' });
    const values = { full_name: fullName, contact_no: contactNo, email, room_name: roomName, occupants, preferred_move_in: moveIn, message };
    const setters = { full_name: setFullName, email: setEmail, room_name: setRoomName, occupants: setOccupants, preferred_move_in: setMoveIn, message: setMessage };

    const change = (name) => (e) => { setters[name](e.target.value); form.clearError(name); };
    const blur = (name) => () => {
        const raw = values[name];
        const v = name === 'email' ? normalizeEmail(raw) : (name === 'full_name' || name === 'message') ? String(raw).trim() : raw;
        if (v !== raw) setters[name](v);
        form.validateField(name, { ...values, [name]: v });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;
        setErrorMsg('');

        const clean = { ...values, full_name: fullName.trim(), email: normalizeEmail(email), message: message.trim() };
        setFullName(clean.full_name);
        setEmail(clean.email);
        setMessage(clean.message);
        const fieldsOk = form.validateAll(clean);
        if (!hasAgreedToRules) setRulesError(t('inquiry.errRules'));
        if (!fieldsOk) return;
        if (!hasAgreedToRules) {
            document.getElementById('agree-rules')?.focus();
            return;
        }

        setSubmitting(true);
        try {
            const res = await api.post('submit_inquiry.php', {
                ...clean,
                contact_no: toPhE164(contactNo),
                website: honeypot,
            });

            if (res.data.success) {
                if (res.data.guest_token) {
                    localStorage.setItem('ams_guest_token', res.data.guest_token);
                    localStorage.setItem('ams_guest_info', JSON.stringify({ name: clean.full_name, email: clean.email, phone: toPhE164(contactNo), thread_id: res.data.thread_id }));
                }
                setExistingThread(!!res.data.existing_thread);
                setIsModalOpen(true);
            } else if (!form.applyServerErrors(res)) {
                setErrorMsg(res.data.message || t('inquiry.errorNetwork'));
            }
        } catch (error) {
            console.error('Error submitting inquiry:', error);
            if (!form.applyServerErrors(error)) setErrorMsg(apiErrorMessage(error, t('inquiry.errorNetwork')));
        } finally {
            setSubmitting(false);
        }
    };

    const inputClass = "inquiry-input focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]";
    const labelClass = "text-sm font-bold text-brand";
    const renderHouseRules = () => (
        <>
            {loadingHouseRules ? (
                // Shaped like the rule cards that replace it.
                <SkeletonGroup label={t('houseRules.loading')} className="space-y-3">
                    <Bone className="h-3 w-24" />
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="rounded-xl bg-slate-50 p-3 space-y-2">
                            <Bone className="h-3.5 w-1/2" />
                            <Bone className="h-2.5 w-full" />
                            <Bone className="h-2.5 w-3/4" />
                        </div>
                    ))}
                </SkeletonGroup>
            ) : houseRulesError ? (
                <p role="status" className="m-0 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">{houseRulesError}</p>
            ) : houseRules.length > 0 ? (
                <div className="animate-fade-in max-h-[500px] space-y-4 overflow-y-auto pr-1.5 scrollbar-thin scrollbar-thumb-slate-200">
                    <RulesGroups rules={houseRules} compact />
                </div>
            ) : (
                <p className="m-0 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">{t('houseRules.inquiryEmpty')}</p>
            )}
        </>
    );

    return (
        <div className="inquiry-root w-full min-h-[calc(100vh-76px)] bg-slate-50 box-border">
            <div className="page-enter max-w-6xl mx-auto px-4 py-6 text-left">
                {/*Page Heading*/}
                <div className="mb-6">
                    <h1 className="inquiry-heading text-2xl font-bold text-slate-800 m-0">
                        {t('inquiry.heading')}
                    </h1>
                    <p className="text-sm text-slate-500 mt-1 mb-0">{t('inquiry.subtitle')}</p>
                </div>

                {/* Continue an earlier guest conversation (emailed one-time link). */}
                {!sessionPrefill().email && (
                    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
                        <button
                            type="button"
                            onClick={() => setResumeOpen((v) => !v)}
                            aria-expanded={resumeOpen}
                            className="flex w-full items-center justify-between gap-3 min-h-[40px] bg-transparent border-0 p-0 text-left cursor-pointer font-semibold text-indigo-700 hover:text-indigo-900"
                        >
                            {t('inquiry.resumeAsk')}
                            <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 transition-[background-color,rotate] duration-300 ${resumeOpen ? 'rotate-180 bg-indigo-100' : ''}`}>
                                <FontAwesomeIcon icon={faChevronDown} className="text-xs" />
                            </span>
                        </button>
                        {resumeMsg && (
                            <p role="status" className={`m-0 mt-2 text-sm ${resumeMsg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{resumeMsg.text}</p>
                        )}
                        {resumeOpen && (
                            <form onSubmit={requestResumeLink} className="animate-fade-in-up mt-3 flex flex-col gap-2 sm:flex-row sm:items-end" noValidate>
                                <div className="flex-1">
                                    <p className="m-0 mb-2 text-xs text-slate-500">{t('inquiry.resumeHint')}</p>
                                    <label htmlFor="inquiry-resume-email" className={labelClass}>{t('inquiry.resumeEmail')}</label>
                                    <input
                                        id="inquiry-resume-email"
                                        type="email"
                                        autoComplete="email"
                                        maxLength={LIMITS.email}
                                        value={resumeEmail}
                                        onChange={(e) => setResumeEmail(e.target.value)}
                                        className={`${inputClass} mt-1`}
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={resumeBusy}
                                    className="min-h-[48px] rounded-xl border-0 bg-indigo-600 px-5 font-bold text-white hover:bg-indigo-700 cursor-pointer disabled:opacity-60"
                                >
                                    {resumeBusy ? t('inquiry.resumeSending') : t('inquiry.resumeSend')}
                                </button>
                            </form>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    <div className="min-w-0 lg:col-span-7">
                        <Collapsible
                            className="mb-6 rounded-2xl border border-slate-200/80 bg-white px-4 py-2 shadow-xs lg:hidden"
                            summary={t('houseRules.mobileSummary')}
                            summaryClassName="text-sm font-semibold text-slate-800"
                            fill
                        >
                            <div className="mt-1 pb-2">{renderHouseRules()}</div>
                        </Collapsible>

                <form
                    className="inquiry-form-card rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs grid grid-cols-1 md:grid-cols-2 gap-6 items-start"
                    onSubmit={handleSubmit}
                    noValidate
                >
                    {/*Honeypot: hidden from people, tempting to bots*/}
                    <input
                        type="text"
                        name="website"
                        value={honeypot}
                        onChange={(e) => setHoneypot(e.target.value)}
                        tabIndex="-1"
                        autoComplete="off"
                        aria-hidden="true"
                        style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0 }}
                    />

                    <div className="flex flex-col space-y-2">
                        <label htmlFor="inquiry-full_name" className={labelClass}>{t('inquiry.fullName')}</label>
                        <input
                            type="text"
                            {...form.fieldA11y('full_name')}
                            autoComplete="name"
                            required
                            maxLength={LIMITS.fullName}
                            value={fullName}
                            onChange={change('full_name')}
                            onBlur={blur('full_name')}
                            placeholder={t('inquiry.fullNamePlaceholder')}
                            className={inputClass + invalidCls(form.errors.full_name)}
                        />
                        <FieldError id="inquiry-full_name" error={form.errors.full_name} className="m-0" />
                    </div>

                    <div className="flex flex-col space-y-2">
                        <label htmlFor="inquiry-contact_no" className={labelClass}>{t('inquiry.contactNo')}</label>
                        <PhoneInput
                            id="inquiry-contact_no"
                            name="contact_no"
                            required
                            value={contactNo}
                            onChange={(digits) => { setContactNo(digits); form.clearError('contact_no'); }}
                            onBlur={() => form.validateField('contact_no', values)}
                            error={form.errors.contact_no}
                            placeholder={t('inquiry.contactNoPlaceholder')}
                            inputClassName={`inquiry-input focus-glow w-full px-4 py-3 rounded-r-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]${invalidCls(form.errors.contact_no)}`}
                        />
                    </div>

                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label htmlFor="inquiry-email" className={labelClass}>{t('inquiry.email')}</label>
                        <input
                            type="email"
                            {...form.fieldA11y('email')}
                            inputMode="email"
                            autoComplete="email"
                            required
                            maxLength={LIMITS.email}
                            value={email}
                            onChange={change('email')}
                            onBlur={blur('email')}
                            placeholder={t('inquiry.emailPlaceholder')}
                            className={inputClass + invalidCls(form.errors.email)}
                        />
                        <FieldError id="inquiry-email" error={form.errors.email} className="m-0" />
                    </div>

                    <div className="flex flex-col space-y-2">
                        <label htmlFor="inquiry-room_name" className={labelClass}>{t('inquiry.unit')}</label>
                        {loadingRooms ? (
                            <SkeletonGroup label={t('inquiry.loadingRooms')}>
                                <Bone className="h-[48px] rounded-xl" />
                            </SkeletonGroup>
                        ) : (
                        <select
                            {...form.fieldA11y('room_name')}
                            value={roomName}
                            onChange={change('room_name')}
                            className={inputClass + invalidCls(form.errors.room_name)}
                            disabled={loadingRooms}
                        >
                            <option value="">{loadingRooms ? t('inquiry.loadingRooms') : t('inquiry.unitAny')}</option>
                            {rooms.map(room => (
                                <option key={room.id} value={room.id}>
                                    Room {room.id} — {room.type} (₱{Number(room.rent).toLocaleString()}/mo){room.availableFrom ? ` · ${t('preview.availableFrom').replace('{date}', formatAvailable(room.availableFrom))}` : ''}
                                </option>
                            ))}
                        </select>
                        )}
                        <FieldError id="inquiry-room_name" error={form.errors.room_name} className="m-0" />
                    </div>

                    <div className="flex flex-col space-y-2">
                        <label htmlFor="inquiry-occupants" className={labelClass}>
                            {t('inquiry.occupants')} <span className="text-slate-500 font-medium">({t('inquiry.optional')})</span>
                        </label>
                        <input
                            type="number"
                            {...form.fieldA11y('occupants')}
                            inputMode="numeric"
                            min="1"
                            max={maxOccupants}
                            step="1"
                            value={occupants}
                            onKeyDown={blockNonIntegerKeys}
                            onChange={change('occupants')}
                            onBlur={blur('occupants')}
                            placeholder={t('inquiry.occupantsPlaceholder')}
                            className={inputClass + invalidCls(form.errors.occupants)}
                        />
                        {!form.errors.occupants && <p className="m-0 text-xs text-slate-500">{t('inquiry.occupantsHint', { max: maxOccupants })}</p>}
                        <FieldError id="inquiry-occupants" error={form.errors.occupants} className="m-0" />
                    </div>

                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label htmlFor="inquiry-preferred_move_in" className={labelClass}>
                            {t('inquiry.moveIn')} <span className="text-slate-500 font-medium">({t('inquiry.optional')})</span>
                        </label>
                        <input
                            type="date"
                            {...form.fieldA11y('preferred_move_in')}
                            value={moveIn}
                            min={localDateString()}
                            max={latestMoveIn}
                            onChange={change('preferred_move_in')}
                            onBlur={blur('preferred_move_in')}
                            className={inputClass + invalidCls(form.errors.preferred_move_in)}
                        />
                        {!form.errors.preferred_move_in && <p className="m-0 text-xs text-slate-500">{t('inquiry.moveInHint', { n: moveInMonths, date: latestMoveInText })}</p>}
                        <FieldError id="inquiry-preferred_move_in" error={form.errors.preferred_move_in} className="m-0" />
                    </div>

                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label htmlFor="inquiry-message" className={labelClass}>
                            {t('inquiry.message')} <span className="text-slate-500 font-medium">({t('inquiry.optional')})</span>
                        </label>
                        <textarea
                            rows="5"
                            {...form.fieldA11y('message')}
                            value={message}
                            maxLength={LIMITS.message}
                            onChange={change('message')}
                            onBlur={blur('message')}
                            placeholder={t('inquiry.messagePlaceholder')}
                            className={`${inputClass} resize-y${invalidCls(form.errors.message)}`}
                        />
                        <FieldError id="inquiry-message" error={form.errors.message} className="m-0" />
                        <CharCount value={message} max={LIMITS.message} className="m-0" />
                    </div>

                    <div className="md:col-span-2 flex items-start gap-2.5 text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-3.5">
                        <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5 shrink-0 text-indigo-400" />
                        <span>{t('inquiry.note')}</span>
                    </div>

                    <div className="md:col-span-2 flex items-start gap-3 pt-2">
                        <input
                            id="agree-rules"
                            type="checkbox"
                            checked={hasAgreedToRules}
                            onChange={(e) => { setHasAgreedToRules(e.target.checked); if (e.target.checked) setRulesError(''); }}
                            aria-invalid={rulesError ? true : undefined}
                            aria-describedby={rulesError ? 'agree-rules-error' : undefined}
                            className="mt-0.5 h-6 w-6 shrink-0 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor="agree-rules" className="cursor-pointer select-none text-sm leading-relaxed text-slate-700">
                            {t('inquiry.rulesAcknowledgment')}{' '}
                            <span className="font-semibold text-slate-800">{t('houseRules.title')}</span>{' '}
                            {t('inquiry.rulesBeforeSubmit')}
                        </label>
                    </div>

                    <FieldError id="agree-rules" error={rulesError} className="md:col-span-2 m-0 -mt-2" />

                    {/* A failed submit shows here, next to the button (it was a box above the form). */}
                    <InlineAlert className="md:col-span-2" onDismiss={() => setErrorMsg('')}>{errorMsg}</InlineAlert>

                    <div className="md:col-span-2 flex justify-end">
                        <button
                            type="submit"
                            disabled={submitting}
                            className={`inquiry-submit-btn btn-interactive font-bold py-3.5 px-10 rounded-xl text-sm transition-all shadow-md border-0 min-h-[48px] ${submitting ? 'bg-slate-400 hover:bg-slate-400 text-white cursor-wait' : 'bg-brand hover:bg-[#2f3560] text-white cursor-pointer'}`}
                        >
                            {submitting ? t('inquiry.submitting') : t('inquiry.submit')}
                        </button>
                    </div>
                </form>
                    </div>

                    <aside aria-labelledby="inquiry-house-rules-title" className="sticky top-6 hidden min-w-0 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs lg:col-span-5 lg:block">
                    <h2 id="inquiry-house-rules-title" className="m-0 text-sm font-semibold text-slate-800">{t('houseRules.title')}</h2>
                    <p className="mb-3 mt-1 text-xs text-slate-500">{t('houseRules.inquirySubtitle')}</p>
                    {renderHouseRules()}
                    </aside>
                </div>
            </div>

            <SuccessModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); navigate('/preview'); }}
                message={existingThread ? t('inquiry.existingThread') : t('inquiry.success')}
            />
        </div>
    );
}
