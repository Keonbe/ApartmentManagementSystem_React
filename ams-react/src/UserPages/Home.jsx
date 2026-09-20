import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight, faEnvelopeOpenText } from '@fortawesome/free-solid-svg-icons';
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
                {/*Modern Dark Gradient Overlay Mask for pristine text readability*/}
                <div className="home-gradient-overlay absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-900/70 to-transparent"></div>
            </div>

            {/*Clean Floating Content Panel Layout*/}
            <div className="home-content-container w-full max-w-6xl mx-auto px-6 md:px-12 z-10 text-left relative box-border py-12">
                <div className="home-content-panel max-w-2xl space-y-6 bg-slate-900/40 backdrop-blur-md p-8 md:p-10 rounded-3xl border border-white/10 shadow-2xl">

                    <span className="text-[10px] tracking-widest uppercase font-bold px-3 py-1.5 rounded-lg bg-[#6366f1] text-white inline-block select-none shadow-sm">
                        {t('home.badge')}
                    </span>

                    <div className="space-y-2">
                        <h1 className="home-heading text-4xl md:text-5xl font-sans font-extrabold m-0 text-white tracking-tight leading-tight">
                            {username ? `${t('home.welcomeBack')} ${username}` : t('home.heading')}
                        </h1>
                        <p className="text-indigo-200/90 font-semibold text-lg m-0">
                            {t('home.location')}
                        </p>
                    </div>

                    <p className="text-slate-300 text-sm md:text-base m-0 leading-relaxed font-medium">
                        {t('home.description')}
                    </p>

                    <div className="home-cta-row pt-4 flex flex-wrap gap-4 items-center justify-between border-t border-white/10 mt-2">
                        <div className="flex space-x-4 text-xs font-semibold text-white/80">
                            <span>• {counts.total} {t('home.totalUnits')}</span>
                            <span className="text-emerald-400">• {counts.available} {t('home.availableRooms')}</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                onClick={() => navigate('/inquire')}
                                className="home-inquire-btn btn-interactive bg-white/10 hover:bg-white/20 text-white font-bold px-5 py-3 rounded-xl text-xs transition-all duration-200 border border-white/20 cursor-pointer flex items-center space-x-2 backdrop-blur-sm"
                            >
                                <FontAwesomeIcon icon={faEnvelopeOpenText} />
                                <span>{t('inquiry.homeCta')}</span>
                            </button>

                            <button
                                onClick={onCardClick}
                                className="home-cta-btn btn-interactive bg-[#10b981] hover:bg-[#059669] hover:scale-[1.02] active:scale-[0.98] text-white font-bold px-6 py-3 rounded-xl text-xs transition-all duration-200 shadow-lg shadow-emerald-950/30 border-0 cursor-pointer flex items-center space-x-2"
                            >
                                <span>{t('home.cta')}</span>
                                <FontAwesomeIcon icon={faArrowRight} />
                            </button>
                        </div>
                    </div>

                </div>
            </div>

        </div>
    );
}