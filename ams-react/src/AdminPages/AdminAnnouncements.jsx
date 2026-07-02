import React from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBullhorn, faSave } from '@fortawesome/free-solid-svg-icons';

const announcements = [
  {
    tag: 'Urgent',
    tagStyle: 'bg-red-100 text-red-800',
    title: 'Water interruption — May 1–2',
    date: 'Apr 28, 2025',
    body: 'Water service will be interrupted on May 1–2 from 8 AM to 5 PM for maintenance. Please store enough water. Sorry for the inconvenience.',
  },
  {
    tag: 'Reminder',
    tagStyle: 'bg-blue-100 text-blue-800',
    title: 'May rent due — 5th of the month',
    date: 'Apr 25, 2025',
    body: 'This is a friendly reminder that rent for May is due on the 5th. Please settle on time to avoid penalties. Thank you!',
  },
  {
    tag: 'General',
    tagStyle: 'bg-slate-100 text-slate-600',
    title: 'No loud noise after 10 PM',
    date: 'Apr 20, 2025',
    body: 'Please be reminded to observe quiet hours after 10 PM. Kindly be considerate of your neighbors. Thank you for your cooperation.',
  },
];

const AdminAnnouncements = () => {
  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50">
        <Header title="Announcements" />

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto space-y-6">

            {/* Compose Announcement */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-800 mb-4 m-0">Compose announcement</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 mt-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Send to</label>
                  <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-indigo-500 transition-all">
                    <option>All tenants</option>
                    <option>Specific unit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Type</label>
                  <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-indigo-500 transition-all">
                    <option>General</option>
                    <option>Urgent</option>
                    <option>Reminder</option>
                  </select>
                </div>
              </div>

              <div className="mb-3">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Title</label>
                <input
                  type="text"
                  placeholder="Announcement title..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500 transition-all"
                />
              </div>

              <div className="mb-4">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Message</label>
                <textarea
                  placeholder="Type your message here..."
                  rows={4}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-800 placeholder-slate-400 resize-none outline-none focus:bg-white focus:border-indigo-500 transition-all"
                />
              </div>

              <div className="flex gap-3">
                <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 shadow-sm border-0 cursor-pointer">
                  <FontAwesomeIcon icon={faBullhorn} />
                  Send to all tenants
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 border-solid cursor-pointer">
                  <FontAwesomeIcon icon={faSave} />
                  Save draft
                </button>
              </div>
            </div>

            {/* Recent Announcements */}
            <div>
              <h4 className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-3 m-0">Recent announcements</h4>
              <div className="space-y-3 mt-2">
                {announcements.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm transition-all hover:border-indigo-400"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${item.tagStyle}`}>
                          {item.tag}
                        </span>
                        <span className="text-sm font-semibold text-slate-800">{item.title}</span>
                      </div>
                      <span className="text-[11px] text-slate-400">{item.date}</span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed m-0">{item.body}</p>
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