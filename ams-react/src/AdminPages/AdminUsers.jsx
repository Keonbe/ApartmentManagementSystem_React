import { useState, useEffect, useMemo } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch, faEdit, faKey, faTrash, faTimes, faUserShield, faUser,
  faCheck, faExclamationTriangle,
  faUsers, faFilter
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { LIMITS, checkEmail, checkNewPassword, checkPersonName, checkPhMobile, normalizeEmail, toPhLocal10, toPhE164 } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import PhoneInput from '../Components/PhoneInput';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import PasswordField from '../Components/form/PasswordField';
import PasswordChecklist from '../Components/form/PasswordChecklist';
import { invalidCls } from '../Components/form/formHelpers';

const ROLES = ['all', 'user', 'admin'];
const GENDERS = ['', 'Male', 'Female', 'Other', 'Prefer not to say'];

const EDIT_FIELDS = [
  { label: 'First Name *', key: 'first_name', max: LIMITS.firstName, autoComplete: 'given-name' },
  { label: 'Middle Name', key: 'middle_name', max: LIMITS.middleName, autoComplete: 'additional-name' },
  { label: 'Last Name *', key: 'last_name', max: LIMITS.lastName, autoComplete: 'family-name' },
  { label: 'Suffix', key: 'suffix', max: LIMITS.suffix, autoComplete: 'honorific-suffix' },
  { label: 'Contact No.', key: 'contact_no' },
  { label: 'Email *', key: 'email', max: LIMITS.userEmail, autoComplete: 'email' },
];

// Keys match manage_users.php's `update` body.
const EDIT_VALIDATORS = {
  first_name: (v) => checkPersonName(v, { label: 'First name', max: LIMITS.firstName }),
  middle_name: (v) => checkPersonName(v, { label: 'Middle name', max: LIMITS.middleName, required: false }),
  last_name: (v) => checkPersonName(v, { label: 'Last name', max: LIMITS.lastName }),
  suffix: (v) => checkPersonName(v, { label: 'Suffix', max: LIMITS.suffix, required: false }),
  contact_no: (v) => (String(v ?? '').trim() ? checkPhMobile(v) : ''),
  email: (v) => checkEmail(v, { max: LIMITS.userEmail }),
  gender: (v) => (GENDERS.includes(v ?? '') ? '' : 'Please select a valid gender.'),
};

const RESET_VALIDATORS = { new_password: (v) => checkNewPassword(v) };

const EDIT_INPUT = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 text-slate-800 bg-white';

const RoleBadge = ({ role }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
    <FontAwesomeIcon icon={role === 'admin' ? faUserShield : faUser} className="text-[9px]" />
    {role}
  </span>
);

const emptyEditForm = { first_name: '', middle_name: '', last_name: '', suffix: '', contact_no: '', gender: '', email: '' };

