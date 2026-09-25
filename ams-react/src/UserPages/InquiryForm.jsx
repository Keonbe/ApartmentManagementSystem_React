import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelopeOpenText, faExclamationTriangle, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { useNavigate, useLocation } from 'react-router-dom';
import SuccessModal from '../Components/SuccessModal';
import api from '../api/axiosConfig';
import { LIMITS, checkDate, checkIntRange, checkPhMobile, localDateString } from '../utils/validation';
import { useLang } from '../config/i18n';
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
            contact: user.contact_no || '',
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
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        const fetchRooms = async () => {
            try {
                const res = await api.get('get_rooms.php');
                if (res.data.success && Array.isArray(res.data.rooms)) {
                    setRooms(res.data.rooms.filter(r => r.status && r.status.toLowerCase() === 'vacant'));
                }
            } catch (error) {
                console.error('Failed to fetch available rooms', error);
            } finally {
                setLoadingRooms(false);
            }
        };
        fetchRooms();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');

        if (!fullName.trim() || !email.trim() || !contactNo.trim()) {
            setErrorMsg(t('inquiry.errorRequired'));
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            setErrorMsg(t('inquiry.errorEmail'));
            return;
        }
        if (checkPhMobile(contactNo)) {
            setErrorMsg(t('inquiry.errorContact'));
            return;
        }

        const optionalError = (occupants !== '' && occupants != null ? checkIntRange(occupants, 1, 20, 'Occupants') : '')
            || (moveIn ? checkDate(moveIn, { min: localDateString(), label: 'Preferred move-in date' }) : '');
        if (optionalError) {
            setErrorMsg(optionalError);
            return;
        }

        setSubmitting(true);
        try {
            const res = await api.post('submit_inquiry.php', {
                full_name: fullName.trim(),
                email: email.trim(),
                contact_no: contactNo.trim(),
                room_name: roomName,
                occupants: occupants,
                preferred_move_in: moveIn,
                message: message.trim(),
                website: honeypot,
            });

            if (res.data.success) {
                setIsModalOpen(true);
            } else {
                setErrorMsg(res.data.message || t('inquiry.errorNetwork'));
            }
        } catch (error) {
            console.error('Error submitting inquiry:', error);
            setErrorMsg(error.response?.data?.message || t('inquiry.errorNetwork'));
        } finally {
            setSubmitting(false);
        }
    };

    const inputClass = "inquiry-input focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]";
    const labelClass = "text-sm font-bold text-slate-700";

    return (
        <div className="inquiry-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-6 sm:py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-4xl space-y-6 sm:space-y-8 flex flex-col justify-start text-left">

                {/*Page Heading*/}
                <div>
                    <h1 className="inquiry-heading text-3xl font-extrabold tracking-tight m-0 flex items-center gap-3" style={{ color: '#3b4276' }}>
                        <FontAwesomeIcon icon={faEnvelopeOpenText} />
                        {t('inquiry.heading')}
                    </h1>
                    <p className="text-slate-500 text-sm mt-2 m-0">{t('inquiry.subtitle')}</p>
                </div>

                {errorMsg && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-start gap-2.5">
                        <FontAwesomeIcon icon={faExclamationTriangle} className="mt-0.5 shrink-0" />
                        <span className="font-medium">{errorMsg}</span>
                    </div>
                )}

                <form
                    className="inquiry-form-card bg-white rounded-3xl border border-slate-100 shadow-md p-5 sm:p-8 md:p-10 grid grid-cols-1 md:grid-cols-2 gap-6 items-start"
                    onSubmit={handleSubmit}
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
                        <label className={labelClass} style={{ color: '#3b4276' }}>{t('inquiry.fullName')}</label>
                        <input
                            type="text"
                            required
                            maxLength={150}
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder={t('inquiry.fullNamePlaceholder')}
                            className={inputClass}
                            style={{ color: '#1e293b' }}
                        />
                    </div>

                    <div className="flex flex-col space-y-2">
                        <label className={labelClass} style={{ color: '#3b4276' }}>{t('inquiry.contactNo')}</label>
                        <input
                            type="tel"
                            required
                            maxLength={16}
                            inputMode="tel"
                            value={contactNo}
                            onChange={(e) => setContactNo(e.target.value)}
                            placeholder={t('inquiry.contactNoPlaceholder')}
                            className={inputClass}
                            style={{ color: '#1e293b' }}
                        />
                    </div>

                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label className={labelClass} style={{ color: '#3b4276' }}>{t('inquiry.email')}</label>
                        <input
                            type="email"
                            required
                            maxLength={150}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder={t('inquiry.emailPlaceholder')}
                            className={inputClass}
                            style={{ color: '#1e293b' }}
                        />
                    </div>

                    <div className="flex flex-col space-y-2">
                        <label className={labelClass} style={{ color: '#3b4276' }}>{t('inquiry.unit')}</label>
                        <select
                            value={roomName}
                            onChange={(e) => setRoomName(e.target.value)}
                            className={inputClass}
                            style={{ color: '#1e293b' }}
                            disabled={loadingRooms}
                        >
                            <option value="">{loadingRooms ? t('inquiry.loadingRooms') : t('inquiry.unitAny')}</option>
                            {rooms.map(room => (
                                <option key={room.id} value={room.id}>
                                    Room {room.id} — {room.type} (₱{Number(room.rent).toLocaleString()}/mo)
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex flex-col space-y-2">
                        <label className={labelClass} style={{ color: '#3b4276' }}>
                            {t('inquiry.occupants')} <span className="text-slate-400 font-medium">({t('inquiry.optional')})</span>
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="20"
                            value={occupants}
                            onChange={(e) => setOccupants(e.target.value)}
                            placeholder={t('inquiry.occupantsPlaceholder')}
                            className={inputClass}
                            style={{ color: '#1e293b' }}
                        />
                    </div>

                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label className={labelClass} style={{ color: '#3b4276' }}>
                            {t('inquiry.moveIn')} <span className="text-slate-400 font-medium">({t('inquiry.optional')})</span>
                        </label>
                        <input
                            type="date"
                            value={moveIn}
                            min={localDateString()}
                            onChange={(e) => setMoveIn(e.target.value)}
                            className={inputClass}
                            style={{ color: '#1e293b' }}
                        />
                    </div>

                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label className={labelClass} style={{ color: '#3b4276' }}>
                            {t('inquiry.message')} <span className="text-slate-400 font-medium">({t('inquiry.optional')})</span>
                        </label>
                        <textarea
                            rows="5"
                            value={message}
                            maxLength={LIMITS.message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder={t('inquiry.messagePlaceholder')}
                            className={`${inputClass} resize-y`}
                            style={{ color: '#1e293b' }}
                        />
                    </div>

                    <div className="md:col-span-2 flex items-start gap-2.5 text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-3.5">
                        <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5 shrink-0 text-indigo-400" />
                        <span>{t('inquiry.note')}</span>
                    </div>

                    <div className="md:col-span-2 flex justify-end">
                        <button
                            type="submit"
                            disabled={submitting}
                            className="inquiry-submit-btn btn-interactive bg-[#3b4276] hover:bg-[#2f3560] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3.5 px-10 rounded-xl text-sm transition-all shadow-md border-0 cursor-pointer min-h-[48px]"
                        >
                            {submitting ? t('inquiry.submitting') : t('inquiry.submit')}
                        </button>
                    </div>
                </form>
            </div>

            <SuccessModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); navigate('/preview'); }}
                message={t('inquiry.success')}
            />
        </div>
    );
}
