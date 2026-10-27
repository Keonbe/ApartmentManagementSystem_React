import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileContract, faUsers, faCalendarAlt, faHourglassHalf, faCalendarPlus, faSignOutAlt, faMapMarkerAlt, faExclamationTriangle, faBolt, faReceipt, faClipboardList } from '@fortawesome/free-solid-svg-icons';
import ApartmentPic from '../assets/Apartment_Pic.webp';
import api from "../api/axiosConfig";
import HouseholdPanel from '../Components/HouseholdPanel';
import RoomKeyTag from '../Components/tenant/RoomKeyTag';
import Disclosure from '../Components/tenant/Disclosure';
import SuccessModal from '../Components/SuccessModal';
import useInvoiceWatch, { AWAITING_STATUSES, PAYABLE_STATUSES } from '../hooks/useInvoiceWatch';
import useDialog from '../hooks/useDialog';
import { isPastDue } from '../utils/billingPeriod';
import { addDays, checkDate, checkIntRange } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import { blockNonIntegerKeys, invalidCls } from '../Components/form/formHelpers';

const MAX_OCCUPANTS = 8;
const MAX_EXTENSION_MONTHS = 12;
// Defaults for the move-out notice window; the live values come from Settings → Rental (record_move_out.php enforces them too).
const DEFAULT_MOVE_OUT_MIN_DAYS = 15;
const DEFAULT_MOVE_OUT_MAX_DAYS = 30;
import { getSystemSettings } from '../config/systemSettings';
import { useLang } from '../config/i18n';
import '../assets/styles/responsive/user/my-room.responsive.css';

