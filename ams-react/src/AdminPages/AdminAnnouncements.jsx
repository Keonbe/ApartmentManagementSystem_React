import { useState, useEffect, useMemo } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSave, faMobileAlt, faEnvelope, faDesktop, faCalendarAlt, faUsers, faPaperPlane, faSpinner, faLock,
} from '@fortawesome/free-solid-svg-icons';

import api from '../api/axiosConfig';

const channelIcons = { 'in-app': faDesktop, 'sms': faMobileAlt, 'email': faEnvelope };
const statusConfig = {
  sent: { label: 'Sent', color: 'bg-emerald-100 text-emerald-700' },
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-700' },
  draft: { label: 'Draft', color: 'bg-slate-100 text-slate-600' },
};
const tagStyleMap = { Urgent: 'bg-red-100 text-red-800', Reminder: 'bg-blue-100 text-blue-800', General: 'bg-slate-100 text-slate-600' };
// Tenancies create_announcement.php counts as current.
const CURRENT_STATUSES = ['active', 'Approved', 'pending-move-out'];
const EMPTY_FORM = { sendTo: 'All tenants', unit: '', type: 'General', title: '', body: '', channels: ['in-app'] };

const INPUT = 'focus-glow w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-indigo-500 transition-all';
const LABEL = 'block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1';

