import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserShield, faKey, faSave, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { SettingsSection, Field, INPUT } from './SettingsSection';
import { LIMITS, normalizeEmail } from '../../utils/validation';
import PhoneInput from '../../Components/PhoneInput';
import PasswordField from '../../Components/form/PasswordField';
import PasswordChecklist from '../../Components/form/PasswordChecklist';
import { invalidCls } from '../../Components/form/formHelpers';
import { btn } from '../../Components/admin/ui/styles';
import LoadError from '../../Components/admin/ui/LoadError';
import { Skeleton, SkeletonBlock } from '../../Components/admin/ui/Skeleton';

const PW_LABEL = 'text-sm font-semibold text-slate-700';
const PW_INPUT = `${INPUT} pr-12`;

// Profile and password save through their own endpoints (profile.php,
// change_password.php), so each keeps its own button rather than the page's
// system-settings save bar. `profileForm` / `passwordForm` are the page's
// useFieldErrors() objects.
export default function AccountPanel({
  firstName, setFirstName, lastName, setLastName, email, setEmail, phone, setPhone,
  savingProfile, onProfileSubmit, profileState = 'ready', onProfileRetry,
  currentPassword, setCurrentPassword, newPassword, setNewPassword, confirmPassword, setConfirmPassword,
  savingPassword, onPasswordSubmit,
  profileForm, passwordForm,
}) {
  const profile = { firstName, lastName, email, contactNo: phone };
  const passwords = { current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword };
  const pErr = profileForm.errors;
  const pwErr = passwordForm.errors;

  const textChange = (name, setter) => (e) => { setter(e.target.value); profileForm.clearError(name); };
  const textBlur = (name, setter) => () => {
    const v = name === 'email' ? normalizeEmail(profile[name]) : profile[name].trim();
    if (v !== profile[name]) setter(v);
    profileForm.validateField(name, { ...profile, [name]: v });
  };

  const pwChange = (name, setter) => (e) => { setter(e.target.value); passwordForm.clearError(name); };
  const pwBlur = (name) => () => { if (passwords[name]) passwordForm.validateField(name, passwords); };

  return (
    <>
      <SettingsSection
        icon={faUserShield}
        tone="indigo"
        title="Administrator Profile"
        description="Your name and contact details. The contact number also receives test SMS messages."
      >
        {/* An unloaded profile is never shown as empty fields that could be saved. */}
        {profileState === 'loading' ? (
          <SkeletonBlock label="Loading your profile…" className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2"><Skeleton className="h-3 w-1/3" /><Skeleton className="h-10 w-full" /></div>
            ))}
          </SkeletonBlock>
        ) : profileState === 'error' ? (
          <LoadError title="Couldn't load your profile" onRetry={onProfileRetry} />
        ) : (
        <form onSubmit={onProfileSubmit} className="space-y-5" noValidate>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="First Name" htmlFor="acct-firstName" error={pErr.firstName}>
              <input type="text" {...profileForm.fieldA11y('firstName')} autoComplete="given-name" value={firstName}
                onChange={textChange('firstName', setFirstName)} onBlur={textBlur('firstName', setFirstName)}
                className={INPUT + invalidCls(pErr.firstName)} maxLength={LIMITS.firstName} required />
            </Field>
            <Field label="Last Name" htmlFor="acct-lastName" error={pErr.lastName}>
              <input type="text" {...profileForm.fieldA11y('lastName')} autoComplete="family-name" value={lastName}
                onChange={textChange('lastName', setLastName)} onBlur={textBlur('lastName', setLastName)}
                className={INPUT + invalidCls(pErr.lastName)} maxLength={LIMITS.lastName} required />
            </Field>
            <Field label="Email Address" htmlFor="acct-email" error={pErr.email}>
              <input type="email" {...profileForm.fieldA11y('email')} inputMode="email" autoComplete="email" value={email}
                onChange={textChange('email', setEmail)} onBlur={textBlur('email', setEmail)}
                className={INPUT + invalidCls(pErr.email)} maxLength={LIMITS.userEmail} required />
            </Field>
            <Field label="Contact Number" htmlFor="acct-contactNo">
              <PhoneInput
                id="acct-contactNo"
                name="contactNo"
                value={phone}
                onChange={(digits) => { setPhone(digits); profileForm.clearError('contactNo'); }}
                onBlur={() => profileForm.validateField('contactNo', profile)}
                error={pErr.contactNo}
                inputClassName={`${INPUT} rounded-l-none${invalidCls(pErr.contactNo)}`}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingProfile}
              className={btn('primary', 'md', 'btn-interactive')}
            >
              <FontAwesomeIcon icon={savingProfile ? faSpinner : faSave} className={savingProfile ? 'animate-spin' : ''} />
              {savingProfile ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </form>
        )}
      </SettingsSection>

      <SettingsSection
        icon={faKey}
        tone="amber"
        title="Password"
        description="Use a long, random password. Changing it signs out your other sessions."
      >
        <form onSubmit={onPasswordSubmit} className="space-y-5" noValidate>
          <div className="max-w-md">
            <PasswordField
              a11y={passwordForm.fieldA11y('current_password')}
              label="Current Password"
              labelClassName={PW_LABEL}
              inputClassName={PW_INPUT}
              autoComplete="current-password"
              maxLength={128}
              value={currentPassword}
              onChange={pwChange('current_password', setCurrentPassword)}
              onBlur={pwBlur('current_password')}
              error={pwErr.current_password}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <PasswordField
              a11y={passwordForm.fieldA11y('new_password')}
              label="New Password"
              labelClassName={PW_LABEL}
              inputClassName={PW_INPUT}
              value={newPassword}
              onChange={pwChange('new_password', setNewPassword)}
              onBlur={pwBlur('new_password')}
              error={pwErr.new_password}
            >
              <PasswordChecklist password={newPassword} />
            </PasswordField>
            <PasswordField
              a11y={passwordForm.fieldA11y('confirm_password')}
              label="Confirm New Password"
              labelClassName={PW_LABEL}
              inputClassName={PW_INPUT}
              value={confirmPassword}
              onChange={pwChange('confirm_password', setConfirmPassword)}
              onBlur={pwBlur('confirm_password')}
              error={pwErr.confirm_password}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingPassword}
              className="btn-interactive bg-amber-500 hover:bg-amber-600 text-white font-bold px-6 py-2.5 rounded-control text-body transition-all shadow-card flex items-center gap-2 border-0 cursor-pointer disabled:opacity-60"
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
