import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faSpinner, faTimes, faCheckCircle, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { getSystemSettings, saveSystemSettings } from '../config/systemSettings';
import api from '../api/axiosConfig';
import { LIMITS, checkEmail, checkNewPassword, checkPasswordMatch, checkPersonName, checkPhMobile, normalizeEmail, toPhLocal10, toPhE164 } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import { SETTINGS_TABS, SETTINGS_TAB_IDS } from './settings/tabs';
import SettingsNav from './settings/SettingsNav';
import AccountPanel from './settings/AccountPanel';
import LeasingPanel from './settings/LeasingPanel';
import PaymentsPanel from './settings/PaymentsPanel';
import ParkingPanel from './settings/ParkingPanel';
import NotificationsPanel from './settings/NotificationsPanel';
import MaintenancePanel from './settings/MaintenancePanel';

const SETTINGS_FORM_ID = 'system-settings-form';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Keys match profile.php / change_password.php bodies.
const PROFILE_VALIDATORS = {
  firstName: (v) => checkPersonName(v, { label: 'First name', max: LIMITS.firstName }),
  lastName: (v) => checkPersonName(v, { label: 'Last name', max: LIMITS.lastName }),
  email: (v) => checkEmail(v, { max: LIMITS.userEmail }),
  contactNo: (v) => (String(v ?? '').trim() ? checkPhMobile(v) : ''),
};
const PASSWORD_VALIDATORS = {
  current_password: (v) => (v ? '' : 'Current password is required.'),
  new_password: (v, all) => checkNewPassword(v)
    || (v && v === all.current_password ? 'New password must be different from the current password.' : ''),
  confirm_password: (v, all) => checkPasswordMatch(all.new_password, v),
};

