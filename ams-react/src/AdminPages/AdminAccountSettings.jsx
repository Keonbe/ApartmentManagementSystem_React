import React, { useState } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faUserShield, faKey } from '@fortawesome/free-solid-svg-icons';

const AdminAccountSettings = () => {
  const [firstName, setFirstName] = useState('Admin');
  const [lastName, setLastName] = useState('System');
  const [email, setEmail] = useState('admin@system.com');
  const [phone, setPhone] = useState('9171234567');
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

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

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="Account Settings" />

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-4xl mx-auto space-y-8">

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

          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminAccountSettings;
