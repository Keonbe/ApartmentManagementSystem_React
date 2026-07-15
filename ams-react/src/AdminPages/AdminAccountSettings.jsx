import React, { useState, useEffect } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faUserShield, faKey, faCogs, faFileContract, faWrench, faExclamationTriangle, faCheckCircle, faBuilding, faDollarSign, faCalendarAlt, faInfoCircle, faShieldAlt } from '@fortawesome/free-solid-svg-icons';
import { getSystemSettings, saveSystemSettings } from '../config/systemSettings';

const AdminAccountSettings = () => {
  const [firstName, setFirstName] = useState('Admin');
  const [lastName, setLastName] = useState('System');
  const [email, setEmail] = useState('admin@system.com');
  const [phone, setPhone] = useState('9171234567');
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // System Configuration State
  const [settings, setSettings] = useState(getSystemSettings());
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    setSettings(getSystemSettings());
  }, []);

  const handleProfileSubmit = (e) => {
    e.preventDefault();
    alert('Admin profile updated successfully (Mock).');
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      alert("New passwords do not match.");
      return;
    }
    alert('Admin password updated successfully (Mock).');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSettingsSave = (e) => {
    e.preventDefault();
    saveSystemSettings(settings);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 3000);
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
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                        required
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-lg text-sm transition-all shadow-sm flex items-center gap-2 border-0 cursor-pointer"
                    >
                      <FontAwesomeIcon icon={faSave} />
                      Save Changes
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
                      className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-6 py-2.5 rounded-lg text-sm transition-all shadow-sm flex items-center gap-2 border-0 cursor-pointer"
                    >
                      <FontAwesomeIcon icon={faSave} />
                      Update Password
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
                <form onSubmit={handleSettingsSave} className="space-y-8">

                  {/* Success Banner */}
                  {settingsSaved && (
                    <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-sm font-semibold animate-pulse">
                      <FontAwesomeIcon icon={faCheckCircle} className="text-emerald-600" />
                      System settings saved successfully. Changes will apply across all admin modules.
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

                  {/* Save Button */}
                  <div className="pt-4 flex items-center justify-between border-t border-slate-100">
                    <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faInfoCircle} className="text-slate-300" />
                      Settings are saved to browser storage and persist across sessions.
                    </span>
                    <button
                      type="submit"
                      className="bg-violet-600 hover:bg-violet-700 text-white font-bold px-8 py-2.5 rounded-lg text-sm transition-all shadow-sm flex items-center gap-2 border-0 cursor-pointer"
                    >
                      <FontAwesomeIcon icon={faSave} />
                      Save System Settings
                    </button>
                  </div>
                </form>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminAccountSettings;
