import { useState, useEffect } from 'react';
import { Eye, Mail, ShieldCheck, CalendarClock, ArrowUpDown } from 'lucide-react';
import RoomPreviewModal from '../Components/RoomPreviewModal';
import HouseRulesModal from '../Components/HouseRulesModal';
import PreviewHero from '../Components/PreviewHero';
import RulesCarousel from '../Components/RulesCarousel';
import api from '../api/axiosConfig';
import useAllRules from '../hooks/useAllRules';
import { useLang } from '../config/i18n';
import { usePublicSettings } from '../config/publicSettings';
import { previewText, previewFeatures } from '../config/previewHero';
import { formatAvailable } from '../utils/availableDate';
import '../assets/styles/responsive/user/preview.responsive.css';
import { Bone, SkeletonGrid } from '../Components/tenant/Skeleton';

const toCard = (r) => ({
    id: r.id,
    type: r.type,
    floor: r.floor,
    rent: Number(r.rent) || 0,
    price: `₱${Number(r.rent).toLocaleString()}/mo`,
    images: Array.isArray(r.images) ? r.images : [],
    availableFrom: r.availableFrom || null,
});

// Sort choices for each list (the select under the heading).
const AVAILABLE_SORTS = ['room', 'priceLow', 'priceHigh'];
const UPCOMING_SORTS = ['soonest', 'priceLow', 'priceHigh'];
const SORT_LABELS = { room: 'preview.sortRoom', priceLow: 'preview.sortPriceLow', priceHigh: 'preview.sortPriceHigh', soonest: 'preview.sortSoonest' };
const byRoom = (a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
const SORTERS = {
    room: byRoom,
    priceLow: (a, b) => a.rent - b.rent || byRoom(a, b),
    priceHigh: (a, b) => b.rent - a.rent || byRoom(a, b),
    soonest: (a, b) => String(a.availableFrom).localeCompare(String(b.availableFrom)) || a.rent - b.rent || byRoom(a, b),
};

export default function Preview({ onRentClick, onInquireClick }) {
    const [selectedRoomId, setSelectedRoomId] = useState(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [rooms, setRooms] = useState([]);
    // Occupied units that will free up (Settings → Contract End), soonest first.
    const [upcoming, setUpcoming] = useState([]);
    const [listView, setListView] = useState('available');
    const [sortBy, setSortBy] = useState({ available: 'room', upcoming: 'soonest' });
    const [loading, setLoading] = useState(true);
    // The admin's hero (Settings → Preview Page) and room preview mode; null until loaded.
    const settings = usePublicSettings();
    const previewMode = settings ? settings.roomPreviewMode : null;
    const hero = settings?.previewHero;
    // Apartment rules and policies: house, children and pets, and parking.
    const { rules: houseRules } = useAllRules();
    const [activeModalRule, setActiveModalRule] = useState(null);
    const [isHouseRulesOpen, setIsHouseRulesOpen] = useState(false);
    const { t, lang } = useLang();
    const getRuleTitle = (rule) => lang === 'fil' && rule.title_fil?.trim() ? rule.title_fil : rule.title;
    const getRuleDescription = (rule) => lang === 'fil' && rule.description_fil?.trim() ? rule.description_fil : rule.description;

    useEffect(() => {
        const fetchAvailableRooms = async () => {
            try {
                const response = await api.get('get_rooms.php');
                if (response.data.success && Array.isArray(response.data.rooms)) {
                    const all = response.data.rooms;
                    const vacant = all.filter(r => r.status && r.status.toLowerCase() === 'vacant').map(toCard);
                    const soon = all
                        .filter(r => r.availableFrom && (!r.status || r.status.toLowerCase() !== 'vacant'))
                        .map(toCard)
                        .sort((a, b) => a.availableFrom.localeCompare(b.availableFrom));
                    setRooms(vacant);
                    setUpcoming(soon);
                    // Nothing to rent now but something coming: open on Coming Soon.
                    if (vacant.length === 0 && soon.length > 0) setListView('upcoming');
                }
            } catch (error) {
                console.error("Failed to fetch available rooms", error);
            } finally {
                setLoading(false);
            }
        };
        fetchAvailableRooms();
    }, []);

    const showingUpcoming = listView === 'upcoming' && upcoming.length > 0;
    const list = showingUpcoming ? upcoming : rooms;
    const sortKey = showingUpcoming ? sortBy.upcoming : sortBy.available;
    const sortedList = [...list].sort(SORTERS[sortKey] || byRoom);
    const selectedRoom = [...rooms, ...upcoming].find(r => r.id === selectedRoomId) || null;

    const handleOpenPreview = (roomId) => {
        setSelectedRoomId(roomId);
        setIsPreviewOpen(true);
    };

    const tabClass = (active) => `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-bold border-0 cursor-pointer transition-colors ${active ? 'bg-white text-slate-900 shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-800'}`;
    const countClass = (active) => `min-w-[1.25rem] rounded-full px-1.5 text-[11px] leading-5 text-center ${active ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`;

    return (
        <div className="preview-page-root w-full bg-slate-50 p-4 md:p-8 box-border">
            <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 text-left items-start">

                {/*Left Column Layout*/}
                <div className="lg:col-span-7 flex flex-col space-y-4 animate-slide-up">

                    {/* Hero banner (Settings → Preview Page). Waits for the settings so the
                        built-in wording never flashes before the admin's own. */}
                    {hero ? (
                        <PreviewHero
                            image={hero.image}
                            badge={previewText(hero, 'badge', lang)}
                            title={previewText(hero, 'title', lang)}
                            location={previewText(hero, 'location', lang)}
                            features={previewFeatures(hero, lang)}
                        />
                    ) : (
                        <div className="ut-native rounded-[2rem] bg-brand shadow-xl flex-shrink-0 w-full h-[190px] skeleton-shimmer" aria-hidden="true" />
                    )}

                    {/* Apartment rules: one line that pages through on its own. */}
                    <RulesCarousel
                        rules={houseRules}
                        getTitle={getRuleTitle}
                        onPick={setActiveModalRule}
                        onViewAll={() => setIsHouseRulesOpen(true)}
                        t={t}
                    />

                    {/* List heading, then the switch (left) and sort (right) on their own
                        row, so the layout is the same in English and Filipino (the longer
                        Filipino labels used to push them onto a second line). Not sticky
                        (the page scrolls and the map stays in view), so no background. */}
                    <div className="space-y-3">
                        <h2 className="text-xl font-black tracking-tight text-slate-900 m-0">
                            {showingUpcoming ? t('preview.comingSoon') : t('preview.availableRooms')}
                        </h2>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            {upcoming.length > 0 ? (
                                <div role="tablist" aria-label={t('preview.roomLists')} className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200/70">
                                    <button type="button" role="tab" aria-selected={!showingUpcoming} onClick={() => setListView('available')} className={tabClass(!showingUpcoming)}>
                                        {t('preview.tabAvailable')} <span className={countClass(!showingUpcoming)}>{rooms.length}</span>
                                    </button>
                                    <button type="button" role="tab" aria-selected={showingUpcoming} onClick={() => setListView('upcoming')} className={tabClass(showingUpcoming)}>
                                        {t('preview.comingSoon')} <span className={countClass(showingUpcoming)}>{upcoming.length}</span>
                                    </button>
                                </div>
                            ) : (
                                loading
                                    ? <Bone className="h-7 w-20 rounded-full" />
                                    : <span className="text-sm font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">{t('preview.units').replace('{n}', rooms.length)}</span>
                            )}
                            {list.length > 1 && (
                                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                                    <ArrowUpDown aria-hidden="true" className="w-3.5 h-3.5" />
                                    <span className="sr-only">{t('preview.sortBy')}</span>
                                    <select
                                        value={sortKey}
                                        onChange={(e) => setSortBy((prev) => ({ ...prev, [showingUpcoming ? 'upcoming' : 'available']: e.target.value }))}
                                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        {(showingUpcoming ? UPCOMING_SORTS : AVAILABLE_SORTS).map((key) => (
                                            <option key={key} value={key}>{t(SORT_LABELS[key])}</option>
                                        ))}
                                    </select>
                                </label>
                            )}
                        </div>
                    </div>

                    {/* Room cards. The page scrolls; the map on the right stays in view. */}
                    <div className="w-full pb-4">
                        {showingUpcoming && <p className="m-0 mb-3 text-sm text-slate-500">{t('preview.upcomingNote')}</p>}

                        {loading ? (
                            <SkeletonGrid label={t('preview.loading')} count={4} image="h-44" className="grid grid-cols-1 sm:grid-cols-2 gap-4" />
                        ) : sortedList.length === 0 ? (
                            <div className="bg-white rounded-[2rem] p-12 border border-dashed border-slate-300 text-center shadow-sm">
                                <p className="text-slate-500 font-medium m-0">{t('preview.noRooms')}</p>
                            </div>
                        ) : (
                            <div className="preview-room-grid grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {sortedList.map((room) => {
                                    const canPreview = previewMode === 'floor_plan' || (room.images && room.images.length > 0);
                                    const soon = !!room.availableFrom && showingUpcoming;
                                    return (
                                    <div key={room.id} className="card-interactive bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60 flex flex-col justify-between hover:shadow-xl hover:shadow-indigo-900/5 hover:border-indigo-100 transition-all duration-300 h-fit group">

                                        {/* Wraps: a long badge ("Bakante sa Nob 11, 2026") drops under the
                                            title instead of squeezing it. */}
                                        <div className="flex flex-wrap justify-between items-start gap-2 mb-4">
                                            <div className="shrink-0">
                                                <h3 className="text-xl font-bold text-slate-900 m-0 whitespace-nowrap">Room {room.id}</h3>
                                                <p className="text-slate-500 text-xs mt-1 mb-0 font-medium">{room.type} • {room.floor}</p>
                                            </div>
                                            {soon ? (
                                                <span className="inline-flex max-w-full items-center gap-1 bg-amber-50 text-amber-800 text-xs font-bold px-2 py-1 rounded-md border border-amber-100">
                                                    <CalendarClock aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
                                                    {t('preview.availableFrom').replace('{date}', formatAvailable(room.availableFrom))}
                                                </span>
                                            ) : (
                                                <span className="shrink-0 bg-emerald-50 text-emerald-800 text-xs font-bold px-2 py-1 rounded-md border border-emerald-100">{t('preview.vacant')}</span>
                                            )}
                                        </div>

                                        <div className="mb-5">
                                            <p className="text-brand font-black text-2xl m-0 tracking-tight">{room.price}</p>
                                        </div>

                                        {/* An upcoming unit can be applied for too: the application
                                            only takes a move-in date from the day it is free. */}
                                        <div className="preview-room-card-actions flex gap-2">
                                            {canPreview && (
                                            <button
                                                type="button"
                                                onClick={() => handleOpenPreview(room.id)}
                                                className="flex-[1] bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 font-semibold py-2.5 rounded-xl text-xs transition-all border border-slate-200 cursor-pointer flex items-center justify-center shadow-sm group/btn"
                                                title={t('preview.viewLayout')}
                                                aria-label={`${t('preview.viewLayout')}: Room ${room.id}`}
                                            >
                                                <Eye aria-hidden="true" className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                                            </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => onInquireClick(room.id)}
                                                aria-label={`${t('preview.inquire')}: Room ${room.id}`}
                                                className={`bg-white hover:bg-indigo-50 text-indigo-600 border border-indigo-200 font-semibold py-2.5 rounded-xl text-xs transition-all duration-200 shadow-sm cursor-pointer flex items-center justify-center space-x-1.5 ${canPreview ? 'flex-[1.5]' : 'flex-[1]'}`}
                                            >
                                                <Mail aria-hidden="true" className="w-4 h-4" />
                                                <span className="hidden sm:inline lg:hidden xl:inline">{t('preview.inquire')}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onRentClick(room.id)}
                                                className={`bg-emerald-700 hover:bg-emerald-800 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] text-white font-black py-2.5 rounded-xl text-xs transition-all duration-200 shadow-md shadow-emerald-600/30 border-0 cursor-pointer text-center uppercase tracking-wide ${canPreview ? 'flex-[3]' : 'flex-[2]'}`}
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

                {/*Right Column: Maps Embed. Sticks below the TopBar (76px) while the page
                   scrolls on large screens.*/}
                <div className="preview-map-wrapper lg:col-span-5 h-[400px] lg:h-[calc(100dvh-76px-4rem)] lg:min-h-[320px] lg:sticky lg:top-[calc(76px+2rem)] bg-white rounded-[2rem] border-2 border-brand shadow-xl overflow-hidden flex animate-slide-up" style={{animationDelay: '0.1s'}}>
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