const AdminUsers = () => {
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const [editUser, setEditUser]         = useState(null); // user being edited
  const [editForm, setEditForm]         = useState(emptyEditForm);
  const [showResetModal, setShowResetModal] = useState(null); // user id
  const [newPassword, setNewPassword]   = useState('');
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [statusFilter, setStatusFilter] = useState('active'); // active / archived
  const [saving, setSaving]             = useState(false);
  const [toast, setToast]               = useState(null); // {msg, type}
  const editErrors  = useFieldErrors(EDIT_VALIDATORS, { idPrefix: 'edituser-' });
  const resetErrors = useFieldErrors(RESET_VALIDATORS, { idPrefix: 'resetpw-' });

  const loadUsers = async () => {
    try {
      const res = await api.get('/manage_users.php');
      if (res.data.success) setUsers(res.data.users);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fetchUsers = () => {
    setLoading(true);
    return loadUsers();
  };

  useEffect(() => {
    const load = async () => { await loadUsers(); };
    load();
  }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const filtered = useMemo(() => {
    let list = users.filter(u => statusFilter === 'active' ? !u.is_archived : !!u.is_archived);
    if (roleFilter !== 'all') {
      list = list.filter(u => u.role === roleFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.contact_no || '').includes(q)
      );
    }
    return list;
  }, [users, search, roleFilter, statusFilter]);

  const openEdit = (u) => {
    setEditUser(u);
    setEditForm({
      first_name: u.first_name, middle_name: u.middle_name || '',
      last_name: u.last_name, suffix: u.suffix || '',
      contact_no: toPhLocal10(u.contact_no), gender: u.gender || '', email: u.email
    });
    editErrors.setErrors({});
  };

  const closeReset = () => {
    setShowResetModal(null);
    setNewPassword('');
    resetErrors.setErrors({});
  };

  const changeEdit = (key, value) => {
    setEditForm({ ...editForm, [key]: value });
    editErrors.clearError(key);
  };

  const blurEdit = (key) => {
    const raw = editForm[key];
    const v = key === 'email' ? normalizeEmail(raw) : key === 'contact_no' ? raw : String(raw ?? '').trim();
    const next = { ...editForm, [key]: v };
    if (v !== raw) setEditForm(next);
    editErrors.validateField(key, next);
  };

  const handleSaveEdit = async (e) => {
    e?.preventDefault();
    if (saving) return;
    const clean = {
      ...editForm,
      first_name: editForm.first_name.trim(),
      middle_name: editForm.middle_name.trim(),
      last_name: editForm.last_name.trim(),
      suffix: editForm.suffix.trim(),
      email: normalizeEmail(editForm.email),
    };
    setEditForm(clean);
    if (!editErrors.validateAll(clean)) return;
    setSaving(true);
    try {
      const res = await api.post('/manage_users.php', { action: 'update', user_id: editUser.id, ...clean, contact_no: toPhE164(clean.contact_no) });
      if (res.data.success) {
        await fetchUsers();
        setEditUser(null);
        showToast('User updated successfully.');
      } else if (!editErrors.applyServerErrors(res)) { showToast(res.data.message, 'error'); }
    } catch (err) {
      if (!editErrors.applyServerErrors(err)) showToast(apiErrorMessage(err, 'Failed to save changes.'), 'error');
    }
    finally { setSaving(false); }
  };

  const handleResetPassword = async (e) => {
    e?.preventDefault();
    if (saving) return;
    if (!resetErrors.validateAll({ new_password: newPassword })) return;
    setSaving(true);
    try {
      const res = await api.post('/manage_users.php', { action: 'reset_password', user_id: showResetModal, new_password: newPassword });
      if (res.data.success) {
        closeReset();
        showToast('Password reset successfully.');
      } else if (!resetErrors.applyServerErrors(res)) { showToast(res.data.message, 'error'); }
    } catch (err) {
      if (!resetErrors.applyServerErrors(err)) showToast(apiErrorMessage(err, 'Failed to reset password.'), 'error');
    }
    finally { setSaving(false); }
  };

  const handleSetRole = async (user, newRole) => {
    const verb = newRole === 'admin' ? 'grant admin access to' : 'revoke admin access from';
    if (!window.confirm(`Are you sure you want to ${verb} ${user.first_name} ${user.last_name}? They will be signed out and must sign in again.`)) return;
    try {
      const res = await api.post('/manage_users.php', { action: 'set_role', user_id: user.id, role: newRole });
      if (res.data.success) {
        await fetchUsers();
        showToast(`Role changed to "${newRole}".`);
      } else { showToast(res.data.message, 'error'); }
    } catch (err) { showToast(err?.response?.data?.message || 'Failed to change role.', 'error'); }
  };

  const handleArchive = async () => {
    setSaving(true);
    try {
      const res = await api.post('/manage_users.php', { action: 'delete', user_id: archiveTarget.id });
      if (res.data.success) {
        await fetchUsers();
        setArchiveTarget(null);
        showToast('User account archived.');
      } else { showToast(res.data.message, 'error'); }
    } catch (err) { showToast(err?.response?.data?.message || 'Failed to archive user.', 'error'); }
    finally { setSaving(false); }
  };

  const handleRestore = async (user) => {
    try {
      const res = await api.post('/manage_users.php', { action: 'unarchive', user_id: user.id });
      if (res.data.success) {
        await fetchUsers();
        showToast('User account restored successfully.');
      } else { showToast(res.data.message, 'error'); }
    } catch (err) { showToast(err?.response?.data?.message || 'Failed to restore user.', 'error'); }
  };

  const counts = {
    all: users.length,
    active: users.filter(u => !u.is_archived).length,
    archived: users.filter(u => u.is_archived).length,
    user: users.filter(u => u.role === 'user' && !u.is_archived).length,
    admin: users.filter(u => u.role === 'admin' && !u.is_archived).length
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="User Management" />

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto space-y-6">

            {/* Stats Row */}
            <div className="stagger-children grid grid-cols-3 gap-4">
              {[
                { label: 'Total Accounts', value: counts.all, color: 'bg-indigo-500' },
                { label: 'Regular Users', value: counts.user, color: 'bg-slate-500' },
                { label: 'Admins', value: counts.admin, color: 'bg-violet-500' },
              ].map(s => (
                <div key={s.label} className="card-interactive bg-white rounded-xl shadow-sm border border-slate-200 px-5 py-4 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl ${s.color} flex items-center justify-center`}>
                    <FontAwesomeIcon icon={faUsers} className="text-white text-sm" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-800 m-0 leading-none">{s.value}</p>
                    <p className="text-xs text-slate-400 m-0 mt-0.5">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-3 flex-wrap justify-between">
              <div className="flex items-center gap-3 flex-wrap flex-1">
                <div className="flex items-center gap-2 min-w-[220px] max-w-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                  <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-sm" />
                  <input maxLength={LIMITS.search}
                    type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search by name or email..."
                    className="focus-glow flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none border-0 p-0"
                  />
                </div>

                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
                  <FontAwesomeIcon icon={faFilter} className="text-slate-400 text-xs" />
                  {ROLES.map(r => (
                    <button key={r} onClick={() => setRoleFilter(r)}
                      className={`btn-interactive px-3 py-1 rounded-md text-xs font-semibold border-0 cursor-pointer transition-colors ${roleFilter === r ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100 bg-transparent'}`}>
                      {r === 'all' ? `All` : r === 'admin' ? `Admin` : `User`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status Tabs */}
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1.5 shadow-sm">
                <button onClick={() => setStatusFilter('active')}
                  className={`btn-interactive px-4 py-1.5 rounded-lg text-xs font-bold border-0 cursor-pointer transition-all ${statusFilter === 'active' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 bg-transparent'}`}>
                  Active ({counts.active})
                </button>
                <button onClick={() => setStatusFilter('archived')}
                  className={`btn-interactive px-4 py-1.5 rounded-lg text-xs font-bold border-0 cursor-pointer transition-all ${statusFilter === 'archived' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 bg-transparent'}`}>
                  Archived ({counts.archived})
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden table-scroll-x">
              {loading ? (
                <div className="py-20 text-center text-slate-400 text-sm">Loading users...</div>
              ) : filtered.length === 0 ? (
                <div className="py-20 text-center text-slate-400 text-sm">No users found.</div>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Email</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Contact</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Gender</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="stagger-children divide-y divide-slate-100">
                    {filtered.map(u => (
                      <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${u.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                              {u.first_name.charAt(0)}{u.last_name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 m-0">{u.first_name} {u.middle_name ? u.middle_name.charAt(0) + '. ' : ''}{u.last_name}{u.suffix ? ' ' + u.suffix : ''}</p>
                              <p className="text-[10px] text-slate-400 m-0">ID #{u.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{u.email}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{u.contact_no || '—'}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{u.gender || '—'}</td>
                        <td className="px-4 py-3">
                          <RoleBadge role={u.role} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {u.is_self ? (
                              <span className="text-[10px] font-semibold text-slate-400" title="Your own details and password are managed from Account Settings">
                                You · Account Settings
                              </span>
                            ) : statusFilter === 'active' ? (
                              <>
                                <button onClick={() => openEdit(u)} title="Edit"
                                  className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-indigo-100 hover:text-indigo-600 text-slate-500 flex items-center justify-center border-0 cursor-pointer transition-colors">
                                  <FontAwesomeIcon icon={faEdit} className="text-xs" />
                                </button>
                                <button onClick={() => { setShowResetModal(u.id); setNewPassword(''); }} title="Reset Password"
                                  className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-amber-100 hover:text-amber-600 text-slate-500 flex items-center justify-center border-0 cursor-pointer transition-colors">
                                  <FontAwesomeIcon icon={faKey} className="text-xs" />
                                </button>
                                <button
                                  onClick={() => handleSetRole(u, u.role === 'admin' ? 'user' : 'admin')}
                                  title={u.role === 'admin' ? 'Revoke Admin' : 'Promote to Admin'}
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center border-0 cursor-pointer transition-colors ${u.role === 'admin' ? 'bg-indigo-100 hover:bg-indigo-200 text-indigo-600' : 'bg-slate-100 hover:bg-violet-100 hover:text-violet-600 text-slate-500'}`}>
                                  <FontAwesomeIcon icon={faUserShield} className="text-xs" />
                                </button>
                                {u.role !== 'admin' && (
                                  <button onClick={() => setArchiveTarget(u)} title="Archive User"
                                    className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-amber-50 hover:text-amber-600 text-slate-500 flex items-center justify-center border-0 cursor-pointer transition-colors">
                                    <FontAwesomeIcon icon={faTrash} className="text-xs" />
                                  </button>
                                )}
                              </>
                            ) : (
                              <button onClick={() => handleRestore(u)} title="Restore User"
                                className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors">
                                <FontAwesomeIcon icon={faCheck} className="text-[10px]" /> Restore Account
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-xl text-sm font-semibold transition-all ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
          <FontAwesomeIcon icon={toast.type === 'error' ? faExclamationTriangle : faCheck} />
          {toast.msg}
        </div>
      )}

      {/* Edit Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm modal-overlay-anim" onClick={() => setEditUser(null)}>
          <div className="modal-card-anim bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-800 m-0">Edit User — {editUser.first_name} {editUser.last_name}</h3>
              <button onClick={() => setEditUser(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg border-0 bg-transparent cursor-pointer">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} noValidate>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {EDIT_FIELDS.map(f => {
                  const a11y = editErrors.fieldA11y(f.key);
                  const error = editErrors.errors[f.key];
                  return (
                  <div key={f.key}>
                    <label htmlFor={a11y.id} className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{f.label}</label>
                    {f.key === 'contact_no' ? (
                      <PhoneInput
                        id={a11y.id}
                        name={f.key}
                        value={editForm.contact_no}
                        onChange={digits => changeEdit('contact_no', digits)}
                        onBlur={() => blurEdit('contact_no')}
                        error={error}
                        inputClassName={`w-full px-3 py-2 text-sm border border-slate-200 rounded-r-lg outline-none focus:border-indigo-400 text-slate-800 bg-white${invalidCls(error)}`}
                      />
                    ) : (
                      <>
                        <input
                          {...a11y}
                          type={f.key === 'email' ? 'email' : 'text'}
                          inputMode={f.key === 'email' ? 'email' : undefined}
                          autoComplete="off"
                          maxLength={f.max}
                          value={editForm[f.key]}
                          onChange={e => changeEdit(f.key, e.target.value)}
                          onBlur={() => blurEdit(f.key)}
                          className={EDIT_INPUT + invalidCls(error)}
                        />
                        <FieldError id={a11y.id} error={error} />
                      </>
                    )}
                  </div>
                  );
                })}
              </div>
              <div>
                <label htmlFor="edituser-gender" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Gender</label>
                <select {...editErrors.fieldA11y('gender')} value={editForm.gender} onChange={e => changeEdit('gender', e.target.value)}
                  className={EDIT_INPUT + invalidCls(editErrors.errors.gender)}>
                  {GENDERS.map(g => <option key={g} value={g}>{g || '— Select —'}</option>)}
                </select>
                <FieldError id="edituser-gender" error={editErrors.errors.gender} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button type="button" onClick={() => setEditUser(null)} className="px-4 py-2 text-sm text-slate-600 font-medium border-0 bg-transparent hover:bg-slate-100 rounded-lg cursor-pointer">Cancel</button>
              <button type="submit" disabled={saving}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 border-0 cursor-pointer disabled:opacity-40">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm modal-overlay-anim" onClick={closeReset}>
          <form className="modal-card-anim bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()} onSubmit={handleResetPassword} noValidate>
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-800 m-0 flex items-center gap-2">
                <FontAwesomeIcon icon={faKey} className="text-amber-500" /> Reset Password
              </h3>
              <button type="button" onClick={closeReset} aria-label="Close" className="text-slate-400 hover:text-slate-600 p-1 rounded-lg border-0 bg-transparent cursor-pointer">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-xs text-slate-500 m-0">Enter a new password for this account. The user will need to use this password on their next login.</p>
              <PasswordField
                a11y={resetErrors.fieldA11y('new_password')}
                label="New Password"
                labelClassName="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide"
                inputClassName="w-full px-3 py-2 pr-10 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 text-slate-800 bg-white"
                placeholder="Enter new password"
                value={newPassword}
                onChange={e => { setNewPassword(e.target.value); resetErrors.clearError('new_password'); }}
                onBlur={() => newPassword && resetErrors.validateField('new_password', { new_password: newPassword })}
                error={resetErrors.errors.new_password}
              >
                <PasswordChecklist password={newPassword} />
              </PasswordField>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button type="button" onClick={closeReset} className="px-4 py-2 text-sm text-slate-600 font-medium border-0 bg-transparent hover:bg-slate-100 rounded-lg cursor-pointer">Cancel</button>
              <button type="submit" disabled={saving}
                className="px-5 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 border-0 cursor-pointer disabled:opacity-40">
                {saving ? 'Saving...' : 'Reset Password'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Archive Confirm Modal */}
      {archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm modal-overlay-anim" onClick={() => setArchiveTarget(null)}>
          <div className="modal-card-anim bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-amber-700 m-0 flex items-center gap-2">
                <FontAwesomeIcon icon={faExclamationTriangle} /> Archive User
              </h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 m-0">Are you sure you want to archive <strong>{archiveTarget.first_name} {archiveTarget.last_name}</strong>? This user will no longer be able to log in.</p>
              <div className="mt-4 bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-700">
                You can restore this account at any time from the "Archived" tab.
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setArchiveTarget(null)} className="px-4 py-2 text-sm text-slate-600 font-medium border-0 bg-transparent hover:bg-slate-100 rounded-lg cursor-pointer">Cancel</button>
              <button onClick={handleArchive} disabled={saving}
                className="px-5 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 border-0 cursor-pointer disabled:opacity-40">
                {saving ? 'Archiving...' : 'Archive User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
