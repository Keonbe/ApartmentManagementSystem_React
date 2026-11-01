import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faIdBadge, faUserPlus, faClock,
  faTimes,
  faSync, faArrowLeft
} from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import { LIMITS, addDays, checkDate, checkPersonName, checkPhMobile, checkText, localDateString, toPhE164 } from '../utils/validation';
import PhoneInput from '../Components/PhoneInput';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import FileChip from '../Components/form/FileChip';
import { invalidCls } from '../Components/form/formHelpers';
import ReasonModal from '../Components/form/ReasonModal';
import ConfirmDialog from '../Components/ConfirmDialog';
import InlineAlert from '../Components/InlineAlert';
import useDialog from '../hooks/useDialog';

const PURPOSES = ['Personal Visit', 'Delivery / Courier', 'Maintenance / Contractor', 'Official / Business', 'Short Stay Guest'];
const ID_TYPES = ['National ID', "Driver's License", 'Passport', 'UMID / SSS', 'Student / Work ID'];
// Letters, digits, spaces and hyphens (e.g. ABC 1234, N02-1234).
const PLATE_PATTERN = /^[A-Z0-9][A-Z0-9 -]*$/;

// Allowed arrival dates: today to 30 days ahead, local time. The expected
// check-out is within 30 days of the arrival, so its picker goes to 60.
const arrivalBounds = () => ({ min: localDateString(), max: addDays(30), outMax: addDays(60) });
const DAY_MS = 24 * 60 * 60 * 1000;
const fmtShort = (d) => new Date(d).toLocaleString(dateLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// Preset departure notes for "Mark departed" (ReasonModal adds "Other…").
const DEPARTURE_NOTE_OPTIONS = [
  'Left normally',
  'Left together with me',
  'Picked up / fetched by someone',
  'Stayed shorter than planned',
];
import { useLang, dateLocale } from '../config/i18n';
import '../assets/styles/responsive/user/user-visitors.responsive.css';

export default function UserVisitors() {
  const navigate = useNavigate();
  const { t } = useLang();
  const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "{}");

  const [visitors, setVisitors] = useState([]);
  const [tenantRoom, setTenantRoom] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showRegisterModal, setShowRegisterModal] = useState(false);
  // The allowed arrival dates (today to 30 days ahead, local time) are fixed
  // when the form opens.
  const [expectedBounds, setExpectedBounds] = useState({ min: '', max: '', outMax: '' });

  const openRegisterModal = () => {
    setExpectedBounds(arrivalBounds());
    visitorForm.setErrors({});
    setFormError('');
    setShowRegisterModal(true);
  };
  const emptyRegisterForm = {
    visitorName: '',
    contactNumber: '',
    purpose: 'Personal Visit',
    idType: 'National ID',
    idNumber: '',
    vehiclePlate: '',
    expectedDate: '',
    expectedTime: '',
    expectedOutDate: '',
    expectedOutTime: ''
  };
  const [registerForm, setRegisterForm] = useState(emptyRegisterForm);
  const [submitting, setSubmitting] = useState(false);
  const [photoInputKey, setPhotoInputKey] = useState(0);

  // Keys match check_in_visitor.php (expectedDate/expectedTime make up
  // expectedAt, expectedOutDate/expectedOutTime make up expectedCheckOutAt).
  const visitorForm = useFieldErrors({
    visitorName: (v) => checkPersonName(v, { label: t('visitors.visitorName'), max: LIMITS.fullName }),
    contactNumber: (v) => checkPhMobile(v),
    purpose: (v) => (PURPOSES.includes(v) ? '' : t('visitors.errPurpose')),
    expectedDate: (v) => checkDate(v, { min: expectedBounds.min, max: expectedBounds.max, label: t('visitors.expectedDate') }),
    // check_in_visitor.php accepts an arrival up to 1 hour in the past.
    expectedTime: (v, all) => {
      if (!v) return t('visitors.errTimeRequired');
      if (!all.expectedDate) return '';
      return new Date(`${all.expectedDate}T${v}`).getTime() < Date.now() - 60 * 60 * 1000 ? t('visitors.errTimePast') : '';
    },
    expectedOutDate: (v) => checkDate(v, { min: expectedBounds.min, max: expectedBounds.outMax, label: t('visitors.expectedOutDate') }),
    // After the check-in and within 30 days of it.
    expectedOutTime: (v, all) => {
      if (!v) return t('visitors.errOutRequired');
      if (!all.expectedOutDate) return '';
      const outMs = new Date(`${all.expectedOutDate}T${v}`).getTime();
      if (Number.isNaN(outMs)) return t('visitors.errOutInvalid');
      const inMs = new Date(`${all.expectedDate}T${all.expectedTime}`).getTime();
      if (Number.isNaN(inMs)) return '';
      if (outMs <= inMs) return t('visitors.errOutBefore');
      if (outMs > inMs + 30 * DAY_MS) return t('visitors.errOutTooLong');
      return '';
    },
    idType: (v) => (ID_TYPES.includes(v) ? '' : t('visitors.errIdType')),
    idNumber: (v) => checkText(v, { label: t('visitors.idNumber'), min: 3, max: LIMITS.idNumber }),
    vehiclePlate: (v) => checkText(v, { label: t('visitors.plateLabel'), max: LIMITS.visitorPlate, required: false })
      || (v && !PLATE_PATTERN.test(String(v).trim()) ? t('visitors.errPlate') : ''),
    idPhoto: (f) => (f ? checkFile(f, FILE_RULES.visitorId) : ''),
  }, { idPrefix: 'visitor-' });
  const setVisitorField = (key, value) => {
    setRegisterForm(f => ({ ...f, [key]: value }));
    visitorForm.clearError(key);
  };
  const blurVisitorField = (key) => {
    const raw = registerForm[key];
    const v = typeof raw === 'string' && key !== 'contactNumber' ? raw.trim() : raw;
    if (v !== raw) setRegisterForm(f => ({ ...f, [key]: v }));
    if (v || key === 'contactNumber') visitorForm.validateField(key, { ...registerForm, [key]: v });
  };
  const clearPhoto = () => {
    setRegisterForm(f => ({ ...f, idPhoto: null }));
    setPhotoInputKey(k => k + 1);
    visitorForm.clearError('idPhoto');
  };
  const [cancellingId, setCancellingId] = useState(null);
  // Messages that were alert(): a failed registration (shown in the form, next
  // to its buttons) and a failed cancel (shown above the lists).
  const [formError, setFormError] = useState('');
  const [pageError, setPageError] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null); // visitor id asked about (was window.confirm)
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Closing the register form with something typed asks first: an overlay click
  // used to throw the whole form away. Esc and the close button ask too.
  const registerDirty = Object.entries(registerForm).some(([key, value]) => (key === 'idPhoto' ? !!value : value !== emptyRegisterForm[key]));
  const requestCloseRegister = () => {
    if (submitting) return;
    if (registerDirty) setConfirmDiscard(true);
    else setShowRegisterModal(false);
  };
  const registerDialogRef = useDialog(showRegisterModal && !confirmDiscard, requestCloseRegister);

  const loadTenantData = async () => {
    try {
      // 1. Get tenant's approved room
      if (loggedInUser.email_address) {
        const roomRes = await api.get(`/my_room.php?email=${encodeURIComponent(loggedInUser.email_address)}`);
        if (roomRes.data.success && roomRes.data.data) {
          setTenantRoom(roomRes.data.data.room_name || roomRes.data.data.id || '');
        }
      }

      // 2. Get tenant's scoped visitor records. The server scopes this to
      // the session regardless of any userId query param, so it isn't sent.
      const res = await api.get('get_visitors.php');
      if (res.data.success) {
        setVisitors(res.data.visitors || []);
      } else {
        setError(res.data.message || t('visitors.loadFailed'));
      }
    } catch (err) {
      console.error('Failed to load visitor records:', err);
      setError(t('visitors.loadFailedNetwork'));
    } finally {
      setLoading(false);
    }
  };

  const fetchTenantData = () => {
    setLoading(true);
    setError(null);
    return loadTenantData();
  };

  useEffect(() => {
    const load = async () => { await loadTenantData(); };
    load();
  }, []);

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    // Name and plate used to be sent untrimmed.
    const clean = {
      ...registerForm,
      visitorName: registerForm.visitorName.trim(),
      idNumber: registerForm.idNumber.trim(),
      vehiclePlate: registerForm.vehiclePlate.trim().toUpperCase(),
    };
    setRegisterForm(clean);
    if (!visitorForm.validateAll(clean)) return;
    const expectedAt = `${clean.expectedDate}T${clean.expectedTime}`;
    setSubmitting(true);
    try {
      // The unit and host are always the tenant's own current tenancy —
      // resolved server-side from the session, not from anything posted here.
      const fields = {
        visitorName: clean.visitorName,
        contactNumber: toPhE164(clean.contactNumber),
        purpose: clean.purpose,
        idType: clean.idType,
        idNumber: clean.idNumber,
        vehiclePlate: clean.vehiclePlate,
        expectedAt,
        expectedCheckOutAt: `${clean.expectedOutDate}T${clean.expectedOutTime}`,
      };
      let payload = fields;
      let headers = {};

      if (registerForm.idPhoto) {
        payload = new FormData();
        Object.entries(fields).forEach(([key, value]) => payload.append(key, value));
        payload.append('idPhoto', registerForm.idPhoto);
        headers = { 'Content-Type': 'multipart/form-data' };
      }

      const res = await api.post('check_in_visitor.php', payload, { headers });
      if (res.data.success) {
        setShowRegisterModal(false);
        setRegisterForm(emptyRegisterForm);
        fetchTenantData();
      } else if (!visitorForm.applyServerErrors(res)) {
        setFormError(res.data.message || t('visitors.registerFailed'));
      }
    } catch (err) {
      console.error('Registration failed:', err);
      if (!visitorForm.applyServerErrors(err)) setFormError(apiErrorMessage(err, t('visitors.registerFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  // The departure note is picked in ReasonModal; throws so the modal shows it.
  const [departTarget, setDepartTarget] = useState(null); // visitor id
  const confirmDeparture = async (note) => {
    let res;
    try {
      res = await api.post('update_visitor_status.php', {
        id: departTarget,
        action: 'checked_out',
        checkoutNotes: `Tenant reported departure: ${note}`
      });
    } catch (err) {
      console.error('Failed to mark visitor departure:', err);
      throw new Error(apiErrorMessage(err, t('visitors.statusFailed')), { cause: err });
    }
    if (!res.data.success) throw new Error(res.data.message || t('visitors.statusFailed'));
    setDepartTarget(null);
    fetchTenantData();
  };

  const handleCancelRegistration = async (id) => {
    setCancellingId(id);
    setPageError('');
    try {
      const res = await api.post('update_visitor_status.php', { id, action: 'cancel' });
      if (res.data.success) {
        fetchTenantData();
      } else {
        setPageError(res.data.message || t('visitors.cancelFailed'));
      }
    } catch (err) {
      console.error('Failed to cancel registration:', err);
      setPageError(apiErrorMessage(err, 'Failed to cancel registration.'));
    } finally {
      setCancellingId(null);
      setCancelTarget(null);
    }
  };

  const activeVisitors = visitors.filter(v => v.status === 'checked_in' || v.status === 'overstayed');
  const pendingVisitors = visitors.filter(v => v.status === 'pending_approval');

  return (
    <div className="user-visitors-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-8 px-4 md:px-12 box-border flex flex-col items-center">
      <div className="w-full max-w-[1050px] space-y-6 text-left">

        {/* Back Link & Header */}
        <div>
          <button
            type="button"
            onClick={() => navigate('/services')}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 bg-transparent border-0 cursor-pointer p-0 mb-3"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
            <span>{t('visitors.backToServices')}</span>
          </button>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold m-0 tracking-tight flex items-center gap-3 text-brand">
                <FontAwesomeIcon icon={faIdBadge} className="text-indigo-600" />
                {t('visitors.heading')}
              </h1>
              <p className="text-slate-500 text-xs sm:text-sm mt-1 m-0">
                {t('visitors.subtext')}
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={fetchTenantData}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors cursor-pointer"
                title={t('common.refresh')}
                aria-label={t('visitors.refresh')}
              >
                <FontAwesomeIcon icon={faSync} className={loading ? 'animate-spin' : ''} />
              </button>

              <button
                type="button"
                onClick={openRegisterModal}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 text-xs sm:text-sm font-bold text-white transition-all shadow-md active:scale-[0.98] border-0 cursor-pointer"
              >
                <FontAwesomeIcon icon={faUserPlus} />
                <span>{t('visitors.logNewVisitor')}</span>
              </button>
            </div>
          </div>
        </div>

        <InlineAlert onDismiss={() => setPageError('')}>{pageError}</InlineAlert>

        {/* Currently On-Premise / Active Visitors Section */}
        {activeVisitors.length > 0 && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-emerald-900 m-0 flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 relative">
                  
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                {t('visitors.activeVisitors')} ({activeVisitors.length})
              </h3>
            </div>

            <div className="stagger-children grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeVisitors.map(v => (
                <div key={v.id} className="card-interactive rounded-xl border border-emerald-200 bg-white p-4 flex items-center justify-between shadow-xs">
                  <div className="space-y-1">
                    <p className="font-bold text-slate-800 text-sm m-0">{v.visitorName}</p>
                    <p className="text-xs text-slate-500 m-0">{t('visitors.colPurpose')}: <span className="font-semibold text-slate-700">{v.purpose}</span></p>
                    <p className="text-xs text-slate-500 m-0">
                      {new Date(v.checkInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {t('visitors.colDuration')}: <span className="font-bold text-emerald-600">{v.duration}</span>
                    </p>
                    {v.expectedCheckOutAt && (
                      <p className="text-xs text-slate-500 m-0">{t('visitors.expectedOut')}: {fmtShort(v.expectedCheckOutAt)}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDepartTarget(v.id)}
                    className="btn-interactive min-h-[44px] rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 text-sm font-bold transition-colors border-0 cursor-pointer"
                  >
                    {t('visitors.markDeparted')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending Review Visitors Section */}
        {pendingVisitors.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-amber-900 m-0 flex items-center gap-2">
              <FontAwesomeIcon icon={faClock} className="text-amber-500" />
              {t('visitors.pendingVerification')} ({pendingVisitors.length})
            </h3>
            <p className="text-xs text-amber-700 m-0">
              {t('visitors.pendingVerificationDesc')}
            </p>

            <div className="stagger-children grid grid-cols-1 md:grid-cols-2 gap-3">
              {pendingVisitors.map(v => (
                <div key={v.id} className="card-interactive rounded-xl border border-amber-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-slate-800 text-sm m-0">{v.visitorName}</p>
                    <span className="rounded-full bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5">{t('visitors.statusPending')}</span>
                  </div>
                  <p className="text-xs text-slate-500 m-0 mt-1">{t('visitors.contactPurpose', { contact: v.contactNumber, purpose: v.purpose })}</p>
                  {v.expectedAt && (
                    <p className="text-xs text-slate-500 m-0 mt-0.5">
                      {t('visitors.expectedOn', { date: fmtShort(v.expectedAt) })}
                      {v.expectedCheckOutAt && ` – ${fmtShort(v.expectedCheckOutAt)}`}
                    </p>
                  )}
                  {v.vehiclePlate && (
                    <p className="text-xs text-indigo-600 font-mono font-bold m-0 mt-0.5">Vehicle: {v.vehiclePlate}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setCancelTarget(v.id)}
                    disabled={cancellingId === v.id}
                    className="mt-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 text-xs font-bold transition-colors border-0 cursor-pointer disabled:opacity-50"
                  >
                    {cancellingId === v.id ? t('visitors.cancelling') : t('visitors.cancelRegistration')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Full Visitor Logs History */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800 m-0">{t('visitors.logHistory')}</h3>
              <p className="text-xs text-slate-500 m-0 mt-0.5">{t('visitors.logHistoryDesc')}</p>
            </div>
          </div>

          <div className="user-visitors-table-container sm:overflow-x-auto">
            <table className="block sm:table w-full sm:min-w-[700px] text-left text-sm">
              <thead className="hidden sm:table-header-group border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-5 py-3">{t('visitors.colName')}</th>
                  <th className="px-4 py-3">{t('visitors.colPurpose')}</th>
                  <th className="px-4 py-3">{t('visitors.colPlate')}</th>
                  <th className="px-4 py-3">{t('visitors.colCheckIn')}</th>
                  <th className="px-4 py-3">{t('visitors.colDuration')}</th>
                  <th className="px-5 py-3 text-center">{t('visitors.colStatus')}</th>
                </tr>
              </thead>
              <tbody className="block sm:table-row-group divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="px-5 py-10 text-center text-slate-500">{t('visitors.loading')}</td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan="6" className="px-5 py-10 text-center text-rose-600 text-sm">{error}</td>
                  </tr>
                ) : visitors.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-5 py-12 text-center">
                      <div className="flex items-center justify-center gap-2.5 text-slate-500">
                        <FontAwesomeIcon icon={faIdBadge} className="text-xl text-slate-300 shrink-0" />
                        <span className="text-sm italic">{t('visitors.noneLogged')}</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  visitors.map(v => (
                    <tr key={v.id} className="block sm:table-row px-5 py-3 sm:p-0 hover:bg-slate-50 transition-colors">
                      
                      <td className="block sm:table-cell pb-1 sm:px-5 sm:py-3.5">
                        <p className="font-bold text-slate-800 text-sm m-0">{v.visitorName}</p>
                        <p className="text-xs text-slate-500 m-0">{v.contactNumber}</p>
                      </td>

                      <td data-label={t('visitors.colPurpose')} className="flex sm:table-cell items-start justify-between gap-4 py-1 sm:py-3.5 before:content-[attr(data-label)] before:font-semibold before:text-slate-500 before:text-xs sm:before:content-none sm:px-4 text-sm sm:text-xs text-slate-600 font-medium">{v.purpose}</td>

                      <td data-label={t('visitors.colPlate')} className="flex sm:table-cell items-start justify-between gap-4 py-1 sm:py-3.5 before:content-[attr(data-label)] before:font-semibold before:text-slate-500 before:text-xs sm:before:content-none sm:px-4 text-xs">
                        {v.vehiclePlate ? (
                          <span className="font-mono font-bold uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded text-xs">{v.vehiclePlate}</span>
                        ) : (
                          <span className="text-slate-500 text-xs">—</span>
                        )}
                      </td>

                      <td data-label={t('visitors.colCheckIn')} className="flex sm:table-cell items-start justify-between gap-4 py-1 sm:py-3.5 before:content-[attr(data-label)] before:font-semibold before:text-slate-500 before:text-xs sm:before:content-none sm:px-4 text-xs text-slate-600 text-right sm:text-left">
                        <span>
                        {new Date(v.visitAt || v.checkInAt).toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric', year: 'numeric' })}
                        <br />
                        <span className="text-xs text-slate-500">{new Date(v.visitAt || v.checkInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </span>
                      </td>

                      <td data-label={t('visitors.colDuration')} className="flex sm:table-cell items-start justify-between gap-4 py-1 sm:py-3.5 before:content-[attr(data-label)] before:font-semibold before:text-slate-500 before:text-xs sm:before:content-none sm:px-4 text-xs font-mono font-bold text-slate-700">
                        {v.status === 'pending_approval' ? '—' : v.duration}
                      </td>

                      <td data-label={t('visitors.colStatus')} className="flex sm:table-cell items-start justify-between gap-4 py-1 sm:py-3.5 before:content-[attr(data-label)] before:font-semibold before:text-slate-500 before:text-xs sm:before:content-none items-center sm:px-5 sm:text-center">
                        {v.status === 'pending_approval' && (
                          <span className="rounded-full bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1">{t('visitors.statusPending')}</span>
                        )}
                        {v.status === 'checked_in' && (
                          <span className="rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-1">{t('visitors.statusActive')}</span>
                        )}
                        {v.status === 'overstayed' && (
                          <span className="rounded-full bg-rose-100 text-rose-700 text-xs font-bold px-2.5 py-1">{t('visitors.statusOverstayed')}</span>
                        )}
                        {v.status === 'checked_out' && (
                          <span className="rounded-full bg-slate-100 text-slate-600 text-xs font-bold px-2.5 py-1">{t('visitors.statusDeparted')}</span>
                        )}
                        {v.status === 'denied' && (
                          <span className="rounded-full bg-red-100 text-red-700 text-xs font-bold px-2.5 py-1">{t('visitors.statusDeclined')}</span>
                        )}
                        {v.status === 'cancelled' && (
                          <span className="rounded-full bg-slate-100 text-slate-500 text-xs font-bold px-2.5 py-1">{t('visitors.statusCancelled')}</span>
                        )}
                      </td>

                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Log Visitor Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 modal-overlay-anim" onMouseDown={(e) => { if (e.target === e.currentTarget) requestCloseRegister(); }}>
          <div ref={registerDialogRef} role="dialog" aria-modal="true" aria-labelledby="visitor-modal-title" tabIndex={-1} className="user-visitors-modal modal-card-anim sheet-mobile w-full max-w-md max-h-[92vh] rounded-2xl bg-white p-6 shadow-2xl overflow-y-auto outline-none">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faUserPlus} className="text-indigo-600" aria-hidden="true" />
                <h3 id="visitor-modal-title" className="text-lg font-bold text-slate-800 m-0">{t('visitors.modalTitle')}</h3>
              </div>
              <button
                type="button"
                onClick={requestCloseRegister}
                aria-label={t('common.close')}
                className="flex h-11 w-11 items-center justify-center text-slate-500 hover:text-slate-700 bg-transparent border-0 cursor-pointer"
              >
                <FontAwesomeIcon icon={faTimes} aria-hidden="true" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              {t('visitors.modalDesc')}
              {tenantRoom && <> {t('visitors.modalUnitNote')} <span className="font-bold text-slate-700">Unit {tenantRoom}</span>.</>}
            </p>

            <form onSubmit={handleRegisterSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="visitor-visitorName" className="block text-xs font-bold text-slate-700 mb-1">{t('visitors.visitorName')} *</label>
                <input
                  type="text"
                  {...visitorForm.fieldA11y('visitorName')}
                  autoComplete="off"
                  required
                  placeholder={t('visitors.namePlaceholder')}
                  value={registerForm.visitorName}
                  maxLength={LIMITS.fullName}
                  onChange={(e) => setVisitorField('visitorName', e.target.value)}
                  onBlur={() => blurVisitorField('visitorName')}
                  className={"focus-glow w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" + invalidCls(visitorForm.errors.visitorName)}
                />
                <FieldError id="visitor-visitorName" error={visitorForm.errors.visitorName} />
              </div>

              <div>
                <label htmlFor="visitor-contactNumber" className="block text-xs font-bold text-slate-700 mb-1">{t('visitors.contactNumber')} *</label>
                <PhoneInput
                  id="visitor-contactNumber"
                  name="contactNumber"
                  required
                  value={registerForm.contactNumber}
                  onChange={(digits) => setVisitorField('contactNumber', digits)}
                  onBlur={() => blurVisitorField('contactNumber')}
                  error={visitorForm.errors.contactNumber}
                />
              </div>

              <div>
                <label htmlFor="visitor-purpose" className="block text-xs font-bold text-slate-700 mb-1">{t('visitors.purpose')} *</label>
                <select
                  {...visitorForm.fieldA11y('purpose')}
                  value={registerForm.purpose}
                  onChange={(e) => setVisitorField('purpose', e.target.value)}
                  className="focus-glow w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white cursor-pointer"
                >
                  <option value="Personal Visit">{t('visitors.purposePersonal')}</option>
                  <option value="Delivery / Courier">{t('visitors.purposeDelivery')}</option>
                  <option value="Maintenance / Contractor">{t('visitors.purposeMaintenance')}</option>
                  <option value="Official / Business">{t('visitors.purposeOfficial')}</option>
                  <option value="Short Stay Guest">{t('visitors.purposeShortStay')}</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="visitor-expectedDate" className="block text-xs font-bold text-slate-700 mb-1">{t('visitors.expectedDate')} *</label>
                  <input
                    type="date"
                    {...visitorForm.fieldA11y('expectedDate')}
                    required
                    min={expectedBounds.min}
                    max={expectedBounds.max}
                    value={registerForm.expectedDate}
                    onChange={(e) => setVisitorField('expectedDate', e.target.value)}
                    onBlur={() => blurVisitorField('expectedDate')}
                    className={"focus-glow w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" + invalidCls(visitorForm.errors.expectedDate)}
                  />
                  <FieldError id="visitor-expectedDate" error={visitorForm.errors.expectedDate} />
                </div>
                <div>
                  <label htmlFor="visitor-expectedTime" className="block text-xs font-bold text-slate-700 mb-1">{t('visitors.expectedTime')} *</label>
                  <input
                    type="time"
                    {...visitorForm.fieldA11y('expectedTime')}
                    required
                    value={registerForm.expectedTime}
                    onChange={(e) => setVisitorField('expectedTime', e.target.value)}
                    onBlur={() => blurVisitorField('expectedTime')}
                    className={"focus-glow w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" + invalidCls(visitorForm.errors.expectedTime)}
                  />
                  <FieldError id="visitor-expectedTime" error={visitorForm.errors.expectedTime} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="visitor-expectedOutDate" className="block text-xs font-bold text-slate-700 mb-1">{t('visitors.expectedOutDate')} *</label>
                  <input
                    type="date"
                    {...visitorForm.fieldA11y('expectedOutDate')}
                    required
                    min={registerForm.expectedDate || expectedBounds.min}
                    max={expectedBounds.outMax}
                    value={registerForm.expectedOutDate}
                    onChange={(e) => setVisitorField('expectedOutDate', e.target.value)}
                    onBlur={() => blurVisitorField('expectedOutDate')}
                    className={"focus-glow w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" + invalidCls(visitorForm.errors.expectedOutDate)}
                  />
                  <FieldError id="visitor-expectedOutDate" error={visitorForm.errors.expectedOutDate} />
                </div>
                <div>
                  <label htmlFor="visitor-expectedOutTime" className="block text-xs font-bold text-slate-700 mb-1">{t('visitors.expectedOutTime')} *</label>
                  <input
                    type="time"
                    {...visitorForm.fieldA11y('expectedOutTime')}
                    required
                    value={registerForm.expectedOutTime}
                    onChange={(e) => setVisitorField('expectedOutTime', e.target.value)}
                    onBlur={() => blurVisitorField('expectedOutTime')}
                    className={"focus-glow w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" + invalidCls(visitorForm.errors.expectedOutTime)}
                  />
                  <FieldError id="visitor-expectedOutTime" error={visitorForm.errors.expectedOutTime} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="visitor-idType" className="block text-xs font-bold text-slate-700 mb-1">{t('visitors.idType')} *</label>
                  <select
                    {...visitorForm.fieldA11y('idType')}
                    required
                    value={registerForm.idType}
                    onChange={(e) => setVisitorField('idType', e.target.value)}
                    className="focus-glow w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base sm:text-sm text-slate-800 outline-none focus:border-indigo-500 bg-white cursor-pointer"
                  >
                    <option value="National ID">{t('visitors.idNational')}</option>
                    <option value="Driver's License">{t('visitors.idDriver')}</option>
                    <option value="Passport">{t('visitors.idPassport')}</option>
                    <option value="UMID / SSS">UMID / SSS</option>
                    <option value="Student / Work ID">{t('visitors.idStudentWork')}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="visitor-idNumber" className="block text-xs font-bold text-slate-700 mb-1">{t('visitors.idNumber')} *</label>
                  <input
                    type="text"
                    {...visitorForm.fieldA11y('idNumber')}
                    autoComplete="off"
                    required
                    placeholder="e.g. D01-19-12345"
                    value={registerForm.idNumber}
                    maxLength={LIMITS.idNumber}
                    onChange={(e) => setVisitorField('idNumber', e.target.value)}
                    onBlur={() => blurVisitorField('idNumber')}
                    className={"focus-glow w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-800 outline-none focus:border-indigo-500 font-mono" + invalidCls(visitorForm.errors.idNumber)}
                  />
                  <FieldError id="visitor-idNumber" error={visitorForm.errors.idNumber} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="visitor-vehiclePlate" className="block text-xs font-bold text-slate-700 mb-1">{t('visitors.vehiclePlate')}</label>
                  <input
                    type="text"
                    {...visitorForm.fieldA11y('vehiclePlate')}
                    autoComplete="off"
                    placeholder="e.g. N02-1234"
                    value={registerForm.vehiclePlate}
                    maxLength={LIMITS.visitorPlate}
                    onChange={(e) => setVisitorField('vehiclePlate', e.target.value.toUpperCase())}
                    onBlur={() => blurVisitorField('vehiclePlate')}
                    className={"focus-glow w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-800 outline-none focus:border-indigo-500 uppercase font-mono" + invalidCls(visitorForm.errors.vehiclePlate)}
                  />
                  <FieldError id="visitor-vehiclePlate" error={visitorForm.errors.vehiclePlate} />
                </div>
                <div>
                  <label htmlFor="visitor-idPhoto" className="block text-xs font-bold text-slate-700 mb-1">{t('visitors.idPhoto')}</label>
                  <input
                    key={photoInputKey}
                    type="file"
                    {...visitorForm.fieldA11y('idPhoto')}
                    accept={acceptFor(FILE_RULES.visitorId)}
                    onChange={(e) => {
                      const file = e.target.files[0] || null;
                      const fileError = checkFile(file, FILE_RULES.visitorId);
                      visitorForm.setFieldError('idPhoto', fileError);
                      if (fileError) { e.target.value = ''; setRegisterForm(f => ({ ...f, idPhoto: null })); return; }
                      setRegisterForm(f => ({ ...f, idPhoto: file }));
                    }}
                    className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                  />
                  <FieldError id="visitor-idPhoto" error={visitorForm.errors.idPhoto} />
                  <FileChip file={registerForm.idPhoto} onRemove={clearPhoto} />
                </div>
              </div>

              <InlineAlert onDismiss={() => setFormError('')}>{formError}</InlineAlert>
              <div className="flex gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={requestCloseRegister}
                  className="btn-interactive flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors border-solid cursor-pointer"
                >
                  {t('visitors.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-interactive flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 py-2.5 text-xs font-bold text-white transition-colors border-0 cursor-pointer shadow-md disabled:opacity-50"
                >
                  {submitting ? t('visitors.submitting') : t('visitors.submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDiscard && (
        <ConfirmDialog
          title={t('visitors.discardTitle')}
          message={t('visitors.discardBody')}
          confirmLabel={t('visitors.discardYes')}
          cancelLabel={t('visitors.keepEditing')}
          onConfirm={() => { setConfirmDiscard(false); setRegisterForm(emptyRegisterForm); setShowRegisterModal(false); }}
          onClose={() => setConfirmDiscard(false)}
        />
      )}

      {cancelTarget !== null && (
        <ConfirmDialog
          title={t('visitors.cancelTitle')}
          message={t('visitors.cancelBody')}
          confirmLabel={t('visitors.cancelYes')}
          cancelLabel={t('visitors.keepIt')}
          busy={cancellingId === cancelTarget}
          onConfirm={() => handleCancelRegistration(cancelTarget)}
          onClose={() => setCancelTarget(null)}
        />
      )}

      {departTarget && (
        <ReasonModal
          title={t('visitors.departTitle')}
          description={t('visitors.departDesc')}
          label={t('visitors.departLabel')}
          options={DEPARTURE_NOTE_OPTIONS}
          confirmLabel={t('visitors.markDeparted')}
          tone="indigo"
          onConfirm={confirmDeparture}
          onClose={() => setDepartTarget(null)}
        />
      )}

    </div>
  );
}
