import React, { useState, useEffect } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faUserShield, faKey, faCogs, faFileContract, faWrench, faExclamationTriangle, faCheckCircle, faBuilding, faDollarSign, faCalendarAlt, faInfoCircle, faShieldAlt, faCreditCard, faLock, faSpinner, faTimes, faCheck, faCar, faUsers, faImage } from '@fortawesome/free-solid-svg-icons';
import { getSystemSettings, saveSystemSettings } from '../config/systemSettings';
import api from '../api/axiosConfig';

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

  // System Configuration State
  const [settings, setSettings] = useState(null);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [toast, setToast] = useState(null);

  // Load settings from backend on mount
  useEffect(() => {
    const loadSettings = async () => {
      const data = await getSystemSettings();
      setSettings(data);
    };
    loadSettings();

    const loadProfile = async () => {
      try {
        const res = await api.get('profile.php');
        if (res.data.success && res.data.data) {
          const p = res.data.data;
          setFirstName(p.first_name || '');
          setLastName(p.last_name || '');
          setPhone(p.contact_no || '');
          setProfileExtras({ middle_name: p.middle_name || '', suffix: p.suffix || '', gender: p.gender || '' });
        }
      } catch (err) {
        console.error('Failed to load admin profile:', err);
      }
    };
    loadProfile();
  }, []);

  const showToast = (type, title, message) => {
    setToast({ type, title, message });
    setTimeout(() => setToast(null), 4500);
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await api.post('profile.php', {
        firstName, lastName, email, contactNo: phone,
        middleName: profileExtras.middle_name, suffix: profileExtras.suffix, gender: profileExtras.gender
      });
      if (!res.data.success) throw new Error(res.data.message);
      // Keep the header and guards showing the new name/email without a re-login.
      const store = sessionStorage.getItem('loggedInUser') ? sessionStorage : localStorage;
      store.setItem('loggedInUser', JSON.stringify({ ...storedUser, first_name: firstName, last_name: lastName, email_address: email }));
      showToast('success', 'Profile Updated', 'Your administrator details have been saved.');
    } catch (err) {
      showToast('error', 'Profile Not Saved', err?.response?.data?.message || err.message || 'Failed to save your profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  // Calls the real endpoint. This form used to show "Password Changed" without sending anything.
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast('error', 'Password Mismatch', 'New passwords do not match. Please verify and try again.');
      return;
    }
    if (newPassword.length < 8) {
      showToast('error', 'Password Too Short', 'Use at least 8 characters.');
      return;
    }
    setSavingPassword(true);
    try {
      const res = await api.post('change_password.php', {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword
      });
      if (!res.data.success) throw new Error(res.data.message);
      const ended = res.data.sessions_ended || 0;
      showToast('success', 'Password Changed', `Your password has been updated.${ended ? ` ${ended} other session(s) were signed out.` : ''}`);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      showToast('error', 'Password Not Changed', err?.response?.data?.message || err.message || 'Failed to change password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSettingsSave = async (e) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setSaveError(null);
    try {
      await saveSystemSettings(settings);
      setSettingsSaved(true);
      setToast({
        type: 'success',
        title: 'System Settings Saved',
        message: 'System policies, thresholds, and PayMongo credentials updated and synced across all modules.'
      });
      setTimeout(() => setSettingsSaved(false), 4000);
      setTimeout(() => setToast(null), 4500);
    } catch (error) {
      console.error('Failed to save settings:', error);
      const errMsg = error?.response?.data?.message || error?.message || 'Failed to save system settings. Please try again.';
      setSaveError(errMsg);
      setToast({
        type: 'error',
        title: 'Save Failed',
        message: errMsg
      });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const formatCurrency = (n) => `₱${Number(n).toLocaleString()}`;

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="Account Settings" />

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-4xl mx-auto space-y-8">

            {/* ─── Administrator Profile ─── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg shrink-0">
                  <FontAwesomeIcon icon={faUserShield} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800 m-0">Administrator Profile</h2>
                  <p className="text-xs text-slate-500 m-0 mt-0.5">Update your system admin credentials and personal details.</p>
                </div>
              </div>
              
              <div className="p-6">
                <form onSubmit={handleProfileSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-sm font-bold text-slate-700">First Name</label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                        required
                      />
                    </div>
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-sm font-bold text-slate-700">Last Name</label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-sm font-bold text-slate-700">Email Address</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                        required
                      />
                    </div>
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-sm font-bold text-slate-700">Contact Number</label>
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="09123456789"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-lg text-sm transition-all shadow-sm flex items-center gap-2 border-0 cursor-pointer disabled:opacity-60"
                    >
                      <FontAwesomeIcon icon={savingProfile ? faSpinner : faSave} className={savingProfile ? 'animate-spin' : ''} />
                      {savingProfile ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* ─── Security & Password ─── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-lg shrink-0">
                  <FontAwesomeIcon icon={faKey} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800 m-0">Security & Password</h2>
                  <p className="text-xs text-slate-500 m-0 mt-0.5">Ensure your account uses a long, random password to stay secure.</p>
                </div>
              </div>

              <div className="p-6">
                <form onSubmit={handlePasswordSubmit} className="space-y-5">
                  <div className="flex flex-col space-y-1.5 max-w-md">
                    <label className="text-sm font-bold text-slate-700">Current Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-inner text-sm"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-sm font-bold text-slate-700">New Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-inner text-sm"
                        required
                      />
                    </div>
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-sm font-bold text-slate-700">Confirm New Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-inner text-sm"
                        required
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={savingPassword}
                      className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-6 py-2.5 rounded-lg text-sm transition-all shadow-sm flex items-center gap-2 border-0 cursor-pointer disabled:opacity-60"
                    >
                      <FontAwesomeIcon icon={savingPassword ? faSpinner : faSave} className={savingPassword ? 'animate-spin' : ''} />
                      {savingPassword ? 'Updating…' : 'Update Password'}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* ─── System Configuration ─── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center text-lg shrink-0">
                  <FontAwesomeIcon icon={faCogs} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800 m-0">System Configuration</h2>
                  <p className="text-xs text-slate-500 m-0 mt-0.5">Configure lease policies, payment thresholds, maintenance budgets, and terms of service.</p>
                </div>
              </div>

              <div className="p-6">
                {!settings ? <div className="text-center py-4 text-slate-500">Loading settings...</div> : (
                <form onSubmit={handleSettingsSave} className="space-y-8">

                  {/* Success Banner */}
                  {settingsSaved && (
                    <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-sm font-semibold transition-all">
                      <div className="flex items-center gap-2.5">
                        <FontAwesomeIcon icon={faCheckCircle} className="text-emerald-600 text-base" />
                        <span>System settings saved successfully. Changes are synchronized across all modules.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSettingsSaved(false)}
                        className="text-emerald-600 hover:text-emerald-800 bg-transparent border-0 cursor-pointer text-xs"
                      >
                        <FontAwesomeIcon icon={faTimes} />
                      </button>
                    </div>
                  )}

                  {/* Error Banner */}
                  {saveError && (
                    <div className="flex items-center justify-between gap-3 bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl text-sm font-semibold transition-all">
                      <div className="flex items-center gap-2.5">
                        <FontAwesomeIcon icon={faExclamationTriangle} className="text-rose-600 text-base" />
                        <span>{saveError}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSaveError(null)}
                        className="text-rose-600 hover:text-rose-800 bg-transparent border-0 cursor-pointer text-xs"
                      >
                        <FontAwesomeIcon icon={faTimes} />
                      </button>
                    </div>
                  )}

                  {/* Lease Policy Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <FontAwesomeIcon icon={faFileContract} className="text-indigo-500 text-sm" />
                      <h3 className="text-sm font-bold text-slate-700 m-0">Lease Policy</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="flex flex-col space-y-1.5">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <FontAwesomeIcon icon={faCalendarAlt} className="text-slate-400 text-xs" />
                          Minimum Lease Duration
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            min="1"
                            max="24"
                            value={settings.minLeaseDuration}
                            onChange={(e) => updateSetting('minLeaseDuration', Number(e.target.value))}
                            className="w-24 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm text-center font-bold"
                          />
                          <span className="text-sm text-slate-500">months</span>
                        </div>
                        <p className="text-[11px] text-slate-400 m-0">Tenants cannot sign leases shorter than this duration.</p>
                      </div>

                      <div className="flex flex-col space-y-1.5">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <FontAwesomeIcon icon={faCalendarAlt} className="text-slate-400 text-xs" />
                          Reservation Hold Period
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            min="1"
                            max="90"
                            value={settings.reservationHoldDays}
                            onChange={(e) => updateSetting('reservationHoldDays', Number(e.target.value))}
                            className="w-24 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm text-center font-bold"
                          />
                          <span className="text-sm text-slate-500">days</span>
                        </div>
                        <p className="text-[11px] text-slate-400 m-0">Default number of days a reserved unit is held before the hold expires and the unit is released.</p>
                      </div>

                      <div className="flex flex-col space-y-1.5">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <FontAwesomeIcon icon={faUsers} className="text-slate-400 text-xs" />
                          Maximum Occupants per Unit
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={settings.maxOccupantsPerUnit}
                            onChange={(e) => updateSetting('maxOccupantsPerUnit', Number(e.target.value))}
                            className="w-24 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm text-center font-bold"
                          />
                          <span className="text-sm text-slate-500">people</span>
                        </div>
                        <p className="text-[11px] text-slate-400 m-0">Lease holder plus household members. Applications and occupant requests above this are refused.</p>
                      </div>

                      <div className="flex flex-col space-y-1.5">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <FontAwesomeIcon icon={faImage} className="text-slate-400 text-xs" />
                          Public Room Preview
                        </label>
                        <select
                          value={settings.roomPreviewMode}
                          onChange={(e) => updateSetting('roomPreviewMode', e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm font-semibold"
                        >
                          <option value="images">Room images</option>
                          <option value="floor_plan">2D floor plan</option>
                        </select>
                        <p className="text-[11px] text-slate-400 m-0">What visitors see when they preview a unit on the public page.</p>
                      </div>
                    </div>
                  </div>

                  {/* Parking Policy Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <FontAwesomeIcon icon={faCar} className="text-indigo-500 text-sm" />
                      <h3 className="text-sm font-bold text-slate-700 m-0">Parking Policy</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="flex flex-col space-y-1.5">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <FontAwesomeIcon icon={faCar} className="text-slate-400 text-xs" />
                          Max Parking Slots
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            min="1"
                            max="500"
                            value={settings.maxParkingSlots}
                            onChange={(e) => updateSetting('maxParkingSlots', Number(e.target.value))}
                            className="w-24 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm text-center font-bold"
                          />
                          <span className="text-sm text-slate-500">slots</span>
                        </div>
                        <p className="text-[11px] text-slate-400 m-0">Numbered slots #1 to #N. Only assigned slots count; new requests are refused once every slot is assigned. Can't go below the highest slot still assigned.</p>
                      </div>

                      <div className="flex flex-col space-y-1.5">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <FontAwesomeIcon icon={faCar} className="text-slate-400 text-xs" />
                          Monthly Parking Fee
                        </label>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-slate-500">₱</span>
                          <input
                            type="number"
                            min="1"
                            step="50"
                            value={settings.parkingMonthlyFee}
                            onChange={(e) => updateSetting('parkingMonthlyFee', Number(e.target.value))}
                            className="w-28 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm text-center font-bold"
                          />
                          <span className="text-sm text-slate-500">per slot / month</span>
                        </div>
                        <p className="text-[11px] text-slate-400 m-0">Added to the tenant's invoice for each month of the permit term.</p>
                      </div>

                      <div className="flex flex-col space-y-1.5">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <FontAwesomeIcon icon={faCar} className="text-slate-400 text-xs" />
                          Parking Fee Billing
                        </label>
                        <div className="flex gap-2">
                          {[
                            { value: 'manual', label: 'Manual' },
                            { value: 'auto', label: 'Automatic' },
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => updateSetting('parkingBillingMode', opt.value)}
                              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors duration-200 cursor-pointer ${
                                settings.parkingBillingMode === opt.value
                                  ? 'bg-indigo-500 border-indigo-500 text-white'
                                  : 'bg-slate-50 border-slate-200 text-slate-500'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        <p className="text-[11px] text-slate-400 m-0">
                          Manual: bill each month with "Bill this month" on the Parking page. Automatic: the fee is added when a slot is assigned and on each following month by the daily sweep. A month is never billed twice either way.
                        </p>
                      </div>

                      <div className="flex flex-col space-y-1.5">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <FontAwesomeIcon icon={faCar} className="text-slate-400 text-xs" />
                          Allowed Vehicle Types
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { value: 'motorcycle', label: 'Motorcycle' },
                            { value: 'sedan', label: 'Sedan' },
                            { value: 'suv', label: 'SUV' },
                            { value: 'pickup', label: 'Pickup Truck' },
                            { value: 'van', label: 'Van' },
                            { value: 'ebike', label: 'E-Bike' },
                          ].map((vt) => {
                            const isChecked = settings.parkingAllowedVehicleTypes.includes(vt.value);
                            return (
                              <button
                                key={vt.value}
                                type="button"
                                onClick={() => {
                                  const current = settings.parkingAllowedVehicleTypes;
                                  const next = isChecked
                                    ? current.filter((t) => t !== vt.value)
                                    : [...current, vt.value];
                                  updateSetting('parkingAllowedVehicleTypes', next);
                                }}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors duration-200 cursor-pointer ${
                                  isChecked
                                    ? 'bg-indigo-500 border-indigo-500 text-white'
                                    : 'bg-slate-50 border-slate-200 text-slate-500'
                                }`}
                              >
                                {isChecked && <FontAwesomeIcon icon={faCheck} className="mr-1.5 text-[10px]" />}
                                {vt.label}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[11px] text-slate-400 m-0">Only selected vehicle types can be submitted in a parking reservation request.</p>
                      </div>
                    </div>
                  </div>

                  {/* Lease Contract / Landlord Details Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <FontAwesomeIcon icon={faFileContract} className="text-indigo-500 text-sm" />
                      <h3 className="text-sm font-bold text-slate-700 m-0">Lease Contract Details</h3>
                    </div>
                    <p className="text-[11px] text-slate-400 m-0 -mt-2">These appear as the Owner / Lessor on every generated lease contract.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="flex flex-col space-y-1.5">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <FontAwesomeIcon icon={faUserShield} className="text-slate-400 text-xs" />
                          Owner / Landlord Name
                        </label>
                        <input
                          type="text"
                          value={settings.landlordName}
                          onChange={(e) => updateSetting('landlordName', e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                        />
                      </div>

                      <div className="flex flex-col space-y-1.5">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <FontAwesomeIcon icon={faUserShield} className="text-slate-400 text-xs" />
                          Owner's Address
                        </label>
                        <input
                          type="text"
                          value={settings.landlordAddress}
                          onChange={(e) => updateSetting('landlordAddress', e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                        />
                      </div>

                      <div className="flex flex-col space-y-1.5">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <FontAwesomeIcon icon={faBuilding} className="text-slate-400 text-xs" />
                          Apartment / Property Address
                        </label>
                        <input
                          type="text"
                          value={settings.propertyAddress}
                          onChange={(e) => updateSetting('propertyAddress', e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                        />
                        <p className="text-[11px] text-slate-400 m-0">The building's location, shown under "Description of the Apartment".</p>
                      </div>

                      <div className="flex flex-col space-y-1.5">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <FontAwesomeIcon icon={faInfoCircle} className="text-slate-400 text-xs" />
                          Owner Contact Number
                        </label>
                        <input
                          type="text"
                          value={settings.landlordContact}
                          onChange={(e) => updateSetting('landlordContact', e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                        />
                        <p className="text-[11px] text-slate-400 m-0">Shown on the contract exactly as entered — mask it if it should not be public.</p>
                      </div>
                    </div>
                  </div>

                  {/* Payment & Eviction Policy Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500 text-sm" />
                      <h3 className="text-sm font-bold text-slate-700 m-0">Payment & Eviction Policy</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="flex flex-col space-y-1.5">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <FontAwesomeIcon icon={faDollarSign} className="text-slate-400 text-xs" />
                          Overdue Payment Threshold
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            min="1"
                            max="365"
                            value={settings.overdueThresholdDays}
                            onChange={(e) => updateSetting('overdueThresholdDays', Number(e.target.value))}
                            className="w-24 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500 shadow-inner text-sm text-center font-bold"
                          />
                          <span className="text-sm text-slate-500">days overdue</span>
                        </div>
                        <p className="text-[11px] text-slate-400 m-0">Tenants exceeding this threshold will be flagged for eviction review.</p>
                      </div>

                      <div className="flex flex-col space-y-1.5">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <FontAwesomeIcon icon={faShieldAlt} className="text-slate-400 text-xs" />
                          Auto-Flag for Eviction
                        </label>
                        <div className="flex items-center gap-3 mt-1">
                          <button
                            type="button"
                            onClick={() => updateSetting('autoFlagEviction', !settings.autoFlagEviction)}
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 border-0 cursor-pointer ${
                              settings.autoFlagEviction ? 'bg-red-500' : 'bg-slate-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${
                                settings.autoFlagEviction ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                          <span className={`text-sm font-semibold ${settings.autoFlagEviction ? 'text-red-600' : 'text-slate-400'}`}>
                            {settings.autoFlagEviction ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 m-0">Automatically flag contracts when threshold is exceeded.</p>
                      </div>
                    </div>

                    {/* Current Policy Summary */}
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3">
                      <FontAwesomeIcon icon={faInfoCircle} className="text-red-400 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-red-800 m-0">Active Eviction Policy</p>
                        <p className="text-[11px] text-red-600 m-0 mt-1">
                          Tenants with overdue payments exceeding <strong>{settings.overdueThresholdDays} days</strong> will be 
                          {settings.autoFlagEviction 
                            ? ' automatically flagged for eviction review on the Contracts page.' 
                            : ' shown as at-risk but will NOT be auto-flagged. Manual action required.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Payment Channels Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <FontAwesomeIcon icon={faCreditCard} className="text-indigo-500 text-sm" />
                      <h3 className="text-sm font-bold text-slate-700 m-0">Payment Channels & Gateway Settings</h3>
                    </div>

                    {/* Mode Selection */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                      <label className="text-xs font-bold text-slate-700 block uppercase tracking-wider">
                        Operating Payment Mode
                      </label>
                      <div className="flex flex-wrap items-center gap-5 pt-1">
                        {[
                          { value: 'manual', label: 'Manual Only (Proof Upload / In-Person)' },
                          { value: 'sandbox', label: 'Sandbox Only (PayMongo Test Mode)' },
                        ].map(mode => (
                          <label key={mode.value} className="flex items-center gap-2 text-sm text-slate-700 font-medium cursor-pointer">
                            <input
                              type="radio"
                              name="paymentMode"
                              value={mode.value}
                              checked={settings.paymentMode === mode.value}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateSetting('paymentMode', val);
                                if (val === 'sandbox') {
                                  updateSetting('paymentSandboxEnabled', true);
                                }
                              }}
                              className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span>{mode.label}</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-400 m-0">Controls which channel types are surfaced to tenants during checkout.</p>
                    </div>

                    {/* Channel Groups */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Manual / Offline Channels */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Manual & In-Person Channels</span>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-semibold">Offline / Verification</span>
                        </div>
                        <div className="space-y-2">
                          <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                            <span className="text-xs font-medium text-slate-700">GCash (Receipt Upload)</span>
                            <input
                              type="checkbox"
                              checked={!!settings.paymentChGcashManual}
                              onChange={(e) => updateSetting('paymentChGcashManual', e.target.checked)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-4 w-4"
                            />
                          </label>
                          <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                            <span className="text-xs font-medium text-slate-700">Bank Transfer (Receipt Upload)</span>
                            <input
                              type="checkbox"
                              checked={!!settings.paymentChBankManual}
                              onChange={(e) => updateSetting('paymentChBankManual', e.target.checked)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-4 w-4"
                            />
                          </label>
                          <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                            <div>
                              <span className="text-xs font-medium text-slate-700 block">In-Person Payment</span>
                              <span className="text-[10px] text-slate-400">Scheduled management office visit</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={!!settings.paymentChInPerson}
                              onChange={(e) => updateSetting('paymentChInPerson', e.target.checked)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-4 w-4"
                            />
                          </label>
                        </div>
                      </div>

                      {/* Sandbox / Digital Channels */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Sandbox Channels (PayMongo)</span>
                          <label className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!settings.paymentSandboxEnabled}
                              onChange={(e) => updateSetting('paymentSandboxEnabled', e.target.checked)}
                              className="cursor-pointer"
                            />
                            Master Active
                          </label>
                        </div>
                        <div className="space-y-2">
                          <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                            <span className="text-xs font-medium text-slate-700">GCash Sandbox</span>
                            <input
                              type="checkbox"
                              checked={!!settings.paymentChGcashSandbox}
                              onChange={(e) => updateSetting('paymentChGcashSandbox', e.target.checked)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-4 w-4"
                            />
                          </label>
                          <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                            <span className="text-xs font-medium text-slate-700">Bank Transfer Sandbox</span>
                            <input
                              type="checkbox"
                              checked={!!settings.paymentChBankSandbox}
                              onChange={(e) => updateSetting('paymentChBankSandbox', e.target.checked)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-4 w-4"
                            />
                          </label>
                          <label className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                            <span className="text-xs font-medium text-slate-700">Maya Sandbox</span>
                            <input
                              type="checkbox"
                              checked={!!settings.paymentChMaya}
                              onChange={(e) => updateSetting('paymentChMaya', e.target.checked)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-4 w-4"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Payment Gateway Integration Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <FontAwesomeIcon icon={faCreditCard} className="text-blue-500 text-sm" />
                      <h3 className="text-sm font-bold text-slate-700 m-0">Payment Gateway Integration (PayMongo)</h3>
                    </div>
                    <div className="grid grid-cols-1 gap-5">
                      <div className="flex flex-col space-y-1.5">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <FontAwesomeIcon icon={faShieldAlt} className="text-slate-400 text-xs" />
                          Environment Mode
                        </label>
                        <div className="flex items-center gap-6 mt-1">
                          <label className="flex items-center gap-2 cursor-pointer opacity-50" title="Live mode is currently locked by system administrator.">
                            <input
                              type="radio"
                              name="paymongoEnv"
                              value="live"
                              checked={false}
                              disabled={true}
                              className="text-slate-400 focus:ring-slate-400 cursor-not-allowed"
                            />
                            <span>Live (Production) <FontAwesomeIcon icon={faLock} className="text-[10px] ml-1" /></span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="paymongoEnv"
                              value="sandbox"
                              checked={true}
                              readOnly
                              className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span>Sandbox (Testing)</span>
                          </label>
                        </div>
                        <p className="text-[11px] text-slate-400 m-0 mt-1">Live configuration is locked. All transactions will be processed in Sandbox Mode.</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-2">
                        <div className="flex flex-col space-y-1.5">
                          <label className="text-sm font-bold text-slate-700">Sandbox Secret Key</label>
                          <input
                            type="password"
                            value={settings.paymongoSecretKey || ''}
                            onChange={(e) => updateSetting('paymongoSecretKey', e.target.value)}
                            placeholder="sk_test_..."
                            className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm font-mono"
                          />
                        </div>
                        <div className="flex flex-col space-y-1.5">
                          <label className="text-sm font-bold text-slate-700">Sandbox Public Key</label>
                          <input
                            type="text"
                            value={settings.paymongoPublicKey || ''}
                            onChange={(e) => updateSetting('paymongoPublicKey', e.target.value)}
                            placeholder="pk_test_..."
                            className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm font-mono"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col space-y-1.5">
                        <label className="text-sm font-bold text-slate-700">Webhook Secret Key</label>
                        <input
                          type="password"
                          value={settings.paymongoWebhookSecret || ''}
                          onChange={(e) => updateSetting('paymongoWebhookSecret', e.target.value)}
                          placeholder="whsk_..."
                          className="w-full md:w-1/2 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm font-mono"
                        />
                        <p className="text-[11px] text-slate-400 m-0 mt-1">Required for signature verification. Obtain this from the PayMongo Webhooks dashboard.</p>
                      </div>
                    </div>
                  </div>

                  {/* Maintenance Budget Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <FontAwesomeIcon icon={faWrench} className="text-amber-500 text-sm" />
                      <h3 className="text-sm font-bold text-slate-700 m-0">Maintenance Budget</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="flex flex-col space-y-1.5">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <FontAwesomeIcon icon={faBuilding} className="text-slate-400 text-xs" />
                          Monthly Budget Allocation
                        </label>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-slate-500">₱</span>
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            value={settings.maintenanceMonthlyBudget}
                            onChange={(e) => updateSetting('maintenanceMonthlyBudget', Number(e.target.value))}
                            className="w-40 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-inner text-sm font-bold"
                          />
                          <span className="text-sm text-slate-500">/ month</span>
                        </div>
                        <p className="text-[11px] text-slate-400 m-0">Budget used for maintenance cost comparison reports and over-budget alerts.</p>
                      </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-start gap-3">
                      <FontAwesomeIcon icon={faInfoCircle} className="text-amber-400 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-amber-800 m-0">Budget Summary</p>
                        <p className="text-[11px] text-amber-600 m-0 mt-1">
                          Monthly allocation: <strong>{formatCurrency(settings.maintenanceMonthlyBudget)}</strong> · 
                          Annual projection: <strong>{formatCurrency(settings.maintenanceMonthlyBudget * 12)}</strong>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Terms & Conditions Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <FontAwesomeIcon icon={faFileContract} className="text-violet-500 text-sm" />
                      <h3 className="text-sm font-bold text-slate-700 m-0">Terms & Conditions — Tenant Responsibility</h3>
                    </div>
                    <div>
                      <label className="text-sm font-bold text-slate-700 block mb-2">Maintenance Responsibility Clause</label>
                      <textarea
                        value={settings.tenantResponsibilityClause}
                        onChange={(e) => updateSetting('tenantResponsibilityClause', e.target.value)}
                        rows={4}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500 shadow-inner text-sm resize-y leading-relaxed"
                      />
                      <p className="text-[11px] text-slate-400 m-0 mt-1.5">
                        This clause is referenced when flagging maintenance requests as "Tenant Responsible." 
                        It defines which repairs are chargeable to the tenant.
                      </p>
                    </div>
                  </div>

                  {/* Save Button & Feedback */}
                  <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                        <FontAwesomeIcon icon={faInfoCircle} className="text-slate-300" />
                        Settings are securely synced to database & system configuration.
                      </span>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                      {settingsSaved && (
                        <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5 animate-fadeIn">
                          <FontAwesomeIcon icon={faCheck} className="text-emerald-500" />
                          Saved to database
                        </span>
                      )}
                      
                      <button
                        type="submit"
                        disabled={isSavingSettings}
                        className={`w-full sm:w-auto font-bold px-7 py-2.5 rounded-xl text-sm transition-all duration-200 shadow-md flex items-center justify-center gap-2 border-0 cursor-pointer ${
                          settingsSaved
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : isSavingSettings
                            ? 'bg-violet-400 text-white cursor-not-allowed opacity-90'
                            : 'bg-violet-600 hover:bg-violet-700 hover:shadow-lg active:scale-98 text-white'
                        }`}
                      >
                        {isSavingSettings ? (
                          <>
                            <FontAwesomeIcon icon={faSpinner} className="animate-spin text-sm" />
                            <span>Saving Settings...</span>
                          </>
                        ) : settingsSaved ? (
                          <>
                            <FontAwesomeIcon icon={faCheckCircle} className="text-sm" />
                            <span>Settings Saved!</span>
                          </>
                        ) : (
                          <>
                            <FontAwesomeIcon icon={faSave} className="text-sm" />
                            <span>Save System Settings</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Floating Toast Notification */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 max-w-sm w-[calc(100vw-3rem)] sm:w-96 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/80 p-4 transition-all duration-300 transform translate-y-0 opacity-100 flex items-start gap-3.5 animate-fadeIn">
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
