import React, { useState } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faBullhorn, faSave, faEdit, faTrashAlt, faTimes, faMobileAlt, faEnvelope, 
  faDesktop, faCalendarAlt, faUsers, faClock, faCheckCircle, faPaperPlane
} from '@fortawesome/free-solid-svg-icons';

const initialAnnouncements = [
  { id: 1, tag: 'Urgent', tagStyle: 'bg-red-100 text-red-800', title: 'Water interruption — May 1–2', date: 'Apr 28, 2025', body: 'Water service will be interrupted on May 1–2 from 8 AM to 5 PM for maintenance. Please store enough water. Sorry for the inconvenience.', sendTo: 'All tenants', channels: ['in-app', 'sms'], status: 'sent', recipients: 24 },
  { id: 2, tag: 'Reminder', tagStyle: 'bg-blue-100 text-blue-800', title: 'May rent due — 5th of the month', date: 'Apr 25, 2025', body: 'This is a friendly reminder that rent for May is due on the 5th. Please settle on time to avoid penalties. Thank you!', sendTo: 'All tenants', channels: ['in-app', 'email'], status: 'sent', recipients: 24 },
  { id: 3, tag: 'General', tagStyle: 'bg-slate-100 text-slate-600', title: 'No loud noise after 10 PM', date: 'Apr 20, 2025', body: 'Please be reminded to observe quiet hours after 10 PM. Kindly be considerate of your neighbors. Thank you for your cooperation.', sendTo: 'All tenants', channels: ['in-app'], status: 'sent', recipients: 24 },
  { id: 4, tag: 'Reminder', tagStyle: 'bg-blue-100 text-blue-800', title: 'June rent due — 5th of the month', date: 'May 28, 2025', body: 'Rent for June is due on the 5th. Please settle on time.', sendTo: 'All tenants', channels: ['in-app', 'sms', 'email'], status: 'scheduled', scheduledDate: '2025-06-01', recipients: 24 },
];

const channelIcons = { 'in-app': faDesktop, 'sms': faMobileAlt, 'email': faEnvelope };
const statusConfig = {
  sent: { label: 'Sent', color: 'bg-emerald-100 text-emerald-700' },
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-700' },
  draft: { label: 'Draft', color: 'bg-slate-100 text-slate-600' },
};

