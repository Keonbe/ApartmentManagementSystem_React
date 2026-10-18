import { useState, useEffect, useRef } from 'react';
import { Eye, Mail, MapPin, CheckCircle2, ShieldCheck } from 'lucide-react';
import ApartmentPic from '../assets/Apartment_Pic.webp';
import RoomPreviewModal from '../Components/RoomPreviewModal';
import HouseRulesModal from '../Components/HouseRulesModal';
import api from '../api/axiosConfig';
import useAllRules from '../hooks/useAllRules';
import { useLang } from '../config/i18n';
import { getSystemSettings } from '../config/systemSettings';
import '../assets/styles/responsive/user/preview.responsive.css';

export default function Preview({ onRentClick, onInquireClick }) {
    const [selectedRoomId, setSelectedRoomId] = useState(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [previewMode, setPreviewMode] = useState(null);
    // Apartment rules and policies: house, children and pets, and parking.
    const { rules: houseRules } = useAllRules();
    const [activeModalRule, setActiveModalRule] = useState(null);
    const [isHouseRulesOpen, setIsHouseRulesOpen] = useState(false);
    const scrollRef = useRef(null);
    const { t, lang } = useLang();
    const getRuleTitle = (rule) => lang === 'fil' && rule.title_fil?.trim() ? rule.title_fil : rule.title;
    const getRuleDescription = (rule) => lang === 'fil' && rule.description_fil?.trim() ? rule.description_fil : rule.description;

    useEffect(() => {
        const fetchAvailableRooms = async () => {
            try {
                const response = await api.get('get_rooms.php');
                if (response.data.success && Array.isArray(response.data.rooms)) {
                    // Filter to vacant rooms
                    const vacant = response.data.rooms
                        .filter(r => r.status && r.status.toLowerCase() === 'vacant')
                        .map(r => ({
                            id: r.id,
                            type: r.type,
                            floor: r.floor,
                            price: `₱${Number(r.rent).toLocaleString()}/mo`,
                            images: Array.isArray(r.images) ? r.images : []
                        }));
                    setRooms(vacant);
                }
            } catch (error) {
                console.error("Failed to fetch available rooms", error);
            } finally {
                setLoading(false);
            }
        };
        fetchAvailableRooms();
        getSystemSettings().then((s) => setPreviewMode(s.roomPreviewMode)).catch(() => setPreviewMode('images'));
    }, []);

    const selectedRoom = rooms.find(r => r.id === selectedRoomId) || null;

    const handleOpenPreview = (roomId) => {
        setSelectedRoomId(roomId);
        setIsPreviewOpen(true);
    };

    return (
        <div className="preview-page-root w-full h-auto lg:h-[calc(100vh-76px)] bg-slate-50 p-4 md:p-8 lg:overflow-hidden box-border">
            <div className="w-full h-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 text-left items-stretch">

                {/*Left Column Layout*/}
                <div className="lg:col-span-7 flex flex-col min-h-0 space-y-4 animate-slide-up">

                    {/*Modern Dynamic Hero Banner*/}
                    <div className="preview-hero-banner relative rounded-[2rem] overflow-hidden shadow-xl bg-[#3b4276] flex flex-col sm:flex-row items-stretch flex-shrink-0 w-full group">
                        
                        <div className="preview-hero-image w-full sm:w-2/5 overflow-hidden relative min-h-[160px] sm:min-h-full lg:max-h-[190px]">
                            <img
                                src={ApartmentPic}
                                alt="Apartment"
                                className="w-full h-full absolute inset-0 object-cover object-center transition-transform duration-700 group-hover:scale-105"
                            />
                            {/* Removed gradient overlay as requested */}
                        </div>
                        
                        <div className="preview-hero-content p-5 md:p-6 text-white flex flex-col justify-center flex-grow relative z-10 space-y-2 w-full sm:w-3/5">
                            <div>
                                <span className="text-[10px] sm:text-xs tracking-widest uppercase font-bold px-3 py-1.5 rounded-full bg-white/20 border border-white/30 text-white backdrop-blur-md inline-flex items-center space-x-1.5 mb-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                                    <span>{t('preview.featured')}</span>
                                </span>
                                <h2 className="text-2xl sm:text-3xl font-black text-white m-0 tracking-tight leading-tight">{t('preview.title')}</h2>
                                <p className="text-indigo-100 text-sm sm:text-base m-0 font-medium flex items-center space-x-2 mt-2">
                                    <MapPin className="w-4 h-4" />
                                    <span>{t('preview.location')}</span>
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs">
                                <span className="px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur-md font-medium border border-white/20 flex items-center space-x-1 text-white"><CheckCircle2 className="w-3 h-3 text-white"/> <span>{t('preview.parking')}</span></span>
                                <span className="px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur-md font-medium border border-white/20 flex items-center space-x-1 text-white"><CheckCircle2 className="w-3 h-3 text-white"/> <span>{t('preview.bathroom')}</span></span>
                            </div>
                        </div>
                    </div>

                    {/*Apartment rules summary and modal action*/}
                    <section aria-label={t('houseRules.title')} className="w-full min-w-0 flex-shrink-0 rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-xs">
                        <div className="flex min-w-0 items-center gap-3">
                            <h3 className="m-0 flex flex-shrink-0 items-center gap-1.5 text-xs font-bold text-slate-800">
                                <ShieldCheck aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-indigo-600" />
                                <span className="hidden sm:inline">{t('houseRules.title')}</span>
                            </h3>
                            <div ref={scrollRef} className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto scroll-smooth no-scrollbar">
                                {houseRules.map((rule) => (
                                    <button
                                        key={rule.id}
                                        type="button"
                                        title={getRuleTitle(rule)}
                                        onClick={() => setActiveModalRule(rule)}
                                        className="inline-flex shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full border border-slate-200/90 bg-slate-100/80 px-3 py-0.5 text-xs font-medium text-slate-700 transition-all duration-150 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 hover:shadow-2xs"
                                    >
                                        <span>{getRuleTitle(rule)}</span>
                                    </button>
                                ))}
                                {houseRules.length === 0 && <span className="whitespace-nowrap text-xs text-slate-500">{t('houseRules.empty')}</span>}
                            </div>
                            {houseRules.length > 0 && (
                                <button type="button" onClick={() => setIsHouseRulesOpen(true)} className="inline-flex flex-shrink-0 cursor-pointer items-center border-0 bg-transparent p-0 text-xs font-semibold text-indigo-600 transition-colors hover:text-indigo-800">
                                    {t('houseRules.viewAll')}
                                </button>
                            )}
                        </div>
                    </section>

                    {/*Scrollable Room Cards Track Container*/}
                    <div className="preview-room-list-scroll w-full flex-grow min-h-0 overflow-y-auto pr-2 pb-4 max-h-[500px] lg:max-h-none custom-scrollbar">
                        <div className="flex items-center justify-between mb-3 sticky top-0 bg-slate-50 py-1 z-10 rounded-xl">
                            <h2 className="text-xl font-black tracking-tight text-slate-900 m-0">
                                {t('preview.availableRooms')}
                            </h2>
                            <span className="text-sm font-semibold text-slate-500 bg-slate-200/50 px-3 py-1 rounded-full">{rooms.length} Units</span>
                        </div>

                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-16 space-y-4">
                                <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                                <span className="text-slate-500 font-medium text-sm">{t('preview.loading')}</span>
                            </div>
                        ) : rooms.length === 0 ? (
                            <div className="bg-white rounded-[2rem] p-12 border border-dashed border-slate-300 text-center shadow-sm">
                                <p className="text-slate-500 font-medium m-0">{t('preview.noRooms')}</p>
                            </div>
                        ) : (
                            <div className="preview-room-grid grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {rooms.map((room) => {
                                    const canPreview = previewMode === 'floor_plan' || (room.images && room.images.length > 0);
                                    return (
                                    <div key={room.id} className="card-interactive bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60 flex flex-col justify-between hover:shadow-xl hover:shadow-indigo-900/5 hover:border-indigo-100 transition-all duration-300 h-fit group">
                                        
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <h3 className="text-xl font-bold text-slate-900 m-0">Room {room.id}</h3>
                                                <p className="text-slate-500 text-xs mt-1 mb-0 font-medium">{room.type} • {room.floor}</p>
                                            </div>
                                            <span className="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide border border-emerald-100">Vacant</span>
                                        </div>
                                        
                                        <div className="mb-5">
                                            <p className="text-[#3b4276] font-black text-2xl m-0 tracking-tight">{room.price}</p>
                                        </div>

                                        <div className="preview-room-card-actions flex gap-2">
                                            {canPreview && (
                                            <button
                                                type="button"
                                                onClick={() => handleOpenPreview(room.id)}
                                                className="flex-[1] bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 font-semibold py-2.5 rounded-xl text-xs transition-all border border-slate-200 cursor-pointer flex items-center justify-center shadow-sm group/btn"
                                                title={t('preview.viewLayout')}
                                            >
                                                <Eye className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                                            </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => onInquireClick(room.id)}
                                                className={`bg-white hover:bg-indigo-50 text-indigo-600 border border-indigo-200 font-semibold py-2.5 rounded-xl text-xs transition-all duration-200 shadow-sm cursor-pointer flex items-center justify-center space-x-1.5 ${canPreview ? 'flex-[1.5]' : 'flex-[1]'}`}
                                            >
                                                <Mail className="w-4 h-4" />
                                                <span className="hidden sm:inline lg:hidden xl:inline">{t('preview.inquire')}</span>
                                            </button>
                                            <button
                                                onClick={() => onRentClick(room.id)}
                                                className={`bg-[#10b981] hover:bg-[#059669] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] text-white font-black py-2.5 rounded-xl text-xs transition-all duration-200 shadow-md shadow-emerald-600/30 border-0 cursor-pointer text-center uppercase tracking-wide ${canPreview ? 'flex-[3]' : 'flex-[2]'}`}
                                            >
                                                {t('preview.rentNow')}
                                            </button>
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                </div>

                {/*Right Column: Maps Embed*/}
                <div className="preview-map-wrapper lg:col-span-5 h-[400px] lg:h-full bg-white rounded-[2rem] border-2 border-[#3b4276] shadow-xl overflow-hidden flex animate-slide-up" style={{animationDelay: '0.1s'}}>
                    <iframe
                        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3866.795386520632!2d121.00438957587829!3d14.26515188519988!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x33bd7d000a3458f3%3A0x44fda1a8f72e3c6a!2sAngcanan%20Apartment!5e0!3m2!1sen!2sph!4v1783046721885!5m2!1sen!2sph"
                        className="w-full h-full border-0 flex-grow min-h-0 grayscale-[20%] contrast-125 transition-all duration-700 hover:grayscale-0 hover:contrast-100 rounded-2xl"
                        allowFullScreen=""
                        loading="lazy"
                        referrerPolicy="strict-origin-when-cross-origin"
                        title="Apartment Location Map"
                    ></iframe>
                </div>
                                    
            </div>

            <style>
                {`
                @keyframes slide-up {
                    0% { opacity: 0; transform: translateY(20px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                .animate-slide-up {
                    animation: slide-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    opacity: 0;
                }
                
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background-color: #cbd5e1;
                    border-radius: 20px;
                }
                `}
            </style>

            {/*Injected Room Visual Layout Overlays*/}
            <RoomPreviewModal
                isOpen={isPreviewOpen}
                onClose={() => setIsPreviewOpen(false)}
                roomId={selectedRoomId}
                mode={previewMode}
                images={selectedRoom?.images || []}
            />
            <HouseRulesModal isOpen={isHouseRulesOpen} onClose={() => setIsHouseRulesOpen(false)} />
            {activeModalRule && (
                <div
                    className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
                    onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveModalRule(null); }}
                >
                    <section role="dialog" aria-modal="true" aria-labelledby="selected-rule-title" className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
                            <div className="flex items-start gap-3">
                                <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 flex-shrink-0 text-indigo-600" />
                                <h2 id="selected-rule-title" className="m-0 text-base font-bold text-slate-900">{getRuleTitle(activeModalRule)}</h2>
                            </div>
                            <button type="button" aria-label={t('houseRules.closeDetails')} onClick={() => setActiveModalRule(null)} className="flex-shrink-0 cursor-pointer border-0 bg-transparent p-0 text-lg leading-none text-slate-400 hover:text-slate-700">✕</button>
                        </header>
                        <div className="px-5 py-5 sm:px-6">
                            <p className="m-0 whitespace-pre-line text-sm leading-relaxed text-slate-600">{getRuleDescription(activeModalRule)}</p>
                        </div>
                        <footer className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:px-6">
                            <button type="button" onClick={() => { setActiveModalRule(null); setIsHouseRulesOpen(true); }} className="cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-indigo-600 hover:text-indigo-800">{t('houseRules.viewAll')}</button>
                            <button type="button" onClick={() => setActiveModalRule(null)} className="rounded-lg border-0 bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">{t('houseRules.close')}</button>
                        </footer>
                    </section>
                </div>
            )}
        </div>
    );
}