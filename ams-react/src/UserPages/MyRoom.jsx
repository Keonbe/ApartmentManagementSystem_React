import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileContract, faUsers, faCalendarAlt, faHourglassHalf, faCalendarPlus, faSignOutAlt, faMapMarkerAlt, faExclamationTriangle, faBolt } from '@fortawesome/free-solid-svg-icons';
import ApartmentPic from '../assets/Apartment_Pic.png';
import api from "../api/axiosConfig";
import HouseholdPanel from '../Components/HouseholdPanel';
import { addDays, checkDate, checkIntRange } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import { blockNonIntegerKeys, invalidCls } from '../Components/form/formHelpers';

const MAX_OCCUPANTS = 8;
const MAX_EXTENSION_MONTHS = 12;
// record_move_out.php: notice of at least 15 and at most 30 days.
const MOVE_OUT_MIN_DAYS = 15;
const MOVE_OUT_MAX_DAYS = 30;
import { useLang } from '../config/i18n';
import '../assets/styles/responsive/user/my-room.responsive.css';

export default function MyRoom() {
    const navigate = useNavigate();
    const { t } = useLang();

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
    const [showMoveOutModal, setShowMoveOutModal] = useState(false);
    const [moveOutDate, setMoveOutDate] = useState('');

    useEffect(() => {
        const fetchMyRoom = async () => {
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
                    const startDateString = creationDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

                    const nextMonth = new Date(creationDate);
                    nextMonth.setMonth(nextMonth.getMonth() + 1);
                    const dueDateString = nextMonth.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

                    const endDate = data.lease_end ? new Date(data.lease_end) : new Date(creationDate);
                    if (!data.lease_end) {
                        endDate.setMonth(endDate.getMonth() + parseInt(data.months_of_rent));
                    }

                    setRoomDetails({
                        name: data.room_name,
                        type: "Studio Apartment",
                        monthlyRent: parseFloat(data.monthly_rent),
                        rentStart: startDateString,
                        paymentDue: dueDateString,
                        status: data.status,
                        requestedMoveOutDate: data.requested_move_out_date
                    });

                    const diffTime = endDate.getTime() - new Date().getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    setDaysUntilExpiration(diffDays);

                    setExpectedEnd(endDate.toISOString().split('T')[0]);

                    if (data.occupants) {
                        setOccupants(parseInt(data.occupants));
                    }

                } else {
                    setError("No active room assignments found.");
                }
            } catch (err) {
                console.error("Failed to fetch room details:", err);
                setError("Failed to connect to the server.");
            } finally {
                setLoading(false);
            }
        };

        fetchMyRoom();
    }, [activeEmail]);

    const handleOccupantChange = (e) => {
        fields.clearError('occupants');
        let val = parseInt(e.target.value);
        if (isNaN(val)) {
            setOccupants('');
            return;
        }
        if (val > MAX_OCCUPANTS) val = MAX_OCCUPANTS;
        if (val < 1) val = 1;
        setOccupants(val);
    };
    const [currentOccupants, setCurrentOccupants] = useState(2);

    // 2. In your useEffect (fetchMyRoom), store current occupants when room data loads
    useEffect(() => {
        const fetchMyRoom = async () => {
            if (!activeEmail) return;
            try {
                const res = await api.get(`/my_room.php?email=${encodeURIComponent(activeEmail)}`);
                if (res.data.success && res.data.data) {
                    const data = res.data.data;

                    if (data.occupants) {
                        const count = parseInt(data.occupants, 10);
                        setOccupants(count);
                        setCurrentOccupants(count); // Store current baseline
                    }
                }
            } catch (err) {
                console.error("Failed to fetch current occupants:", err);
            }
        };
        fetchMyRoom();
    }, [activeEmail]);
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
                alert("Your request to change occupants has been sent to administration for verification.");
                // Refresh the current route
                window.location.reload();
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


    const handleSeeContract = () => {
        navigate('/view-contract');
    };

    const [additionalMonths, setAdditionalMonths] = useState(1);
    const [busy, setBusy] = useState(''); // 'occupants' | 'extend' | 'moveout' while a request runs

    const fields = useFieldErrors({
        occupants: (v, all) => checkIntRange(v === '' ? NaN : v, 1, MAX_OCCUPANTS, 'Number of occupants')
            || (Number(v) === all.currentOccupants ? `Your room is already assigned to ${v} occupant(s).` : ''),
        additionalMonths: (v) => checkIntRange(v === '' ? NaN : v, 1, MAX_EXTENSION_MONTHS, 'Additional months'),
        move_out_date: (v) => checkDate(v, { label: 'Move-out date', min: addDays(MOVE_OUT_MIN_DAYS), max: addDays(MOVE_OUT_MAX_DAYS) })
            .replace(/cannot be before .*/, `must be at least ${MOVE_OUT_MIN_DAYS} days from today.`)
            .replace(/cannot be after .*/, `cannot be more than ${MOVE_OUT_MAX_DAYS} days from today.`),
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
                alert("Your lease extension request has been sent to administration for verification.");
                // Refresh the current route
                window.location.reload();
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

    const handleEndRent = () => {
        setMoveOutDate(addDays(MOVE_OUT_MIN_DAYS));
        fields.clearError('move_out_date');
        setShowMoveOutModal(true);
    };

    const handleConfirmMoveOut = async () => {
        if (busy) return;
        // Notice must be 15–30 days ahead (record_move_out.php checks it too).
        if (fields.validateField('move_out_date', fieldValues)) return;

        setBusy('moveout');
        try {
            const res = await api.post('/record_move_out.php', {
                email: activeEmail,
                move_out_date: moveOutDate
            });

            if (res.data.success) {
                alert("Termination notice submitted successfully.");
                setShowMoveOutModal(false);
                window.location.reload();
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


    if (loading) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-900 text-white">
                <div className="flex flex-col items-center space-y-4">
                    <FontAwesomeIcon icon={faHourglassHalf} className="text-4xl text-indigo-500 animate-spin" />
                    <h2 className="text-xl font-bold">Loading Room Details...</h2>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-900 text-white">
                <div className="bg-slate-800/80 p-8 rounded-3xl border border-white/10 text-center max-w-md space-y-4 shadow-2xl">
                    <FontAwesomeIcon icon={faFileContract} className="text-5xl text-rose-500 mb-2" />
                    <h2 className="text-2xl font-bold">No Room Found</h2>
                    <p className="text-slate-400 text-sm">{error}</p>
                    <button
                        onClick={() => navigate('/rent-application')}
                        className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-6 rounded-xl transition-all"
                    >
                        Apply for a Room
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="my-room-root w-full min-h-[calc(100vh-76px)] relative flex flex-col items-center justify-start box-border py-8 sm:py-10 px-4 md:px-12">

            {/* Hardware-accelerated fixed background prevents re-rasterization on scroll */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" style={{ transform: 'translateZ(0)' }}>
                <img
                    src={ApartmentPic}
                    alt="Apartment Background"
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-slate-950/90 via-slate-900/85 to-slate-950/95"></div>
            </div>

            <div className="w-full max-w-6xl z-10 space-y-8 flex flex-col justify-start text-left">

                {daysUntilExpiration !== null && daysUntilExpiration > 0 && daysUntilExpiration <= 30 && (
                    <div className="bg-amber-500/20 border border-amber-500/50 rounded-2xl p-4 text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center space-x-3">
                            <FontAwesomeIcon icon={faCalendarAlt} className="text-amber-400 text-2xl" />
                            <div>
                                <h4 className="font-bold text-amber-300 m-0 text-sm">Lease Expiring Soon!</h4>
                                <p className="text-xs m-0 mt-0.5 text-amber-200/90">
                                    Your current lease contract expires in <strong>{daysUntilExpiration} days</strong> ({expectedEnd}). Submit an extension to prevent service disruption.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="my-room-banner animate-fade-in-up bg-slate-900/80 border border-white/10 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex flex-wrap gap-2 items-center">
                            <span className={`text-[9px] tracking-widest uppercase font-black px-2.5 py-1 rounded select-none ${roomDetails.status === 'Approved' ? 'bg-[#10b981] text-white' : 'bg-[#6366f1] text-white'}`}>
                                {roomDetails.status === 'Approved' ? t('myRoom.activeTenancy') : `Status: ${roomDetails.status}`}
                            </span>
                            <span className="text-xs text-indigo-300 font-bold flex items-center space-x-1">
                                <FontAwesomeIcon icon={faMapMarkerAlt} className="text-[10px]" />
                                <span>Maguyam Silang, Cavite</span>
                            </span>
                        </div>

                        <h1 className="text-3xl md:text-4xl font-sans font-extrabold m-0 text-white tracking-tight leading-tight">
                            {activeFirstName ? `Welcome Back, ${activeFirstName}` : "Welcome Back"}
                        </h1>

                        <h2 className="text-xl font-sans font-bold m-0 text-indigo-200 tracking-tight pt-0.5">
                            {t('myRoom.assignedUnit')} {roomDetails.name}
                        </h2>

                        <p className="text-slate-300 text-xs sm:text-sm m-0 font-medium pt-1">
                            {roomDetails.type} — {t('myRoom.subtext')}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={() => navigate('/user-utilities')}
                            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-2xl text-xs border border-indigo-400/30 cursor-pointer transition-all shadow-md hover:shadow-indigo-500/20"
                        >
                            <FontAwesomeIcon icon={faBolt} className="text-amber-400" />
                            <span>Utility Usage &amp; Meters</span>
                        </button>
                    </div>
                </div>

                <div className="my-room-cards-grid stagger-children grid grid-cols-1 md:grid-cols-3 gap-6">

                    <div className="my-room-card card-interactive bg-slate-900/80 rounded-3xl border border-white/10 shadow-xl p-6 flex flex-col justify-between space-y-6">
                        <div className="space-y-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-300 flex items-center justify-center shrink-0 border border-indigo-500/20">
                                    <FontAwesomeIcon icon={faFileContract} className="text-lg" />
                                </div>
                                <h3 className="text-lg font-bold text-white m-0">{t('myRoom.leaseContract')}</h3>
                            </div>
                            <p className="text-slate-300 text-xs leading-relaxed m-0 font-medium">
                                View legal bindings, rules, and document authentications associated with your rented room unit.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleSeeContract}
                            className="w-full bg-[#6366f1] hover:bg-[#4f46e5] text-white font-bold py-2.5 rounded-xl text-xs border-0 cursor-pointer transition-all shadow-md"
                        >
                            {t('myRoom.seeContract')}
                        </button>
                    </div>

                    <div className="my-room-card card-interactive bg-slate-900/80 rounded-3xl border border-white/10 shadow-xl p-6 flex flex-col justify-between space-y-6">
                        <form onSubmit={handleUpdateOccupants} className="space-y-4 m-0 flex-grow flex flex-col justify-between">
                            <div className="space-y-4">
                                <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 rounded-xl bg-slate-500/10 text-slate-300 flex items-center justify-center shrink-0 border border-white/10">
                                        <FontAwesomeIcon icon={faUsers} className="text-lg" />
                                    </div>
                                    <h3 className="text-lg font-bold text-white m-0">{t('myRoom.occupantsTitle')}</h3>
                                </div>
                                <div className="flex flex-col space-y-1.5 text-left">
                                    <div className="flex justify-between items-center">
                                        {/* The label used to say "Max 4" while the input allowed 8: 4 is the surcharge threshold. */}
                                        <label htmlFor="myroom-occupants" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">No. Occupants (Max {MAX_OCCUPANTS})</label>
                                        <span className="text-[9px] text-slate-400">Exceeding 4 adds ₱1,000/person surcharge</span>
                                    </div>
                                    <input
                                        type="number"
                                        {...fields.fieldA11y('occupants')}
                                        inputMode="numeric"
                                        min="1"
                                        max={MAX_OCCUPANTS}
                                        step="1"
                                        value={occupants}
                                        onKeyDown={blockNonIntegerKeys}
                                        onChange={handleOccupantChange}
                                        onBlur={() => occupants !== currentOccupants && fields.validateField('occupants', fieldValues)}
                                        className={`w-full px-4 py-2 rounded-xl bg-slate-950/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm box-border font-bold${invalidCls(fields.errors.occupants)}`}
                                        required
                                    />
                                    <FieldError id="myroom-occupants" error={fields.errors.occupants} className="m-0" />
                                    {occupants > 4 && (
                                        <span className="text-[9px] text-amber-300 font-medium leading-normal mt-1">
                                            ⚠️ +₱{((occupants - 4) * 1000).toLocaleString()}/mo capacity surcharge (₱1,000 per person exceeding 4)
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={!!busy}
                                className="w-full bg-slate-800 hover:bg-slate-700 border border-white/10 text-white font-bold py-2.5 rounded-xl text-xs border-0 cursor-pointer transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {busy === 'occupants' ? 'Sending…' : t('myRoom.updateOccupants')}
                            </button>
                        </form>
                    </div>

                    <div className="my-room-card card-interactive bg-slate-900/80 rounded-3xl border border-white/10 shadow-xl p-6 flex flex-col justify-between space-y-6">
                        <div className="space-y-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20">
                                    <FontAwesomeIcon icon={faHourglassHalf} className="text-lg animate-pulse" />
                                </div>
                                <h3 className="text-lg font-bold text-white m-0">{t('myRoom.nextBillDue')}</h3>
                            </div>
                            <div className="space-y-2.5 pt-1 text-left">
                                <div className="flex justify-between text-xs font-semibold text-slate-400">
                                    <span>Rent Balance:</span>
                                    <span className="text-slate-200">
                                        ₱{roomDetails.monthlyRent.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                                {occupants > 4 && (
                                    <div className="flex justify-between text-[10px] font-semibold text-indigo-300">
                                        <span>(Base + Extra Occupant Surcharge):</span>
                                        <span>
                                            ₱{(roomDetails.monthlyRent - (occupants - 4) * 1000).toLocaleString()} + ₱{((occupants - 4) * 1000).toLocaleString()}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between text-xs font-semibold text-slate-400">
                                    <span>Cycle Started:</span>
                                    <span className="text-slate-200">{roomDetails.rentStart}</span>
                                </div>
                                <div className="flex justify-between text-xs font-semibold text-slate-400">
                                    <span>Deadline Date:</span>
                                    <span className="text-rose-400 font-bold">{roomDetails.paymentDue}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={() => navigate('/pay-bills')}
                                className="w-full bg-[#10b981] hover:bg-[#059669] text-white font-bold py-2.5 rounded-xl text-xs border-0 cursor-pointer transition-all shadow-md"
                            >
                                {t('myRoom.payRentBalance')}
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate('/user-utilities')}
                                className="w-full bg-slate-800/80 hover:bg-slate-700 border border-white/10 text-indigo-300 hover:text-white font-bold py-2 rounded-xl text-xs cursor-pointer transition-all flex items-center justify-center gap-1.5"
                            >
                                <FontAwesomeIcon icon={faBolt} className="text-amber-400 text-[11px]" />
                                <span>Check Meter Readings</span>
                            </button>
                        </div>
                    </div>

                </div>

                <HouseholdPanel />

                <div className="my-room-operations-grid stagger-children grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">

                    <div className="md:col-span-8 bg-slate-900/80 rounded-3xl border border-white/10 shadow-xl p-6 md:p-8">
                        <form onSubmit={handleExtendRent} className="my-room-extend-form grid grid-cols-1 sm:grid-cols-3 gap-6 items-end m-0 text-left">
                            <div className="sm:col-span-2 space-y-3">
                                <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-300 flex items-center justify-center shrink-0 border border-indigo-500/20">
                                        <FontAwesomeIcon icon={faCalendarPlus} className="text-lg" />
                                    </div>
                                    <h3 className="text-lg font-bold text-white m-0">{t('myRoom.extendLease')}</h3>
                                </div>
                                <p className="text-slate-300 text-xs leading-relaxed m-0 font-medium">
                                    Select a new prospective end date to file an official extension request to administration.
                                </p>
                            </div>
                            <div className="space-y-3 w-full box-border">
                                <div className="flex flex-col space-y-1.5">
                                    <label htmlFor="myroom-additionalMonths" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Additional Months</label>
                                    <input
                                        type="number"
                                        {...fields.fieldA11y('additionalMonths')}
                                        inputMode="numeric"
                                        min="1"
                                        max={MAX_EXTENSION_MONTHS}
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
                                            setAdditionalMonths(Math.min(intVal, MAX_EXTENSION_MONTHS));
                                        }}
                                        onBlur={() => fields.validateField('additionalMonths', fieldValues)}
                                        className={`w-full px-4 py-2 rounded-xl bg-slate-950/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm box-border font-bold${invalidCls(fields.errors.additionalMonths)}`}
                                        required
                                    />
                                    <FieldError id="myroom-additionalMonths" error={fields.errors.additionalMonths} className="m-0" />
                                </div>
                                <button
                                    type="submit"
                                    disabled={!!busy}
                                    className="w-full bg-[#6366f1] hover:bg-[#4f46e5] text-white font-bold py-2.5 rounded-xl text-xs border-0 cursor-pointer transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {busy === 'extend' ? 'Sending…' : 'Submit Extension'}
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className="md:col-span-4 bg-rose-950/30 rounded-3xl border border-rose-500/20 p-6 flex flex-col justify-between text-left space-y-4 shadow-xl">
                        <div className="space-y-2">
                            <div className="flex items-center space-x-2 text-rose-400 font-bold text-base">
                                <FontAwesomeIcon icon={faSignOutAlt} className="text-sm" />
                                <span>{t('myRoom.terminateTenancy')}</span>
                            </div>
                            <p className="text-slate-300 text-xs leading-relaxed m-0 font-medium">
                                Initiate standard check-out procedures to vacate the unit and close your balance statements.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleEndRent}
                            disabled={roomDetails.status === 'pending-move-out'}
                            className={`w-full font-bold py-3 rounded-xl text-xs border-0 transition-all shadow-md ${roomDetails.status === 'pending-move-out'
                                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                : 'bg-red-600 hover:bg-red-700 text-white cursor-pointer'
                                }`}
                        >
                            {roomDetails.status === 'pending-move-out' ? t('myRoom.moveOutPending') : t('myRoom.endRentTerm')}
                        </button>
                        {roomDetails.status === 'pending-move-out' && (
                            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-1.5 mt-2">
                                <div className="text-xs font-bold text-amber-400">Move-Out Notice Active</div>
                                <div className="text-[11px] text-slate-300 leading-normal">
                                    Your scheduled move-out date: <strong>{roomDetails.requestedMoveOutDate ? new Date(roomDetails.requestedMoveOutDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Pending'}</strong>
                                </div>
                                {roomDetails.requestedMoveOutDate && (() => {
                                    const diff = Math.ceil((new Date(roomDetails.requestedMoveOutDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                                    return (
                                        <div className="text-[10px] text-amber-300/90 font-semibold">
                                            ⏳ {diff > 0 ? `${diff} days remaining until move-out` : 'Move-out is due today'}
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                    </div>

                </div>

            </div>

            {/* ─── MOVE OUT SCHEDULING MODAL ─── */}
            {showMoveOutModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm modal-overlay-anim" onClick={() => setShowMoveOutModal(false)}>
                    <div className="my-room-modal-content modal-card-anim sheet-mobile bg-slate-900 border border-white/10 rounded-3xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center border border-red-500/20">
                                    <FontAwesomeIcon icon={faSignOutAlt} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-white m-0">Terminate Tenancy</h3>
                                    <p className="text-[10px] text-slate-400 m-0 mt-0.5">Submit notice to administration</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 space-y-4 text-left">
                            <div className="bg-rose-950/20 border border-rose-500/20 rounded-2xl p-4 flex items-start space-x-3">
                                <FontAwesomeIcon icon={faExclamationTriangle} className="text-rose-400 mt-0.5 shrink-0" />
                                <p className="text-xs text-slate-300 m-0 leading-relaxed">
                                    Under system policy, prior notice must be given at least <strong>15 days</strong> but less than <strong>30 days</strong> before your actual move-out date.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <label htmlFor="myroom-move_out_date" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Actual Move-Out Date</label>
                                <input
                                    type="date"
                                    {...fields.fieldA11y('move_out_date')}
                                    value={moveOutDate}
                                    min={addDays(MOVE_OUT_MIN_DAYS)}
                                    max={addDays(MOVE_OUT_MAX_DAYS)}
                                    onChange={(e) => { setMoveOutDate(e.target.value); fields.clearError('move_out_date'); }}
                                    onBlur={() => fields.validateField('move_out_date', fieldValues)}
                                    className={`w-full px-4 py-2.5 rounded-xl bg-slate-950/40 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-red-500 text-sm box-border font-bold${invalidCls(fields.errors.move_out_date)}`}
                                    required
                                />
                                <FieldError id="myroom-move_out_date" error={fields.errors.move_out_date} className="m-0" />
                            </div>
                        </div>

                        <div className="my-room-modal-actions flex items-center justify-end gap-3 px-6 py-4 bg-slate-950/40 border-t border-white/10">
                            <button
                                type="button"
                                onClick={() => setShowMoveOutModal(false)}
                                disabled={busy === 'moveout'}
                                className="btn-interactive px-4 py-2 text-xs text-slate-400 font-bold hover:text-white rounded-xl border-0 bg-transparent cursor-pointer transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmMoveOut}
                                disabled={!!busy}
                                className="btn-interactive px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-md border-0 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {busy === 'moveout' ? 'Submitting…' : 'Confirm Notice'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}