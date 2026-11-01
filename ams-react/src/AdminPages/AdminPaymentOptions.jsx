import { useState, useEffect, useMemo, useRef } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faSpinner, faTimes, faCheckCircle, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { getSystemSettings, saveSystemSettings } from '../config/systemSettings';
import PaymentsPanel from './settings/PaymentsPanel';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const PAYMENT_KEYS = [
  'paymentWindowDays',
  'overdueThresholdDays',
  'paymentMode', 'paymentSandboxEnabled',
  'paymentChGcashManual', 'paymentChBankManual', 'paymentChQrphManual', 'paymentChInPerson',
  'paymentChGcashSandbox', 'paymentChBankSandbox', 'paymentChMaya',
  'duplicateReferencePolicy',
  'paymongoSecretKey', 'paymongoPublicKey', 'paymongoWebhookSecret',
  'qrphSlots', 'qrphActiveSlot',
];

const AdminPaymentOptions = () => {
  const [settings, setSettings] = useState(null);
  const [savedSettings, setSavedSettings] = useState(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [toast, setToast] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const loadSettings = async () => {
      const data = await getSystemSettings();
      setSettings(data);
      setSavedSettings(data);
    };
    loadSettings();
  }, []);

  const isDirty = useMemo(() => {
    if (!settings || !savedSettings) return false;
    return PAYMENT_KEYS.some((k) => !same(settings[k], savedSettings[k]));
  }, [settings, savedSettings]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const showToast = (type, title, message) => {
    setToast({ type, title, message });
    setTimeout(() => setToast(null), 4500);
  };

  const updateSetting = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSettingsSave = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setIsSavingSettings(true);
    try {
      await saveSystemSettings(settings);
      setSavedSettings(settings);
      showToast('success', 'Payment Options Saved', 'Payment settings have been saved and applied across the system.');
    } catch (error) {
      console.error('Failed to save payment options:', error);
      showToast(
        'error',
        'Save Failed',
        error?.response?.data?.message || error?.message || 'Failed to save payment options. Please try again.'
      );
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleDiscard = () => {
    setSettings(savedSettings);
  };

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="Payment Options" />

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 py-6 md:p-8 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800 m-0">Payment Options</h2>
              <p className="text-sm text-slate-500 m-0 mt-1">
                Enable or disable payment options, configure QR Ph slots and active QR code, overdue policy, and gateway settings.
              </p>
            </div>

            {!settings ? (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
                <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />Loading payment options…
              </div>
            ) : (
              <form onSubmit={handleSettingsSave} className="space-y-6">
                <PaymentsPanel settings={settings} updateSetting={updateSetting} />
              </form>
            )}
          </div>
        </div>

        {/* Save Bar */}
        {isDirty && (
          <div className="shrink-0 border-t border-slate-200 bg-white px-4 md:px-8 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.06)] animate-fadeIn">
            <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Unsaved changes in Payment Options
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDiscard}
                  disabled={isSavingSettings}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors disabled:opacity-60"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={handleSettingsSave}
                  disabled={isSavingSettings}
                  className="btn-interactive px-5 py-2 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 border-0 cursor-pointer shadow-sm flex items-center gap-2 transition-colors disabled:opacity-70"
                >
                  <FontAwesomeIcon icon={isSavingSettings ? faSpinner : faSave} spin={isSavingSettings} />
                  {isSavingSettings ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Toast Notification */}
        {toast && (
          <div className={`fixed top-24 right-6 z-50 max-w-sm w-[calc(100vw-3rem)] sm:w-96 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/80 p-4 transition-all duration-300 flex items-start gap-3.5 animate-fadeIn`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white shadow-sm ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
              <FontAwesomeIcon icon={toast.type === 'success' ? faCheckCircle : faExclamationTriangle} className="text-base" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-800 m-0 tracking-tight">{toast.title}</h4>
                <button
                  aria-label="Dismiss"
                  type="button"
                  onClick={() => setToast(null)}
                  className="text-slate-500 hover:text-slate-600 bg-transparent border-0 cursor-pointer p-1 text-xs"
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1 m-0 leading-relaxed font-normal">{toast.message}</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminPaymentOptions;

