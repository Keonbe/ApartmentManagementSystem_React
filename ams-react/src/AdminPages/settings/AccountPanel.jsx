import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserShield, faKey, faSave, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { SettingsSection, Field, INPUT } from './SettingsSection';
import { LIMITS, PASSWORD_MAX_BYTES } from '../../utils/validation';

// Profile and password save through their own endpoints (profile.php,
// change_password.php), so each keeps its own button rather than the page's
// system-settings save bar.
export default function AccountPanel({
  firstName, setFirstName, lastName, setLastName, email, setEmail, phone, setPhone,
  savingProfile, onProfileSubmit,
  currentPassword, setCurrentPassword, newPassword, setNewPassword, confirmPassword, setConfirmPassword,
  savingPassword, onPasswordSubmit,
}) {
  return (
    <>
      <SettingsSection
        icon={faUserShield}
        tone="indigo"
        title="Administrator Profile"
        description="Your name and contact details. The contact number also receives test SMS messages."
      >
        <form onSubmit={onProfileSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="First Name">
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={INPUT} maxLength={LIMITS.firstName} required />
            </Field>
            <Field label="Last Name">
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={INPUT} maxLength={LIMITS.lastName} required />
            </Field>
            <Field label="Email Address">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} maxLength={LIMITS.userEmail} required />
            </Field>
            <Field label="Contact Number">
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09123456789" className={INPUT} maxLength={16} />
            </Field>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingProfile}
              className="btn-interactive bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-lg text-sm transition-all shadow-sm flex items-center gap-2 border-0 cursor-pointer disabled:opacity-60"
            >
              <FontAwesomeIcon icon={savingProfile ? faSpinner : faSave} className={savingProfile ? 'animate-spin' : ''} />
              {savingProfile ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </form>
      </SettingsSection>

      <SettingsSection
        icon={faKey}
        tone="amber"
        title="Password"
        description="Use a long, random password. Changing it signs out your other sessions."
      >
        <form onSubmit={onPasswordSubmit} className="space-y-5">
          <Field label="Current Password" className="max-w-md">
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={INPUT} required />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="New Password" hint="At least 8 characters.">
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={INPUT} maxLength={PASSWORD_MAX_BYTES} required />
            </Field>
            <Field label="Confirm New Password">
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={INPUT} maxLength={PASSWORD_MAX_BYTES} required />
            </Field>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingPassword}
              className="btn-interactive bg-amber-500 hover:bg-amber-600 text-white font-bold px-6 py-2.5 rounded-lg text-sm transition-all shadow-sm flex items-center gap-2 border-0 cursor-pointer disabled:opacity-60"
            >
              <FontAwesomeIcon icon={savingPassword ? faSpinner : faSave} className={savingPassword ? 'animate-spin' : ''} />
              {savingPassword ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </form>
      </SettingsSection>
    </>
  );
}