export default function MyRoom() {
    const navigate = useNavigate();
    // my_room.php: { allowed, reason, overdueTotal, maxMonthsAhead }. An overdue
    // bill, a scheduled move-out or an inactive contract blocks extending.
    const [extension, setExtension] = useState(null);
    const extensionBlocked = extension && !extension.allowed;
    const [additionalMonths, setAdditionalMonths] = useState(1);
    const { t } = useLang();
    // Move-out notice window in days from today (Settings → Rental).
    const [moveOutNotice, setMoveOutNotice] = useState({ min: DEFAULT_MOVE_OUT_MIN_DAYS, max: DEFAULT_MOVE_OUT_MAX_DAYS });
    // Settings → Rental → Maximum Occupants per Unit, and the per-person
    // surcharge above 4 (both were hardcoded as 8 and ₱1,000).
    const [maxOccupants, setMaxOccupants] = useState(MAX_OCCUPANTS);
    const [surchargePerPerson, setSurchargePerPerson] = useState(1000);
    useEffect(() => {
        let alive = true;
        getSystemSettings().then((s) => {
            if (!alive) return;
            setMoveOutNotice({ min: s.moveOutMinNoticeDays || DEFAULT_MOVE_OUT_MIN_DAYS, max: s.moveOutMaxNoticeDays || DEFAULT_MOVE_OUT_MAX_DAYS });
            setMaxOccupants(s.maxOccupantsPerUnit || MAX_OCCUPANTS);
            setSurchargePerPerson(s.occupantSurchargePerPerson);
        });
        return () => { alive = false; };
    }, []);

    const [loggedInUser] = useState(() => {
        const sessionData = sessionStorage.getItem("loggedInUser") || localStorage.getItem("loggedInUser");
        return sessionData ? JSON.parse(sessionData) : null;
    });

    const activeEmail = loggedInUser?.email_address || "";
    const activeFirstName = loggedInUser?.first_name || "";

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [roomDetails, setRoomDetails] = useState({
        name: "Unassigned",
        type: "Studio Apartment",
        monthlyRent: 0,
        rentStart: "Pending",
        paymentDue: "Pending",
        status: "N/A"
    });

    const [occupants, setOccupants] = useState(2);
    const [expectedEnd, setExpectedEnd] = useState('');
    const [daysUntilExpiration, setDaysUntilExpiration] = useState(null);
    const [moveOutDaysLeft, setMoveOutDaysLeft] = useState(null);
    const [showMoveOutModal, setShowMoveOutModal] = useState(false);
    const [moveOutDate, setMoveOutDate] = useState('');

    const [currentOccupants, setCurrentOccupants] = useState(2);

    // One my_room.php read: room, contract end, occupants and the extension
    // range. Called again after a request is sent, instead of reloading the page.
    const loadRoom = useCallback(async () => {
        if (!activeEmail) {
            setError("No active user session found.");
            setLoading(false);
            return;
        }
        try {
            const res = await api.get(`/my_room.php?email=${encodeURIComponent(activeEmail)}`);
            if (res.data.success && res.data.data) {
                const data = res.data.data;
                const creationDate = new Date(data.created_at);

                const endDate = data.lease_end ? new Date(data.lease_end) : new Date(creationDate);
                if (!data.lease_end) {
                    endDate.setMonth(endDate.getMonth() + parseInt(data.months_of_rent));
                }

                setRoomDetails({
                    name: data.room_name,
                    type: data.room_type || '',
                    floor: data.room_floor || '',
                    monthlyRent: parseFloat(data.monthly_rent) || 0,
                    rentStart: (data.lease_start ? new Date(data.lease_start) : creationDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
                    status: data.status,
                    requestedMoveOutDate: data.requested_move_out_date,
                    // Itemized move-out deductions from the deposit (empty until clearance).
                    depositDeductions: Array.isArray(data.deposit_deductions) ? data.deposit_deductions : []
                });

                setDaysUntilExpiration(Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                // Days until a requested move-out (shown under "Ending your rent").
                setMoveOutDaysLeft(data.requested_move_out_date
                    ? Math.ceil((new Date(`${String(data.requested_move_out_date).slice(0, 10)}T00:00:00`).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    : null);
                setExpectedEnd(endDate.toISOString().split('T')[0]);

                if (data.occupants) {
                    const count = parseInt(data.occupants, 10);
                    setOccupants(count);
                    setCurrentOccupants(count);
                }

                setExtension(data.extension || null);
                // Start the months picker inside the allowed range.
                if (data.extension?.minMonths) {
                    const lo = data.extension.minMonths;
                    const hi = Math.max(lo, data.extension.maxMonths ?? MAX_EXTENSION_MONTHS);
                    setAdditionalMonths(prev => (prev === '' || prev < lo ? lo : Math.min(prev, hi)));
                }
                setError(null);
            } else {
                setError("No active room assignments found.");
            }
        } catch (err) {
            console.error("Failed to fetch room details:", err);
            setError("Failed to connect to the server.");
        } finally {
            setLoading(false);
        }
    }, [activeEmail]);

    useEffect(() => {
        const load = async () => { await loadRoom(); };
        load();
    }, [loadRoom]);

    // The next bill, from the invoices themselves (the same list Pay Bills uses):
    // the earliest-due bill still to pay, else one awaiting confirmation. An
    // advance-rent invoice is an optional prepayment, not a bill, so it is left out.
    const { invoices, loaded: invoicesLoaded } = useInvoiceWatch();
    const byDueDate = (a, b) => String(a.due_date || '').localeCompare(String(b.due_date || ''));
    const bills = invoices.filter(i => !i.advance_months);
    const nextBill = bills.filter(i => PAYABLE_STATUSES.includes(i.status)).sort(byDueDate)[0]
        || bills.filter(i => AWAITING_STATUSES.includes(i.status)).sort(byDueDate)[0]
        || null;
    const nextBillOwed = nextBill ? (parseFloat(nextBill.balance ?? nextBill.total_amount) || 0) : 0;
    const nextBillAwaiting = !!nextBill && AWAITING_STATUSES.includes(nextBill.status);
    const fmtMoney = (n) => `₱${(parseFloat(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    const fmtDay = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '');

    // Results of the requests below (were alert() + page reload).
    const [notice, setNotice] = useState(null);

    const handleOccupantChange = (e) => {
        fields.clearError('occupants');
        let val = parseInt(e.target.value);
        if (isNaN(val)) {
            setOccupants('');
            return;
        }
        if (val > maxOccupants) val = maxOccupants;
        if (val < 1) val = 1;
        setOccupants(val);
    };
    const handleUpdateOccupants = async (e) => {
        if (e) e.preventDefault();
        if (busy) return;

        if (fields.validateField('occupants', fieldValues)) return;

        setBusy('occupants');
        try {
            const res = await api.post('/update_occupants.php', {
                email: activeEmail,
                occupants: occupants
            }, {
                headers: { 'Content-Type': 'application/json' }
            });

            if (res.data.success) {
                setNotice({ message: 'Request sent', subtext: 'Your request to change the number of occupants has been sent to management for verification. You will be notified of their decision.' });
                await loadRoom();
            } else {
                fields.setFieldError('occupants', res.data.message || 'Your request could not be sent.');
            }
        } catch (err) {
            console.error("Failed to update occupants:", err);
            fields.setFieldError('occupants', apiErrorMessage(err, "A network error occurred while submitting your request."));
        } finally {
            setBusy('');
        }
    };


    const [busy, setBusy] = useState(''); // 'occupants' | 'extend' | 'moveout' while a request runs

    // The months a request may ask for, from my_room.php: Minimum Rent Duration,
    // shrunk to what still fits under the months-ahead limit (the server checks
    // the same range).
    const minExtension = extension?.minMonths || 1;
    const maxExtension = Math.max(minExtension, extension?.maxMonths ?? MAX_EXTENSION_MONTHS);

    const fields = useFieldErrors({
        occupants: (v, all) => checkIntRange(v === '' ? NaN : v, 1, maxOccupants, 'Number of occupants')
            || (Number(v) === all.currentOccupants ? `Your room is already assigned to ${v} occupant(s).` : ''),
        additionalMonths: (v) => checkIntRange(v === '' ? NaN : v, minExtension, maxExtension, 'Additional months'),
        move_out_date: (v) => checkDate(v, { label: 'Move-out date', min: addDays(moveOutNotice.min), max: addDays(moveOutNotice.max) })
            .replace(/cannot be before .*/, `must be at least ${moveOutNotice.min} days from today.`)
            .replace(/cannot be after .*/, `cannot be more than ${moveOutNotice.max} days from today.`),
    }, { idPrefix: 'myroom-' });
    const fieldValues = { occupants, currentOccupants, additionalMonths, move_out_date: moveOutDate };

    const handleExtendRent = async (e) => {
        if (e) e.preventDefault();
        if (busy) return;

        const months = Number(additionalMonths);
        if (fields.validateField('additionalMonths', fieldValues)) return;

        setBusy('extend');
        try {
            const res = await api.post('/extend_lease.php', {
                email: activeEmail,
                additionalMonths: months
            }, {
                headers: { 'Content-Type': 'application/json' }
            });

            if (res.data.success) {
                setNotice({ message: 'Extension request sent', subtext: `Your request to extend your rent by ${months} month${months === 1 ? '' : 's'} has been sent to management for verification. You will be notified of their decision.` });
                await loadRoom();
            } else {
                fields.setFieldError('additionalMonths', res.data.message || 'Your request could not be sent.');
            }
        } catch (err) {
            console.error("Failed to extend lease:", err);
            fields.setFieldError('additionalMonths', apiErrorMessage(err, "A network error occurred while submitting your request."));
        } finally {
            setBusy('');
        }
    };

    // Not closable while the notice is being sent.
    const closeMoveOutModal = () => { if (busy !== 'moveout') setShowMoveOutModal(false); };
    const moveOutDialogRef = useDialog(showMoveOutModal, closeMoveOutModal);

    const handleEndRent = () => {
        setMoveOutDate(addDays(moveOutNotice.min));
        fields.clearError('move_out_date');
        setShowMoveOutModal(true);
    };

    const handleConfirmMoveOut = async () => {
        if (busy) return;
        // Notice must fall inside the configured window (record_move_out.php checks it too).
        if (fields.validateField('move_out_date', fieldValues)) return;

        setBusy('moveout');
        try {
            const res = await api.post('/record_move_out.php', {
                email: activeEmail,
                move_out_date: moveOutDate
            });

            if (res.data.success) {
                setShowMoveOutModal(false);
                setNotice({ message: 'Move-out notice sent', subtext: `Management has your notice to move out on ${fmtDay(moveOutDate)}. You will be contacted about the room inspection and your deposit.` });
                await loadRoom();
            } else {
                fields.setFieldError('move_out_date', res.data.message || 'Failed to submit termination request.');
            }
        } catch (err) {
            console.error("Move-out error:", err);
            fields.setFieldError('move_out_date', apiErrorMessage(err, "Failed to submit termination request. Please try again."));
        } finally {
            setBusy('');
        }
    };


    // "Manage your rent": which panel is open ('occupants' | 'extend' | null).
    // A panel with an error stays open so the message is seen.
    const [openPanel, setOpenPanel] = useState(null);

    if (loading) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-950 text-white">
                <div className="flex flex-col items-center gap-4" role="status">
                    <FontAwesomeIcon icon={faHourglassHalf} className="text-4xl text-indigo-300 animate-spin" aria-hidden="true" />
                    <p className="m-0 text-lg font-semibold">Loading your room…</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-950 text-white px-4">
                <section className="bg-slate-900/80 p-8 rounded-2xl border border-white/10 text-center max-w-md">
                    <h1 className="m-0 text-2xl font-bold">No room to show</h1>
                    <p className="m-0 mt-2 text-sm text-slate-300">{error}</p>
                    <button
                        type="button"
                        onClick={() => navigate('/preview')}
                        className="mt-6 min-h-[44px] px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold border-0 cursor-pointer"
                    >
                        Browse available rooms
                    </button>
                </section>
            </div>
        );
    }

    const PANEL = 'bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-2xl';
    const BTN_PRIMARY = 'inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold border-0 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
    const INPUT = 'w-full min-h-[44px] px-4 rounded-xl bg-slate-950/60 border border-white/15 text-white text-base font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-300 box-border';

    const status = String(roomDetails.status || '').toLowerCase();
    const movingOut = status === 'pending-move-out';
    const movedOut = ['moved-out', 'archived'].includes(status);
    const keyTagStatus = movingOut
        ? { label: roomDetails.requestedMoveOutDate ? `Moving out ${fmtDay(roomDetails.requestedMoveOutDate)}` : t('myRoom.moveOutPending'), tone: 'action' }
        : movedOut ? { label: 'Moved out', tone: 'neutral' }
        : ['active', 'approved'].includes(status) ? { label: t('myRoom.activeTenancy'), tone: 'done' }
        : { label: roomDetails.status, tone: 'neutral' };
    const rentEndingSoon = !movingOut && daysUntilExpiration !== null && daysUntilExpiration > 0 && daysUntilExpiration <= 30;
    const occupantsOpen = openPanel === 'occupants' || !!fields.errors.occupants;
    const extendOpen = openPanel === 'extend' || !!fields.errors.additionalMonths;
    const toggle = (key) => setOpenPanel((p) => (p === key ? null : key));
    const openExtend = () => {
        setOpenPanel('extend');
        document.getElementById('manage-extend')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    const daysLeft = moveOutDaysLeft;

    const quickLinks = [
        { label: 'Contract', icon: faFileContract, to: '/view-contract' },
        { label: 'Utilities & meters', icon: faBolt, to: '/user-utilities' },
        { label: 'Payment history', icon: faReceipt, to: '/payment-history' },
        { label: 'My requests', icon: faClipboardList, to: '/my-requests' },
    ];


    return (
        <div className="my-room-root w-full min-h-[calc(100vh-76px)] relative flex flex-col items-center justify-start box-border py-8 sm:py-10 px-4 md:px-12">

            {/* Hardware-accelerated fixed background prevents re-rasterization on scroll */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" style={{ transform: 'translateZ(0)' }} aria-hidden="true">
                <img src={ApartmentPic} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                <div className="absolute inset-0 bg-gradient-to-b from-slate-950/90 via-slate-900/85 to-slate-950/95"></div>
            </div>

            <div className="w-full max-w-5xl z-10 flex flex-col gap-8 text-left">
                <header>
                    <h1 className="m-0 text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                        {activeFirstName ? `Welcome back, ${activeFirstName}` : 'Welcome back'}
                    </h1>
                    <p className="m-0 mt-2 flex items-center gap-2 text-sm sm:text-base text-slate-300">
                        <FontAwesomeIcon icon={faMapMarkerAlt} aria-hidden="true" />
                        {t('preview.location')}
                    </p>
                </header>

                {/* The key tag, and what the tenant checks most beside it. */}
                <div className="my-room-top grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] gap-6 items-start">
                    <RoomKeyTag
                        room={roomDetails.name}
                        type={roomDetails.type}
                        floor={roomDetails.floor}
                        monthlyRent={fmtMoney(roomDetails.monthlyRent)}
                        rentUntil={expectedEnd ? fmtDay(expectedEnd) : ''}
                        statusLabel={keyTagStatus.label}
                        statusTone={keyTagStatus.tone}
                    />

                    <div className="flex flex-col gap-4 min-w-0">
                        <section aria-labelledby="next-bill-heading" className={`${PANEL} p-5 sm:p-6`}>
                            <h2 id="next-bill-heading" className="m-0 text-base font-semibold text-slate-200">{t('myRoom.nextBillDue')}</h2>
                            {!invoicesLoaded ? (
                                <p className="m-0 mt-3 text-sm text-slate-300">Loading your bills…</p>
                            ) : nextBill ? (
                                <div className="mt-3 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                                    <div>
                                        <p className="m-0 text-3xl font-extrabold text-white tabular-nums">{fmtMoney(nextBillOwed)}</p>
                                        <p className="m-0 mt-1 text-sm text-slate-300">
                                            {nextBill.billing_period || 'Your bill'}
                                            {' · '}
                                            {nextBillAwaiting ? (
                                                <span className="font-semibold text-sky-300">being confirmed by management</span>
                                            ) : isPastDue(nextBill) ? (
                                                <span className="font-semibold text-rose-300">overdue since {fmtDay(nextBill.due_date)}</span>
                                            ) : (
                                                <>due {fmtDay(nextBill.due_date)}</>
                                            )}
                                        </p>
                                    </div>
                                    {!nextBillAwaiting && (
                                        <button type="button" onClick={() => navigate('/pay-bills')} className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold border-0 cursor-pointer shrink-0">
                                            {t('myRoom.payRentBalance')}
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <p className="m-0 mt-3 text-base font-semibold text-emerald-300">You're all paid up. No open bill right now.</p>
                            )}
                        </section>

                        {rentEndingSoon && (
                            <div role="status" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4">
                                <p className="m-0 flex items-start gap-3 text-sm text-amber-100">
                                    <FontAwesomeIcon icon={faCalendarAlt} className="mt-0.5 text-amber-300" aria-hidden="true" />
                                    <span>
                                        <strong className="text-amber-200">Your rent ends in {daysUntilExpiration} day{daysUntilExpiration === 1 ? '' : 's'}</strong>, on {fmtDay(expectedEnd)}. Extend it to keep your room.
                                    </span>
                                </p>
                                <button type="button" onClick={openExtend} className="min-h-[44px] px-4 rounded-xl bg-amber-300 hover:bg-amber-200 text-slate-950 text-sm font-bold border-0 cursor-pointer shrink-0">
                                    Extend rent
                                </button>
                            </div>
                        )}

                        <nav aria-label="Room shortcuts" className="flex flex-wrap gap-2">
                            {quickLinks.map((link) => (
                                <button
                                    key={link.to}
                                    type="button"
                                    onClick={() => navigate(link.to)}
                                    className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-semibold text-white cursor-pointer transition-colors"
                                >
                                    <FontAwesomeIcon icon={link.icon} className="text-indigo-300" aria-hidden="true" />
                                    {link.label}
                                </button>
                            ))}
                        </nav>
                    </div>
                </div>

                <HouseholdPanel />

                {!movedOut && (
                    <section aria-labelledby="manage-rent-heading">
                        <h2 id="manage-rent-heading" className="m-0 mb-3 text-xl font-bold text-white">Manage your rent</h2>
                        <div className={`${PANEL} overflow-hidden`}>
                            <Disclosure
                                id="manage-occupants"
                                icon={faUsers}
                                title="Change number of occupants"
                                summary={`Currently ${currentOccupants} ${currentOccupants === 1 ? 'person' : 'people'}. Management approves changes.`}
                                open={occupantsOpen}
                                onToggle={() => toggle('occupants')}
                            >
                                <form onSubmit={handleUpdateOccupants} className="m-0 grid gap-3 sm:max-w-md" noValidate>
                                    <label htmlFor="myroom-occupants" className="text-sm font-bold text-slate-100">Number of occupants (1 to {maxOccupants})</label>
                                    <input
                                        type="number"
                                        {...fields.fieldA11y('occupants')}
                                        inputMode="numeric"
                                        min="1"
                                        max={maxOccupants}
                                        step="1"
                                        value={occupants}
                                        onKeyDown={blockNonIntegerKeys}
                                        onChange={handleOccupantChange}
                                        onBlur={() => occupants !== currentOccupants && fields.validateField('occupants', fieldValues)}
                                        className={`${INPUT}${invalidCls(fields.errors.occupants)}`}
                                        required
                                    />
                                    <p className="m-0 text-sm text-slate-300">
                                        {surchargePerPerson > 0 ? `Each person above 4 adds ₱${surchargePerPerson.toLocaleString()} a month.` : 'There is no extra charge per person.'}
                                        {occupants > 4 && surchargePerPerson > 0 && <strong className="text-amber-200"> With {occupants}: +₱{((occupants - 4) * surchargePerPerson).toLocaleString()} a month.</strong>}
                                    </p>
                                    <FieldError id="myroom-occupants" error={fields.errors.occupants} className="m-0" />
                                    <button type="submit" disabled={!!busy} className={`${BTN_PRIMARY} justify-self-start`}>
                                        {busy === 'occupants' ? 'Sending…' : 'Send request'}
                                    </button>
                                </form>
                            </Disclosure>

                            <div id="manage-extend">
                                <Disclosure
                                    id="manage-extend-panel"
                                    icon={faCalendarPlus}
                                    title={t('myRoom.extendLease')}
                                    summary={extensionBlocked
                                        ? 'Not available right now. Open to see why.'
                                        : `Add ${minExtension === maxExtension ? minExtension : `${minExtension} to ${maxExtension}`} month${maxExtension === 1 ? '' : 's'}. Management approves the request.`}
                                    open={extendOpen}
                                    onToggle={() => toggle('extend')}
                                >
                                    <form onSubmit={handleExtendRent} className="m-0 grid gap-3 sm:max-w-md" noValidate>
                                        <p className="m-0 text-sm leading-relaxed text-slate-300">
                                            Each added month is billed a week before it starts.
                                            {extension?.maxMonthsAhead ? ` Your rent can reach at most ${extension.maxMonthsAhead} month(s) from today.` : ''}
                                        </p>
                                        {extensionBlocked && (
                                            <div role="status" className="flex flex-col items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-100">
                                                <p className="m-0 flex items-start gap-2">
                                                    <FontAwesomeIcon icon={faExclamationTriangle} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
                                                    {extension.reason}
                                                </p>
                                                {extension.overdueTotal > 0 && (
                                                    <button type="button" onClick={() => navigate('/pay-bills')} className="min-h-[44px] px-4 rounded-xl bg-amber-300 hover:bg-amber-200 text-slate-950 text-sm font-bold border-0 cursor-pointer">
                                                        Go to Pay Bills
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                        <label htmlFor="myroom-additionalMonths" className="text-sm font-bold text-slate-100">
                                            Months to add ({minExtension === maxExtension ? minExtension : `${minExtension} to ${maxExtension}`})
                                        </label>
                                        <input
                                            type="number"
                                            {...fields.fieldA11y('additionalMonths')}
                                            inputMode="numeric"
                                            min={minExtension}
                                            max={maxExtension}
                                            step="1"
                                            value={additionalMonths}
                                            onKeyDown={blockNonIntegerKeys}
                                            onChange={(e) => {
                                                fields.clearError('additionalMonths');
                                                const intVal = parseInt(e.target.value, 10);
                                                // Empty while typing; blur/submit report it.
                                                if (isNaN(intVal) || intVal < 1) {
                                                    setAdditionalMonths('');
                                                    return;
                                                }
                                                setAdditionalMonths(Math.min(intVal, maxExtension));
                                            }}
                                            onBlur={() => fields.validateField('additionalMonths', fieldValues)}
                                            disabled={extensionBlocked}
                                            className={`${INPUT} disabled:opacity-60${invalidCls(fields.errors.additionalMonths)}`}
                                            required
                                        />
                                        <FieldError id="myroom-additionalMonths" error={fields.errors.additionalMonths} className="m-0" />
                                        <button type="submit" disabled={!!busy || extensionBlocked} className={`${BTN_PRIMARY} justify-self-start`}>
                                            {busy === 'extend' ? 'Sending…' : 'Send extension request'}
                                        </button>
                                    </form>
                                </Disclosure>
                            </div>
                        </div>
                    </section>
                )}

                {/* Ending the rent: quiet on purpose, at the bottom of the page. */}
                <section aria-labelledby="end-rent-heading" className="rounded-2xl border border-rose-400/25 bg-slate-900/60 p-5 sm:p-6">
                    <h2 id="end-rent-heading" className="m-0 text-base font-bold text-white">Ending your rent</h2>
                    {movingOut ? (
                        <div className="mt-3 space-y-1 text-sm text-slate-200">
                            <p className="m-0">
                                Your move-out date is <strong className="text-white">{roomDetails.requestedMoveOutDate ? fmtDay(roomDetails.requestedMoveOutDate) : 'not set yet'}</strong>
                                {daysLeft !== null && (daysLeft > 0 ? `, ${daysLeft} day${daysLeft === 1 ? '' : 's'} from now.` : ', today.')}
                            </p>
                            <p className="m-0 text-slate-300">Management will contact you about the room inspection and your deposit.</p>
                        </div>
                    ) : movedOut ? (
                        roomDetails.depositDeductions?.length > 0 ? (
                            <div className="mt-3 space-y-2">
                                <p className="m-0 text-sm font-semibold text-slate-200">Deducted from your security deposit</p>
                                {roomDetails.depositDeductions.map((d, i) => (
                                    <div key={i} className="flex justify-between gap-3 text-sm text-slate-300">
                                        <span className="min-w-0"><strong className="text-slate-100">{d.label || d.category}</strong>{d.reason ? `: ${d.reason}` : ''}</span>
                                        <span className="font-semibold text-white shrink-0 tabular-nums">{fmtMoney(d.amount)}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="m-0 mt-3 text-sm text-slate-300">Your rent has ended.</p>
                        )
                    ) : (
                        <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <p className="m-0 text-sm leading-relaxed text-slate-300">
                                Give notice {moveOutNotice.min} to {moveOutNotice.max} days before your move-out date. Management then arranges the room inspection and your deposit.
                            </p>
                            <button
                                type="button"
                                onClick={handleEndRent}
                                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-transparent border border-rose-300/60 text-rose-200 hover:bg-rose-400/10 text-sm font-bold cursor-pointer shrink-0"
                            >
                                <FontAwesomeIcon icon={faSignOutAlt} aria-hidden="true" /> {t('myRoom.endRentTerm')}
                            </button>
                        </div>
                    )}
                </section>
            </div>

            {/* ─── MOVE OUT SCHEDULING MODAL ─── */}
            {showMoveOutModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm modal-overlay-anim" onClick={closeMoveOutModal}>
                    <div ref={moveOutDialogRef} role="dialog" aria-modal="true" aria-labelledby="move-out-title" tabIndex={-1} className="my-room-modal-content modal-card-anim sheet-mobile bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden outline-none" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
                            <div className="w-10 h-10 rounded-xl bg-rose-400/10 text-rose-300 flex items-center justify-center border border-rose-400/30" aria-hidden="true">
                                <FontAwesomeIcon icon={faSignOutAlt} />
                            </div>
                            <div>
                                <h3 id="move-out-title" className="text-base font-bold text-white m-0">End your rent</h3>
                                <p className="text-sm text-slate-300 m-0 mt-0.5">Send a move-out notice to management</p>
                            </div>
                        </div>

                        <div className="p-6 space-y-4 text-left">
                            <p className="m-0 flex items-start gap-3 rounded-xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm leading-relaxed text-slate-200">
                                <FontAwesomeIcon icon={faExclamationTriangle} className="text-rose-300 mt-0.5 shrink-0" aria-hidden="true" />
                                <span>Your move-out date must be at least <strong className="text-white">{moveOutNotice.min} days</strong> and at most <strong className="text-white">{moveOutNotice.max} days</strong> from today.</span>
                            </p>

                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="myroom-move_out_date" className="text-sm font-bold text-slate-100">Move-out date</label>
                                <input
                                    type="date"
                                    data-autofocus
                                    {...fields.fieldA11y('move_out_date')}
                                    value={moveOutDate}
                                    min={addDays(moveOutNotice.min)}
                                    max={addDays(moveOutNotice.max)}
                                    onChange={(e) => { setMoveOutDate(e.target.value); fields.clearError('move_out_date'); }}
                                    onBlur={() => fields.validateField('move_out_date', fieldValues)}
                                    className={`[color-scheme:dark] ${INPUT} focus:ring-rose-300${invalidCls(fields.errors.move_out_date)}`}
                                    required
                                />
                                <FieldError id="myroom-move_out_date" error={fields.errors.move_out_date} className="m-0" />
                            </div>
                        </div>

                        <div className="my-room-modal-actions flex items-center justify-end gap-3 px-6 py-4 bg-slate-950/40 border-t border-white/10">
                            <button
                                type="button"
                                onClick={closeMoveOutModal}
                                disabled={busy === 'moveout'}
                                className="min-h-[44px] px-4 text-sm text-slate-200 font-bold hover:text-white rounded-xl border-0 bg-transparent cursor-pointer disabled:opacity-50"
                            >
                                Keep my room
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmMoveOut}
                                disabled={!!busy}
                                className="min-h-[44px] px-5 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-sm font-bold border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {busy === 'moveout' ? 'Sending…' : 'Send move-out notice'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <SuccessModal
                isOpen={!!notice}
                onClose={() => setNotice(null)}
                message={notice?.message}
                subtext={notice?.subtext}
            />
        </div>
    );
}
