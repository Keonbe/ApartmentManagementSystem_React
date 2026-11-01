import { useState, useEffect } from 'react';
import { ArrowRight, Mail, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import { useLang } from '../config/i18n';
import { usePublicSettings } from '../config/publicSettings';
import { homeText } from '../config/homeContent';
import HomeIntro from '../Components/HomeIntro';
import '../assets/styles/responsive/user/home.responsive.css';

export default function Home({ onCardClick, username }) {
    // null until the real counts arrive; they stay hidden if the request fails
    // (made-up 14 / 4 used to show instead).
    const [counts, setCounts] = useState(null);
    const { t, lang } = useLang();
    // The admin's Home text (Other Settings → Home Page). The panel waits for
    // it, so the built-in wording never flashes before the custom one.
    const content = usePublicSettings()?.homeContent;
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
        // Always the Glass theme (App.jsx): the photo is the shared Glass backdrop
        // the admin sets in Other Settings. The panel is drawn for a dark
        // backdrop already, so it opts out of the colour remap (ut-native).
        <div className="home-hero ut-native w-full min-h-[calc(100vh-76px)] relative flex items-center justify-start overflow-hidden box-border">

            {/* Darkens the left side under the panel; the backdrop's own tint covers the rest. */}
            <div className="home-gradient-overlay absolute inset-0 z-0 bg-gradient-to-r from-slate-950/60 via-slate-950/25 to-transparent" aria-hidden="true"></div>

            {/*Clean Floating Content Panel Layout*/}
            <div className="home-content-container w-full max-w-6xl mx-auto px-6 md:px-12 z-10 text-left relative box-border py-12">
                {content && <div className="home-content-panel max-w-2xl space-y-6 bg-slate-950/70 backdrop-blur-xl p-8 md:p-12 rounded-[2rem] border border-white/10 shadow-2xl shadow-black/50 animate-slide-up">

                    <HomeIntro
                        badge={homeText(content, 'badge', lang)}
                        // Signed in: the greeting always shows; the heading switch is for visitors.
                        heading={username ? `${t('home.welcomeBack')} ${username}` : homeText(content, 'heading', lang)}
                        location={homeText(content, 'location', lang)}
                        description={homeText(content, 'description', lang)}
                    />

                    <div className="home-cta-row pt-5 flex flex-wrap gap-5 items-center justify-between border-t border-white/10 mt-2">
                        {counts && <div className="flex space-x-5 text-sm font-semibold text-slate-300">
                            <span className="flex items-center space-x-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                <span><strong className="text-white">{counts.total}</strong> {t('home.totalUnits')}</span>
                            </span>
                            <span className="flex items-center space-x-1.5 text-emerald-400">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                <span><strong className="text-emerald-300">{counts.available}</strong> {t('home.availableRooms')}</span>
                            </span>
                        </div>}

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

                </div>}
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