const AdminAnnouncements = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [sending, setSending] = useState(null); // 'send' | 'draft' | null
  const [notice, setNotice] = useState(null);   // { ok, text }

  const fetchTenants = async () => {
    try {
      const res = await api.get('/get_tenants.php');
      if (res.data.success) setTenants(res.data.data.filter(t => CURRENT_STATUSES.includes(t.status)));
    } catch (err) {
      console.error('Error fetching tenants:', err);
    }
  };

  const fetchAnnouncements = async () => {
    try {
      const response = await api.get('get_announcements.php');
      if (response.data.success) {
        setAnnouncements(response.data.announcements.map(ann => ({
          ...ann,
          status: statusConfig[ann.status] ? ann.status : 'sent',
          // Older rows stored "Email"; the API may also hand back a JSON string.
          channels: (Array.isArray(ann.channels) ? ann.channels : (() => {
            try { return JSON.parse(ann.channels || '[]'); } catch { return []; }
          })()).map(c => String(c).toLowerCase()).filter(c => channelIcons[c]),
          tagStyle: tagStyleMap[ann.tag] || tagStyleMap.General,
          date: new Date(ann.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          recipients: ann.recipient_count || 0,
        })));
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    const load = async () => { await Promise.all([fetchAnnouncements(), fetchTenants()]); };
    load();
  }, []);

  // Units that have a current tenant, with how many tenants each.
  const units = useMemo(() => {
    const counts = {};
    tenants.forEach(t => { if (t.unit) counts[t.unit] = (counts[t.unit] || 0) + 1; });
    return Object.keys(counts)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map(name => ({ name, count: counts[name] }));
  }, [tenants]);

  const specific = form.sendTo === 'Specific unit';
  const recipientCount = specific
    ? (units.find(u => u.name === form.unit)?.count || 0)
    : tenants.length;

  const handleSend = async (draft) => {
    setNotice(null);
    if (!form.title.trim() || !form.body.trim()) {
      setNotice({ ok: false, text: 'Title and message are required.' });
      return;
    }
    if (specific && !form.unit) {
      setNotice({ ok: false, text: 'Choose the unit to send this announcement to.' });
      return;
    }
    setSending(draft ? 'draft' : 'send');
    try {
      const response = await api.post('create_announcement.php', {
        tag: form.type,
        title: form.title.trim(),
        body: form.body.trim(),
        sendTo: form.sendTo,
        unit: specific ? form.unit : '',
        channels: form.channels,
        draft,
      });
      setNotice({ ok: !!response.data.success, text: response.data.message || (response.data.success ? 'Done.' : 'Failed.') });
      if (response.data.success) {
        setForm(EMPTY_FORM);
        fetchAnnouncements();
      }
    } catch (err) {
      setNotice({ ok: false, text: err?.response?.data?.message || 'Could not send the announcement.' });
    } finally {
      setSending(null);
    }
  };

  // In-app always goes out; only SMS and email are optional.
  const toggleChannel = (ch) => {
    if (ch === 'in-app') return;
    setForm(prev => ({
      ...prev, channels: prev.channels.includes(ch) ? prev.channels.filter(c => c !== ch) : [...prev.channels, ch],
    }));
  };

  const sendLabel = specific ? (form.unit ? `Send to Unit ${form.unit}` : 'Send to unit') : 'Send to all tenants';

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50">
        <Header title="Announcements" />

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-4xl mx-auto space-y-6">

            {/* Compose Announcement */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <h3 className="text-base font-bold text-slate-800 mb-4 m-0">Compose Announcement</h3>

              <div className={`grid grid-cols-1 gap-3 mb-3 ${specific ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                <div>
                  <label className={LABEL}>Send to</label>
                  <select value={form.sendTo} onChange={e => setForm(p => ({ ...p, sendTo: e.target.value, unit: '' }))} className={INPUT}>
                    <option>All tenants</option><option>Specific unit</option>
                  </select>
                </div>
                {specific && (
                  <div>
                    <label className={LABEL}>Unit</label>
                    <select value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} className={INPUT}>
                      <option value="">{units.length ? 'Choose a unit…' : 'No occupied units'}</option>
                      {units.map(u => (
                        <option key={u.name} value={u.name}>Unit {u.name} ({u.count} tenant{u.count === 1 ? '' : 's'})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className={LABEL}>Type</label>
                  <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className={INPUT}>
                    <option>General</option><option>Urgent</option><option>Reminder</option>
                  </select>
                </div>
              </div>

              <div className="mb-3">
                <label className={LABEL}>Title</label>
                <input type="text" placeholder="Announcement title" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className={INPUT} />
              </div>

              <div className="mb-4">
                <label className={LABEL}>Message</label>
                <textarea aria-label="Message" placeholder="Type your message here..." rows={4} value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} className="focus-glow w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-800 placeholder-slate-400 resize-none outline-none focus:bg-white focus:border-indigo-500 transition-all" />
              </div>

              {/* Delivery Channels */}
              <div className="mb-4">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Delivery Channels</label>
                <div className="flex flex-wrap gap-2">
                  {[{ key: 'in-app', label: 'In-App', icon: faDesktop }, { key: 'sms', label: 'SMS', icon: faMobileAlt }, { key: 'email', label: 'Email', icon: faEnvelope }].map(ch => (
                    <button key={ch.key} type="button" onClick={() => toggleChannel(ch.key)}
                      title={ch.key === 'in-app' ? 'In-app is always sent' : undefined}
                      className={`btn-interactive flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border ${ch.key === 'in-app' ? 'cursor-default' : 'cursor-pointer'} transition-all ${form.channels.includes(ch.key) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-400'}`}>
                      <FontAwesomeIcon icon={ch.icon} /> {ch.label}
                      {ch.key === 'in-app' && <FontAwesomeIcon icon={faLock} className="text-[9px] opacity-70" />}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 m-0 mt-2">
                  SMS and email reach only tenants who have them enabled and not opted out. SMS may cost credits.
                </p>
              </div>

              {/* Recipient Count */}
              <div className="mb-4 bg-slate-50 border border-slate-100 rounded-lg p-3 flex items-center gap-2 text-xs text-slate-600">
                <FontAwesomeIcon icon={faUsers} className="text-indigo-500" />
                <span>Will be sent to <strong className="text-slate-800">{recipientCount} tenant{recipientCount === 1 ? '' : 's'}</strong></span>
              </div>

              {notice && (
                <div className={`mb-4 rounded-lg px-3 py-2 text-xs font-medium ${notice.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                  {notice.text}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => handleSend(false)} disabled={!!sending}
                  className="btn-interactive flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 shadow-sm border-0 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                  <FontAwesomeIcon icon={sending === 'send' ? faSpinner : faPaperPlane} spin={sending === 'send'} />
                  {sendLabel}
                </button>
                <button type="button" onClick={() => handleSend(true)} disabled={!!sending}
                  className="btn-interactive flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 border-solid cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                  <FontAwesomeIcon icon={sending === 'draft' ? faSpinner : faSave} spin={sending === 'draft'} /> Save draft
                </button>
              </div>
            </div>

            {/* Announcement History */}
            <div>
              <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3 m-0">Announcement History</h4>
              <div className="stagger-children space-y-3 mt-2">
                {announcements.length === 0 && (
                  <p className="text-xs text-slate-400 m-0">No announcements yet.</p>
                )}
                {announcements.map(item => (
                  <div key={item.id} className="card-interactive bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition-all hover:border-indigo-400">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${item.tagStyle}`}>{item.tag}</span>
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${statusConfig[item.status].color}`}>{statusConfig[item.status].label}</span>
                      <span className="text-sm font-semibold text-slate-800">{item.title}</span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed m-0 mb-3">{item.body}</p>
                    <div className="flex items-center flex-wrap gap-3 text-[10px] text-slate-400">
                      <span className="flex items-center gap-1"><FontAwesomeIcon icon={faCalendarAlt} /> {item.date}</span>
                      <span className="flex items-center gap-1"><FontAwesomeIcon icon={faUsers} /> {item.send_to} · {item.recipients} recipients</span>
                      <div className="flex items-center gap-1">
                        {item.channels.map(ch => (
                          <span key={ch} className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center" title={ch}>
                            <FontAwesomeIcon icon={channelIcons[ch]} className="text-[9px] text-slate-500" />
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminAnnouncements;
