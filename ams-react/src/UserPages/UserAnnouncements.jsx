import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBullhorn, faCalendarAlt, faTag } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';

export default function UserAnnouncements() {
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAnnouncements();
    }, []);

    const fetchAnnouncements = async () => {
        try {
            setLoading(true);
            const response = await api.get('get_announcements_public.php');
            if (response.data.success) {
                setAnnouncements(response.data.announcements);
            }
        } catch (error) {
            console.error("Failed to fetch announcements", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full min-h-[calc(100vh-76px)] bg-slate-50 py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-[900px] space-y-8 flex flex-col justify-start text-left">
                
                <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-4xl font-sans font-extrabold m-0 tracking-tight select-none flex items-center gap-3" style={{ color: '#3b4276' }}>
                            <FontAwesomeIcon icon={faBullhorn} className="text-indigo-500 text-3xl" />
                            Announcements
                        </h1>
                        <p className="text-slate-500 text-sm mt-2 m-0">
                            Stay updated with the latest news, notices, and updates from the administration.
                        </p>
                    </div>
                </div>

                <div className="space-y-6">
                    {loading ? (
                        <div className="text-center py-12 text-slate-400 font-medium bg-white rounded-xl border border-slate-200 shadow-sm">
                            Loading announcements...
                        </div>
                    ) : announcements.length === 0 ? (
                        <div className="text-center py-16 bg-white rounded-xl border border-slate-200 shadow-sm">
                            <FontAwesomeIcon icon={faBullhorn} className="text-5xl text-slate-200 mb-4" />
                            <h3 className="text-xl font-bold text-slate-700 m-0">No Announcements</h3>
                            <p className="text-slate-500 mt-2">There are currently no active announcements.</p>
                        </div>
                    ) : (
                        announcements.map((item) => (
                            <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
                                <div className="p-6 md:p-8">
                                    <div className="flex flex-wrap items-center gap-3 mb-4">
                                        <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold uppercase tracking-wider rounded-md flex items-center gap-1.5">
                                            <FontAwesomeIcon icon={faTag} />
                                            {item.tag || 'Notice'}
                                        </span>
                                        <span className="text-sm font-medium text-slate-500 flex items-center gap-1.5">
                                            <FontAwesomeIcon icon={faCalendarAlt} className="text-slate-400" />
                                            {new Date(item.created_at).toLocaleDateString('en-US', {
                                                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                                            })}
                                        </span>
                                    </div>
                                    <h2 className="text-2xl font-bold text-slate-800 mb-4 tracking-tight">
                                        {item.title}
                                    </h2>
                                    <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed whitespace-pre-wrap">
                                        {item.body}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

            </div>
        </div>
    );
}
