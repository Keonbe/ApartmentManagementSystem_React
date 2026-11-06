import { useState, useEffect } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faCheckCircle, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { LIMITS, checkEmail, checkNewPassword, checkPasswordMatch, checkPersonName, checkPhMobile, normalizeEmail, toPhLocal10, toPhE164 } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import AccountPanel from './settings/AccountPanel';
import { PROFILE_UPDATED_EVENT } from '../config/appEvents';

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
  const storedUser = JSON.parse(sessionStorage.getItem('loggedInUser') || localStorage.getItem('loggedInUser') || '{}');
  const [firstName, setFirstName] = useState(storedUser.first_name || '');
  const [lastName, setLastName] = useState(storedUser.last_name || '');
  const [email, setEmail] = useState(storedUser.email_address || '');
  const [phone, setPhone] = useState('');
  const [profileExtras, setProfileExtras] = useState({ middle_name: '', suffix: '', gender: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileState, setProfileState] = useState('loading'); // loading | error | ready

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [toast, setToast] = useState(null);

  const profileForm = useFieldErrors(PROFILE_VALIDATORS, { idPrefix: 'acct-' });
  const passwordForm = useFieldErrors(PASSWORD_VALIDATORS, { idPrefix: 'acctpw-' });

  const showToast = (type, title, message) => {
    setToast({ type, title, message });
    setTimeout(() => setToast(null), 4500);
  };

  const loadProfile = async () => {
    setProfileState('loading');
    try {
      const res = await api.get('profile.php');
      if (res.data.success && res.data.data) {
        const p = res.data.data;
        setFirstName(p.first_name || '');
        setLastName(p.last_name || '');
        setPhone(toPhLocal10(p.contact_no));
        setProfileExtras({ middle_name: p.middle_name || '', suffix: p.suffix || '', gender: p.gender || '' });
        setProfileState('ready');
      } else {
        setProfileState('error');
      }
    } catch (err) {
      console.error('Failed to load admin profile:', err);
      setProfileState('error');
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get('profile.php');
        if (!active) return;
        if (res.data.success && res.data.data) {
          const p = res.data.data;
          setFirstName(p.first_name || '');
          setLastName(p.last_name || '');
          setPhone(toPhLocal10(p.contact_no));
          setProfileExtras({ middle_name: p.middle_name || '', suffix: p.suffix || '', gender: p.gender || '' });
          setProfileState('ready');
        } else {
          setProfileState('error');
        }
      } catch (err) {
        if (!active) return;
        console.error('Failed to load admin profile:', err);
        setProfileState('error');
      }
    })();
    return () => { active = false; };
  }, []);

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
        ...clean,
        contactNo: toPhE164(phone),
        middleName: profileExtras.middle_name,
        suffix: profileExtras.suffix,
        gender: profileExtras.gender,
      });
      if (!res.data.success) {
        if (!profileForm.applyServerErrors(res)) {
          showToast('error', 'Profile Not Saved', res.data.message || 'Failed to save your profile.');
        }
        return;
      }
      const store = sessionStorage.getItem('loggedInUser') ? sessionStorage : localStorage;
      store.setItem(
        'loggedInUser',
        JSON.stringify({ ...storedUser, first_name: clean.firstName, last_name: clean.lastName, email_address: clean.email, email: clean.email })
      );
      window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT));
      showToast('success', 'Profile Updated', 'Your administrator details have been saved.');
    } catch (err) {
      if (!profileForm.applyServerErrors(err)) {
        showToast('error', 'Profile Not Saved', apiErrorMessage(err, 'Failed to save your profile.'));
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (savingPassword) return;
    const body = { current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword };
    if (!passwordForm.validateAll(body)) return;
    setSavingPassword(true);
    try {
      const res = await api.post('change_password.php', body);
      if (!res.data.success) {
        if (!passwordForm.applyServerErrors(res)) {
          showToast('error', 'Password Not Changed', res.data.message || 'Failed to change password.');
        }
        return;
      }
      const ended = res.data.sessions_ended || 0;
      showToast(
        'success',
        'Password Changed',
        `Your password has been updated.${ended ? ` ${ended} other session(s) were signed out.` : ''}`
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      if (!passwordForm.applyServerErrors(err)) {
        showToast('error', 'Password Not Changed', apiErrorMessage(err, 'Failed to change password.'));
      }
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="Account Settings" />

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 py-6 md:p-8 space-y-6">
            <div>
              <h2 className="text-section font-bold text-slate-800 m-0">Administrator Account</h2>
              <p className="text-body text-slate-500 m-0 mt-1">
                Manage your personal profile credentials and change your administrator password.
              </p>
            </div>

            <AccountPanel
              firstName={firstName}
              setFirstName={setFirstName}
              lastName={lastName}
              setLastName={setLastName}
              email={email}
              setEmail={setEmail}
              phone={phone}
              setPhone={setPhone}
              savingProfile={savingProfile}
              onProfileSubmit={handleProfileSubmit}
              currentPassword={currentPassword}
              setCurrentPassword={setCurrentPassword}
              newPassword={newPassword}
              setNewPassword={setNewPassword}
              confirmPassword={confirmPassword}
              setConfirmPassword={setConfirmPassword}
              savingPassword={savingPassword}
              onPasswordSubmit={handlePasswordSubmit}
              profileForm={profileForm}
              passwordForm={passwordForm}
              profileState={profileState}
              onProfileRetry={loadProfile}
            />
          </div>
        </div>

        {/* Floating Toast Notification */}
        {toast && (
          <div className="fixed top-24 right-6 z-50 max-w-sm w-[calc(100vw-3rem)] sm:w-96 bg-white/95 backdrop-blur-md rounded-card shadow-dialog border border-slate-200/80 p-4 transition-all duration-300 flex items-start gap-3.5 animate-fadeIn">
            <div className={`w-9 h-9 rounded-card flex items-center justify-center shrink-0 text-white shadow-card ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
              <FontAwesomeIcon icon={toast.type === 'success' ? faCheckCircle : faExclamationTriangle} className="text-base" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-body font-bold text-slate-800 m-0 tracking-tight">{toast.title}</h4>
                <button
                  aria-label="Dismiss"
                  type="button"
                  onClick={() => setToast(null)}
                  className="text-slate-500 hover:text-slate-600 bg-transparent border-0 cursor-pointer p-1 text-label"
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
              <p className="text-label text-slate-500 mt-1 m-0 leading-relaxed font-normal">{toast.message}</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminAccountSettings;
