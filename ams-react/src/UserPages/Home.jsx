import { useState, useEffect } from 'react';
import { ArrowRight, Mail, MapPin, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ApartmentPic from '../assets/Apartment_Pic.png';
import api from '../api/axiosConfig';
import { useLang } from '../config/i18n';
import '../assets/styles/responsive/user/home.responsive.css';

export default function Home({ onCardClick, username }) {
    const [counts, setCounts] = useState({ total: 14, available: 4 });
    const { t } = useLang();
    const navigate = useNavigate();

    useEffect(() => {
        const fetchCounts = async () => {
            try {
                const response = await api.get('get_rooms.php');
                if (response.data.success && Array.isArray(response.data.rooms)) {
                    const total = response.data.rooms.length;
                    const available = response.data.rooms.filter(r => r.status && r.status.toLowerCase() === 'vacant').length;
                    setCounts({ total, available });
                }
            } catch (error) {
                console.error("Failed to fetch room counts", error);
            }
        };
        fetchCounts();
    }, []);

    return (
        <div className="home-hero w-full min-h-[calc(100vh-76px)] relative flex items-center justify-start overflow-hidden box-border">

            {/*Full Bleed Background Image Asset*/}
            <div className="absolute inset-0 z-0">
                <img
                    src={ApartmentPic}
                    alt="Apartment Background"
                    className="home-bg-image w-full h-full object-cover animate-fade-in"
                />
                <div className="home-gradient-overlay absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-900/70 to-transparent"></div>
            </div>

            {/*Clean Floating Content Panel Layout*/}
            <div className="home-content-container w-full max-w-6xl mx-auto px-6 md:px-12 z-10 text-left relative box-border py-12">
                <div className="home-content-panel max-w-2xl space-y-6 bg-slate-950/70 backdrop-blur-xl p-8 md:p-12 rounded-[2rem] border border-white/10 shadow-2xl shadow-black/50 animate-slide-up">

                    <span className="text-[10px] sm:text-xs tracking-widest uppercase font-bold px-3.5 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 inline-flex items-center space-x-2 shadow-sm">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-400"></span>
                        </span>
                        <span>{t('home.badge')}</span>
                    </span>

                    <div className="space-y-2">
                        <h1 className="home-heading text-4xl sm:text-5xl md:text-6xl font-sans font-black m-0 text-white tracking-tight leading-tight drop-shadow-md">
                            {username ? `${t('home.welcomeBack')} ${username}` : t('home.heading')}
                        </h1>
                        <p className="text-indigo-300 font-semibold text-lg flex items-center space-x-2 m-0">
                            <MapPin className="w-5 h-5" />
                            <span>{t('home.location')}</span>
                        </p>
                    </div>

                    <p className="text-slate-300 text-sm md:text-base m-0 leading-relaxed font-medium">
                        {t('home.description')}
                    </p>

                    <div className="home-cta-row pt-5 flex flex-wrap gap-5 items-center justify-between border-t border-white/10 mt-2">
                        <div className="flex space-x-5 text-sm font-semibold text-slate-300">
                            <span className="flex items-center space-x-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                <span><strong className="text-white">{counts.total}</strong> {t('home.totalUnits')}</span>
                            </span>
                            <span className="flex items-center space-x-1.5 text-emerald-400">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                <span><strong className="text-emerald-300">{counts.available}</strong> {t('home.availableRooms')}</span>
                            </span>
                        </div>

                        <div className="home-cta-buttons flex w-full min-w-0 flex-col items-stretch gap-2.5 pt-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                            <button
                                onClick={() => navigate('/inquire')}
                                className="w-full sm:w-auto home-inquire-btn btn-interactive bg-white/10 hover:bg-white/20 text-white font-medium px-3.5 py-2.5 rounded-xl text-xs sm:text-sm whitespace-normal leading-snug text-center min-w-0 transition-all duration-300 border border-white/10 cursor-pointer flex items-center justify-center space-x-2 group"
                            >
                                <Mail className="w-4 h-4 shrink-0 text-slate-300 group-hover:text-white transition-colors" />
                                <span>{t('inquiry.homeCta')}</span>
                            </button>

                            <button
                                onClick={onCardClick}
                                className="w-full sm:w-auto home-cta-btn btn-interactive bg-indigo-500 hover:bg-indigo-600 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] text-white font-medium px-3.5 py-2.5 rounded-xl text-xs sm:text-sm whitespace-normal leading-snug text-center min-w-0 transition-all duration-300 shadow-lg shadow-indigo-600/30 border-0 cursor-pointer flex items-center justify-center space-x-2 group"
                            >
                                <span>{t('home.cta')}</span>
                                <ArrowRight className="w-4 h-4 shrink-0 group-hover:translate-x-1 transition-transform" />
                            </button>
                        </div>
                    </div>

                </div>
            </div>

            <style>
                {`
                @keyframes slide-up {
                    0% { opacity: 0; transform: translateY(20px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                .animate-slide-up {
                    animation: slide-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                `}
            </style>
        </div>
    );
}