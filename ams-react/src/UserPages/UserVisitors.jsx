import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faIdBadge, faUserPlus, faClock,
  faTimes,
  faSync, faArrowLeft
} from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import { LIMITS, checkDate, checkLength, checkPhMobile, firstError, localDateString, toPhE164 } from '../utils/validation';
import PhoneInput from '../Components/PhoneInput';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import { apiErrorMessage } from '../utils/apiError';
import { useLang } from '../config/i18n';
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
  const [expectedBounds, setExpectedBounds] = useState({ min: '', max: '' });

  const openRegisterModal = () => {
    const now = Date.now();
    setExpectedBounds({
      min: localDateString(new Date(now)),
      max: localDateString(new Date(now + 30 * 24 * 60 * 60 * 1000)),
    });
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
    expectedTime: ''
  };
  const [registerForm, setRegisterForm] = useState(emptyRegisterForm);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

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
        setError(res.data.message || 'Failed to fetch visitor records.');
      }
    } catch (err) {
      console.error('Failed to load visitor records:', err);
      setError('Unable to load visitor logs. Please check your connection.');
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
    if (!registerForm.visitorName || !registerForm.contactNumber || !registerForm.idNumber.trim()
        || !registerForm.expectedDate || !registerForm.expectedTime) {
      alert('Please fill in all required fields.');
      return;
    }
    // check_in_visitor.php accepts an arrival up to 1 hour in the past.
    const expectedAt = `${registerForm.expectedDate}T${registerForm.expectedTime}`;
    const visitorError = firstError(
      checkLength(registerForm.visitorName, LIMITS.fullName, 'Visitor name'),
      checkPhMobile(registerForm.contactNumber),
      checkLength(registerForm.idNumber, LIMITS.idNumber, 'ID number'),
      checkDate(registerForm.expectedDate, { ...expectedBounds, label: 'Arrival date' }),
      new Date(expectedAt).getTime() < Date.now() - 60 * 60 * 1000 ? 'Arrival time cannot be in the past.' : ''
    );
    if (visitorError) {
      alert(visitorError);
      return;
    }
    setSubmitting(true);
    try {
      // The unit and host are always the tenant's own current tenancy —
      // resolved server-side from the session, not from anything posted here.
      const fields = {
        visitorName: registerForm.visitorName,
        contactNumber: toPhE164(registerForm.contactNumber),
        purpose: registerForm.purpose,
        idType: registerForm.idType,
        idNumber: registerForm.idNumber.trim(),
        vehiclePlate: registerForm.vehiclePlate,
        expectedAt,
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
      } else {
        alert(res.data.message || 'Failed to register visitor.');
      }
    } catch (err) {
      console.error('Registration failed:', err);
      alert(err.response?.data?.message || 'Server error registering visitor.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckoutSelf = async (id) => {
    if (!window.confirm('Mark this visitor as departed from your unit?')) return;
    try {
      const res = await api.post('update_visitor_status.php', {
        id,
        action: 'checked_out',
        checkoutNotes: 'Tenant reported departure.'
      });
      if (res.data.success) {
        fetchTenantData();
      } else {
        alert(res.data.message || 'Failed to update status.');
      }
    } catch (err) {
      console.error('Failed to mark visitor departure:', err);
      alert(apiErrorMessage(err, 'Failed to update status.'));
    }
  };

  const handleCancelRegistration = async (id) => {
    if (!window.confirm('Cancel this visitor pre-registration?')) return;
    setCancellingId(id);
    try {
      const res = await api.post('update_visitor_status.php', { id, action: 'cancel' });
      if (res.data.success) {
        fetchTenantData();
      } else {
        alert(res.data.message || 'Failed to cancel registration.');
      }
    } catch (err) {
      console.error('Failed to cancel registration:', err);
      alert(err.response?.data?.message || 'Failed to cancel registration.');
    } finally {
      setCancellingId(null);
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
              <h1 className="text-2xl sm:text-3xl font-extrabold m-0 tracking-tight flex items-center gap-3" style={{ color: '#3b4276' }}>
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
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors cursor-pointer"
                title="Refresh"
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

        {/* Currently On-Premise / Active Visitors Section */}
        {activeVisitors.length > 0 && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-emerald-900 m-0 flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
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
                    <p className="text-[11px] text-slate-400 m-0">
                      {new Date(v.checkInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {t('visitors.colDuration')}: <span className="font-bold text-emerald-600">{v.duration}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCheckoutSelf(v.id)}
                    className="btn-interactive rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 text-xs font-bold transition-colors border-0 cursor-pointer"
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
                    <span className="rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5">Pending Review</span>
                  </div>
                  <p className="text-xs text-slate-500 m-0 mt-1">Contact: {v.contactNumber} • Purpose: {v.purpose}</p>
                  {v.expectedAt && (
                    <p className="text-[11px] text-slate-500 m-0 mt-0.5">
                      Expected {new Date(v.expectedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                  {v.vehiclePlate && (
                    <p className="text-[11px] text-indigo-600 font-mono font-bold m-0 mt-0.5">Vehicle: {v.vehiclePlate}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCancelRegistration(v.id)}
                    disabled={cancellingId === v.id}
                    className="mt-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 text-[11px] font-bold transition-colors border-0 cursor-pointer disabled:opacity-50"
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

          <div className="user-visitors-table-container table-scroll-x overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">{t('visitors.colName')}</th>
                  <th className="px-4 py-3">{t('visitors.colPurpose')}</th>
                  <th className="px-4 py-3">{t('visitors.colPlate')}</th>
                  <th className="px-4 py-3">{t('visitors.colCheckIn')}</th>
                  <th className="px-4 py-3">{t('visitors.colDuration')}</th>
                  <th className="px-5 py-3 text-center">{t('visitors.colStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="px-5 py-10 text-center text-slate-400">{t('visitors.loading')}</td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan="6" className="px-5 py-10 text-center text-rose-600 text-sm">{error}</td>
                  </tr>
                ) : visitors.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-5 py-12 text-center">
                      <div className="flex items-center justify-center gap-2.5 text-slate-400">
                        <FontAwesomeIcon icon={faIdBadge} className="text-xl text-slate-300 shrink-0" />
                        <span className="text-sm italic">{t('visitors.noneLogged')}</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  visitors.map(v => (
                    <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                      
                      <td className="px-5 py-3.5">
                        <p className="font-bold text-slate-800 text-sm m-0">{v.visitorName}</p>
                        <p className="text-xs text-slate-400 m-0">{v.contactNumber}</p>
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-600 font-medium">{v.purpose}</td>

                      <td className="px-4 py-3.5 text-xs">
                        {v.vehiclePlate ? (
                          <span className="font-mono font-bold text-indigo-600 uppercase bg-indigo-50 px-2 py-0.5 rounded text-[11px]">{v.vehiclePlate}</span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        {new Date(v.checkInAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        <br />
                        <span className="text-[10px] text-slate-400">{new Date(v.checkInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>

                      <td className="px-4 py-3.5 text-xs font-mono font-bold text-slate-700">
                        {v.status === 'pending_approval' ? '—' : v.duration}
                      </td>

                      <td className="px-5 py-3.5 text-center">
                        {v.status === 'pending_approval' && (
                          <span className="rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold px-2.5 py-1">Pending Review</span>
                        )}
                        {v.status === 'checked_in' && (
                          <span className="rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2.5 py-1">Active</span>
                        )}
                        {v.status === 'overstayed' && (
                          <span className="rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold px-2.5 py-1">Overstayed</span>
                        )}
                        {v.status === 'checked_out' && (
                          <span className="rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold px-2.5 py-1">Departed</span>
                        )}
                        {v.status === 'denied' && (
                          <span className="rounded-full bg-red-100 text-red-700 text-[10px] font-bold px-2.5 py-1">Declined</span>
                        )}
                        {v.status === 'cancelled' && (
                          <span className="rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold px-2.5 py-1">Cancelled</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 modal-overlay-anim" onClick={() => setShowRegisterModal(false)}>
          <div className="user-visitors-modal modal-card-anim sheet-mobile w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faUserPlus} className="text-indigo-600" />
                <h3 className="text-lg font-bold text-slate-800 m-0">{t('visitors.modalTitle')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer p-1"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              {t('visitors.modalDesc')}
              {tenantRoom && <> {t('visitors.modalUnitNote')} <span className="font-bold text-slate-700">Unit {tenantRoom}</span>.</>}
            </p>

            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{t('visitors.visitorName')} *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Juan Dela Cruz"
                  value={registerForm.visitorName}
                  maxLength={LIMITS.fullName}
                  onChange={(e) => setRegisterForm({ ...registerForm, visitorName: e.target.value })}
                  className="focus-glow w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{t('visitors.contactNumber')} *</label>
                <PhoneInput
                  required
                  value={registerForm.contactNumber}
                  onChange={(digits) => setRegisterForm({ ...registerForm, contactNumber: digits })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{t('visitors.purpose')} *</label>
                <select
                  value={registerForm.purpose}
                  onChange={(e) => setRegisterForm({ ...registerForm, purpose: e.target.value })}
                  className="focus-glow w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white cursor-pointer"
                >
                  <option value="Personal Visit">Personal Visit / Friends / Family</option>
                  <option value="Delivery / Courier">Food / Package Delivery</option>
                  <option value="Maintenance / Contractor">Maintenance / Contractor / Repair</option>
                  <option value="Official / Business">Official / Business</option>
                  <option value="Short Stay Guest">Short Stay Guest</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t('visitors.expectedDate')} *</label>
                  <input
                    type="date"
                    required
                    min={expectedBounds.min}
                    max={expectedBounds.max}
                    value={registerForm.expectedDate}
                    onChange={(e) => setRegisterForm({ ...registerForm, expectedDate: e.target.value })}
                    className="focus-glow w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t('visitors.expectedTime')} *</label>
                  <input
                    type="time"
                    required
                    value={registerForm.expectedTime}
                    onChange={(e) => setRegisterForm({ ...registerForm, expectedTime: e.target.value })}
                    className="focus-glow w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t('visitors.idType')} *</label>
                  <select
                    required
                    value={registerForm.idType}
                    onChange={(e) => setRegisterForm({ ...registerForm, idType: e.target.value })}
                    className="focus-glow w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-800 outline-none focus:border-indigo-500 bg-white cursor-pointer"
                  >
                    <option value="National ID">National ID</option>
                    <option value="Driver's License">Driver's License</option>
                    <option value="Passport">Passport</option>
                    <option value="UMID / SSS">UMID / SSS</option>
                    <option value="Student / Work ID">Student / Work ID</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t('visitors.idNumber')} *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. D01-19-12345"
                    value={registerForm.idNumber}
                    maxLength={LIMITS.idNumber}
                    onChange={(e) => setRegisterForm({ ...registerForm, idNumber: e.target.value })}
                    className="focus-glow w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-800 outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t('visitors.vehiclePlate')}</label>
                  <input
                    type="text"
                    placeholder="e.g. N02-1234"
                    value={registerForm.vehiclePlate}
                    maxLength={LIMITS.visitorPlate}
                    onChange={(e) => setRegisterForm({ ...registerForm, vehiclePlate: e.target.value })}
                    className="focus-glow w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-800 outline-none focus:border-indigo-500 uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t('visitors.idPhoto')}</label>
                  <input
                    type="file"
                    accept={acceptFor(FILE_RULES.visitorId)}
                    onChange={(e) => {
                      const file = e.target.files[0] || null;
                      const fileError = checkFile(file, FILE_RULES.visitorId);
                      if (fileError) { alert(fileError); e.target.value = ''; setRegisterForm({ ...registerForm, idPhoto: null }); return; }
                      setRegisterForm({ ...registerForm, idPhoto: file });
                    }}
                    className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
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

    </div>
  );
}