const AdminAnnouncements = () => {
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [editingId, setEditingId] = useState(null);
  
  // Compose form
  const [form, setForm] = useState({ sendTo: 'All tenants', type: 'General', title: '', body: '', channels: ['in-app'], scheduleEnabled: false, scheduleDate: '' });

  const handleSend = (asDraft = false) => {
    if (!form.title || !form.body) return;
    const tagStyleMap = { Urgent: 'bg-red-100 text-red-800', Reminder: 'bg-blue-100 text-blue-800', General: 'bg-slate-100 text-slate-600' };
    const newAnn = {
      id: Date.now(), tag: form.type, tagStyle: tagStyleMap[form.type], title: form.title, 
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      body: form.body, sendTo: form.sendTo, channels: [...form.channels],
      status: asDraft ? 'draft' : form.scheduleEnabled ? 'scheduled' : 'sent',
      scheduledDate: form.scheduleEnabled ? form.scheduleDate : null, recipients: 24
    };
    setAnnouncements([newAnn, ...announcements]);
    setForm({ sendTo: 'All tenants', type: 'General', title: '', body: '', channels: ['in-app'], scheduleEnabled: false, scheduleDate: '' });
  };

  const toggleChannel = (ch) => {
    setForm(prev => ({
      ...prev, channels: prev.channels.includes(ch) ? prev.channels.filter(c => c !== ch) : [...prev.channels, ch]
    }));
  };

  const handleDelete = (id) => { setAnnouncements(prev => prev.filter(a => a.id !== id)); };

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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Send to</label>
                  <select value={form.sendTo} onChange={e => setForm(p => ({...p, sendTo: e.target.value}))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-indigo-500 transition-all">
                    <option>All tenants</option><option>Specific unit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Type</label>
                  <select value={form.type} onChange={e => setForm(p => ({...p, type: e.target.value}))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-indigo-500 transition-all">
                    <option>General</option><option>Urgent</option><option>Reminder</option>
                  </select>
                </div>
              </div>

              <div className="mb-3">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Title</label>
                <input type="text" placeholder="Announcement title..." value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500 transition-all" />
              </div>

              <div className="mb-4">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Message</label>
                <textarea placeholder="Type your message here..." rows={4} value={form.body} onChange={e => setForm(p => ({...p, body: e.target.value}))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-800 placeholder-slate-400 resize-none outline-none focus:bg-white focus:border-indigo-500 transition-all" />
              </div>

              {/* Delivery Channels */}
              <div className="mb-4">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Delivery Channels</label>
                <div className="flex gap-2">
                  {[{ key: 'in-app', label: 'In-App', icon: faDesktop }, { key: 'sms', label: 'SMS', icon: faMobileAlt }, { key: 'email', label: 'Email', icon: faEnvelope }].map(ch => (
                    <button key={ch.key} onClick={() => toggleChannel(ch.key)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border cursor-pointer transition-all ${form.channels.includes(ch.key) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-400'}`}>
                      <FontAwesomeIcon icon={ch.icon} /> {ch.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Schedule Toggle */}
              <div className="mb-4 flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.scheduleEnabled} onChange={e => setForm(p => ({...p, scheduleEnabled: e.target.checked}))} className="w-4 h-4 text-indigo-600 rounded border-slate-300 cursor-pointer" />
                  <span className="text-xs font-semibold text-slate-600">Schedule for later</span>
                </label>
                {form.scheduleEnabled && (
                  <input type="datetime-local" value={form.scheduleDate} onChange={e => setForm(p => ({...p, scheduleDate: e.target.value}))} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none text-slate-700 bg-white focus:border-indigo-500" />
                )}
              </div>

              {/* Recipient Count */}
              <div className="mb-4 bg-slate-50 border border-slate-100 rounded-lg p-3 flex items-center gap-2 text-xs text-slate-600">
                <FontAwesomeIcon icon={faUsers} className="text-indigo-500" />
                <span>Will be sent to <strong className="text-slate-800">24 tenants</strong></span>
              </div>

              <div className="flex gap-3">
                <button onClick={() => handleSend(false)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 shadow-sm border-0 cursor-pointer transition-colors">
                  <FontAwesomeIcon icon={form.scheduleEnabled ? faClock : faPaperPlane} />
                  {form.scheduleEnabled ? 'Schedule' : 'Send to all tenants'}
                </button>
                <button onClick={() => handleSend(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 border-solid cursor-pointer transition-colors">
                  <FontAwesomeIcon icon={faSave} /> Save draft
                </button>
              </div>
            </div>

            {/* Announcement History */}
            <div>
              <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3 m-0">Announcement History</h4>
              <div className="space-y-3 mt-2">
                {announcements.map(item => (
                  <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition-all hover:border-indigo-400 group">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${item.tagStyle}`}>{item.tag}</span>
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${statusConfig[item.status].color}`}>{statusConfig[item.status].label}</span>
                        <span className="text-sm font-semibold text-slate-800">{item.title}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="w-7 h-7 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 bg-transparent border-0 cursor-pointer transition-colors"><FontAwesomeIcon icon={faEdit} className="text-xs" /></button>
                        <button onClick={() => handleDelete(item.id)} className="w-7 h-7 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 bg-transparent border-0 cursor-pointer transition-colors"><FontAwesomeIcon icon={faTrashAlt} className="text-xs" /></button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed m-0 mb-3">{item.body}</p>
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1"><FontAwesomeIcon icon={faCalendarAlt} /> {item.date}</span>
                        <span className="flex items-center gap-1"><FontAwesomeIcon icon={faUsers} /> {item.recipients} recipients</span>
                        <div className="flex items-center gap-1">
                          {item.channels.map(ch => (
                            <span key={ch} className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center" title={ch}>
                              <FontAwesomeIcon icon={channelIcons[ch]} className="text-[9px] text-slate-500" />
                            </span>
                          ))}
                        </div>
                      </div>
                      {item.status === 'scheduled' && item.scheduledDate && (
                        <span className="flex items-center gap-1 text-blue-600 font-semibold"><FontAwesomeIcon icon={faClock} /> {item.scheduledDate}</span>
                      )}
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