const AdminAccountSettings = () => {
  // Loaded from the signed-in admin's real account. These used to be hardcoded
  // placeholders ("Admin System", admin@system.com) that saving never touched.
  const storedUser = JSON.parse(sessionStorage.getItem('loggedInUser') || localStorage.getItem('loggedInUser') || '{}');
  const [firstName, setFirstName] = useState(storedUser.first_name || '');
  const [lastName, setLastName] = useState(storedUser.last_name || '');
  const [email, setEmail] = useState(storedUser.email_address || '');
  const [phone, setPhone] = useState('');
  const [profileExtras, setProfileExtras] = useState({ middle_name: '', suffix: '', gender: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const profileForm = useFieldErrors(PROFILE_VALIDATORS, { idPrefix: 'acct-' });
  const passwordForm = useFieldErrors(PASSWORD_VALIDATORS, { idPrefix: 'acctpw-' });

  // System settings: the form's working copy, and the last copy the server
  // accepted. The difference between the two is "unsaved changes".
  const [settings, setSettings] = useState(null);
  const [savedSettings, setSavedSettings] = useState(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [toast, setToast] = useState(null);
  const [testingChannel, setTestingChannel] = useState(null);
  const [smsBalance, setSmsBalance] = useState(null);
  const [checkingBalance, setCheckingBalance] = useState(false);

  // The open tab lives in the URL (?tab=payments) so refresh and back/forward
  // keep the admin's place, and other pages can link straight to a section.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab = SETTINGS_TAB_IDS.includes(requestedTab) ? requestedTab : 'account';
  const activeMeta = SETTINGS_TABS.find((t) => t.id === activeTab);
  const scrollRef = useRef(null);
  const invalidHandled = useRef(false);

  const selectTab = (id) => {
    setSearchParams(id === 'account' ? {} : { tab: id });
    scrollRef.current?.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const loadSettings = async () => {
      const data = await getSystemSettings();
      setSettings(data);
      setSavedSettings(data);
    };
    loadSettings();

    const loadProfile = async () => {
      try {
        const res = await api.get('profile.php');
        if (res.data.success && res.data.data) {
          const p = res.data.data;
          setFirstName(p.first_name || '');
          setLastName(p.last_name || '');
          setPhone(toPhLocal10(p.contact_no));
          setProfileExtras({ middle_name: p.middle_name || '', suffix: p.suffix || '', gender: p.gender || '' });
        }
      } catch (err) {
        console.error('Failed to load admin profile:', err);
      }
    };
    loadProfile();
  }, []);

  const dirtyTabs = useMemo(() => {
    if (!settings || !savedSettings) return new Set();
    return new Set(
      SETTINGS_TABS
        .filter((t) => t.keys?.some((k) => !same(settings[k], savedSettings[k])))
        .map((t) => t.id)
    );
  }, [settings, savedSettings]);
  const isDirty = dirtyTabs.size > 0;

  // Leaving or reloading the page would silently drop the edits.
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

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (savingProfile) return;
    const clean = { firstName: firstName.trim(), lastName: lastName.trim(), email: normalizeEmail(email), contactNo: phone };
    setFirstName(clean.firstName);
    setLastName(clean.lastName);
    setEmail(clean.email);
    if (!profileForm.validateAll(clean)) return;
    setSavingProfile(true);
    try {
      const res = await api.post('profile.php', {
        ...clean, contactNo: toPhE164(phone),
        middleName: profileExtras.middle_name, suffix: profileExtras.suffix, gender: profileExtras.gender
      });
      if (!res.data.success) {
        if (!profileForm.applyServerErrors(res)) showToast('error', 'Profile Not Saved', res.data.message || 'Failed to save your profile.');
        return;
      }
      // Keep the header and guards showing the new name/email without a re-login.
      const store = sessionStorage.getItem('loggedInUser') ? sessionStorage : localStorage;
      store.setItem('loggedInUser', JSON.stringify({ ...storedUser, first_name: clean.firstName, last_name: clean.lastName, email_address: clean.email }));
      showToast('success', 'Profile Updated', 'Your administrator details have been saved.');
    } catch (err) {
      if (!profileForm.applyServerErrors(err)) showToast('error', 'Profile Not Saved', apiErrorMessage(err, 'Failed to save your profile.'));
    } finally {
      setSavingProfile(false);
    }
  };

  // Calls the real endpoint. This form used to show "Password Changed" without sending anything.
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (savingPassword) return;
    const body = { current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword };
    if (!passwordForm.validateAll(body)) return;
    setSavingPassword(true);
    try {
      const res = await api.post('change_password.php', body);
      if (!res.data.success) {
        if (!passwordForm.applyServerErrors(res)) showToast('error', 'Password Not Changed', res.data.message || 'Failed to change password.');
        return;
      }
      const ended = res.data.sessions_ended || 0;
      showToast('success', 'Password Changed', `Your password has been updated.${ended ? ` ${ended} other session(s) were signed out.` : ''}`);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      if (!passwordForm.applyServerErrors(err)) showToast('error', 'Password Not Changed', apiErrorMessage(err, 'Failed to change password.'));
    } finally {
      setSavingPassword(false);
    }
  };

  // Sends a real notification to the admin's own number/address through whatever
  // driver is configured. The full rendered SMS text and email HTML go to the
  // browser console: while the drivers are mocks that console output IS the
  // message, and it stays useful afterwards for checking what a provider was
  // actually handed. Reads the stored settings, so the panel disables it while
  // there are unsaved changes.
  const handleTestNotification = async (channel) => {
    setTestingChannel(channel);
    try {
      const res = await api.post('send_test_notification.php', { channel });
      const data = res.data;

      console.groupCollapsed(
        `%cAMS test notification (${channel})${data.dry_run ? ' — DRY RUN, nothing was sent' : ''}`,
        'color:#2563eb;font-weight:bold'
      );
      console.log('Drivers:', data.drivers);
      console.log('Channel switches:', data.channels);
      console.log('Results:', data.results);
      console.log(`SMS text (${data.rendered?.sms_length} chars):\n${data.rendered?.sms_text}`);
      console.log('Email subject:', data.rendered?.subject);
      console.log('Email HTML:\n' + data.rendered?.email_html);
      console.groupEnd();

      const outcomes = Object.entries(data.results || {});
      const failed = outcomes.filter(([, r]) => r.status !== 'sent');
      if (!outcomes.length) {
        showToast('error', 'Nothing Sent', 'No channel was eligible. Check the SMS and Email switches.');
      } else if (failed.length) {
        showToast('error', 'Test Incomplete',
          failed.map(([ch, r]) => `${ch}: ${r.reason || r.status}`).join(' · '));
      } else {
        showToast('success', data.dry_run ? 'Test Sent (Dry Run)' : 'Test Sent',
          `${outcomes.map(([ch]) => ch).join(' and ')} delivered. Full message printed to the browser console (F12).`);
      }
    } catch (err) {
      showToast('error', 'Test Failed', err?.response?.data?.message || err.message || 'Could not send the test notification.');
    } finally {
      setTestingChannel(null);
    }
  };

  // Live Semaphore credits. Reads the stored key, so save first. Semaphore
  // allows this call twice a minute, hence a button rather than polling on
  // load; the server reuses an answer for 60 s and says so (cached/checked_at).
  const handleCheckBalance = async () => {
    setCheckingBalance(true);
    try {
      const res = await api.get('get_sms_balance.php');
      setSmsBalance(res.data.success
        ? {
            credits: res.data.credit_balance,
            account: res.data.account_name,
            status: res.data.account_status,
            cached: !!res.data.cached,
            checkedAt: res.data.checked_at,
          }
        : { error: res.data.message || 'Could not read the balance.' });
    } catch (err) {
      setSmsBalance({ error: err?.response?.data?.message || err.message || 'Could not read the balance.' });
    } finally {
      setCheckingBalance(false);
    }
  };

  const handleSettingsSave = async (e) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      await saveSystemSettings(settings);
      setSavedSettings(settings);
      showToast('success', 'Settings Saved', 'Your changes are saved and apply across the system.');
    } catch (error) {
      console.error('Failed to save settings:', error);
      showToast('error', 'Save Failed',
        error?.response?.data?.message || error?.message || 'Failed to save system settings. Please try again.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleDiscard = () => setSettings(savedSettings);

  // Every system-settings tab stays mounted (hidden) so the browser validates
  // all of them on save. When the first invalid field sits in a hidden tab,
  // open that tab and show the browser's message on the field.
  const handleInvalid = (e) => {
    if (invalidHandled.current) return;
    invalidHandled.current = true;
    setTimeout(() => { invalidHandled.current = false; }, 0);

    const field = e.target;
    const tabId = field.closest('[data-tab]')?.dataset.tab;
    if (tabId && tabId !== activeTab) {
      selectTab(tabId);
      setTimeout(() => field.reportValidity(), 50);
    }
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const panelProps = { settings, updateSetting };
  const showSaveBar = activeTab !== 'account' && isDirty;

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="Settings" />

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 py-6 md:p-8 flex flex-col md:flex-row gap-6 md:gap-8">
            <aside className="md:w-56 shrink-0 min-w-0">
              <div className="md:sticky md:top-0">
                <SettingsNav tabs={SETTINGS_TABS} active={activeTab} onSelect={selectTab} dirtyTabs={dirtyTabs} />
              </div>
            </aside>

            <div className="flex-1 min-w-0 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-800 m-0">{activeMeta.label}</h2>
                <p className="text-sm text-slate-500 m-0 mt-1">{activeMeta.description}</p>
              </div>

              {activeTab === 'account' && (
                <AccountPanel
                  firstName={firstName} setFirstName={setFirstName}
                  lastName={lastName} setLastName={setLastName}
                  email={email} setEmail={setEmail}
                  phone={phone} setPhone={setPhone}
                  savingProfile={savingProfile} onProfileSubmit={handleProfileSubmit}
                  currentPassword={currentPassword} setCurrentPassword={setCurrentPassword}
                  newPassword={newPassword} setNewPassword={setNewPassword}
                  confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword}
                  savingPassword={savingPassword} onPasswordSubmit={handlePasswordSubmit}
                  profileForm={profileForm} passwordForm={passwordForm}
                />
              )}

              {activeTab !== 'account' && !settings && (
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
                  <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />Loading settings…
                </div>
              )}

              {settings && (
                <form
                  id={SETTINGS_FORM_ID}
                  onSubmit={handleSettingsSave}
                  onInvalidCapture={handleInvalid}
                  hidden={activeTab === 'account'}
                >
                  <div data-tab="leasing" hidden={activeTab !== 'leasing'} className="space-y-6">
                    <LeasingPanel {...panelProps} />
                  </div>
                  <div data-tab="payments" hidden={activeTab !== 'payments'} className="space-y-6">
                    <PaymentsPanel {...panelProps} />
                  </div>
                  <div data-tab="parking" hidden={activeTab !== 'parking'} className="space-y-6">
                    <ParkingPanel {...panelProps} />
                  </div>
                  <div data-tab="notifications" hidden={activeTab !== 'notifications'} className="space-y-6">
                    <NotificationsPanel
                      {...panelProps}
                      isDirty={isDirty}
                      testingChannel={testingChannel}
                      onTest={handleTestNotification}
                      checkingBalance={checkingBalance}
                      smsBalance={smsBalance}
                      onCheckBalance={handleCheckBalance}
                    />
                  </div>
                  <div data-tab="maintenance" hidden={activeTab !== 'maintenance'} className="space-y-6">
                    <MaintenancePanel {...panelProps} />
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* Save bar: only while there is something to save. Outside the scroll
            area so it never moves; submits the form by id. */}
        {showSaveBar && (
          <div className="shrink-0 border-t border-slate-200 bg-white px-4 md:px-8 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.06)] animate-fadeIn">
            <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Unsaved changes
                {dirtyTabs.size > 1 && (
                  <span className="font-normal text-slate-500">
                    in {SETTINGS_TABS.filter((t) => dirtyTabs.has(t.id)).map((t) => t.label).join(', ')}
                  </span>
                )}
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
                  type="submit"
                  form={SETTINGS_FORM_ID}
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
          <div className={`fixed right-6 z-50 max-w-sm w-[calc(100vw-3rem)] sm:w-96 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/80 p-4 transition-all duration-300 flex items-start gap-3.5 animate-fadeIn ${showSaveBar ? 'bottom-24' : 'bottom-6'}`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white shadow-sm ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
              <FontAwesomeIcon icon={toast.type === 'success' ? faCheckCircle : faExclamationTriangle} className="text-base" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-800 m-0 tracking-tight">{toast.title}</h4>
                <button
                  type="button"
                  onClick={() => setToast(null)}
                  className="text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer p-1 text-xs"
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

export default AdminAccountSettings;
