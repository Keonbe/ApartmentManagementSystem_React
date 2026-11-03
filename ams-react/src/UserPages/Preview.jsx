import { useState, useEffect } from 'react';
import { Eye, Mail, MapPin, CheckCircle2, ShieldCheck, CalendarClock, ArrowUpDown } from 'lucide-react';
import ApartmentPic from '../assets/Apartment_Pic.webp';
import RoomPreviewModal from '../Components/RoomPreviewModal';
import HouseRulesModal from '../Components/HouseRulesModal';
import api from '../api/axiosConfig';
import useAllRules from '../hooks/useAllRules';
import { useLang } from '../config/i18n';
import { publicAssetUrl } from '../api/fileUrl';
import { usePublicSettings } from '../config/publicSettings';
import { previewText, previewFeatures } from '../config/previewHero';
import { formatAvailable } from '../utils/availableDate';

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
    const heroText = hero ? {
        badge: previewText(hero, 'badge', lang),
        title: previewText(hero, 'title', lang),
        location: previewText(hero, 'location', lang),
        features: previewFeatures(hero, lang),
    } : null;
    const heroImage = hero?.image ? publicAssetUrl(hero.image) : ApartmentPic;

    const handleOpenPreview = (roomId) => {
        setSelectedRoomId(roomId);
        setIsPreviewOpen(true);
    };

    const tabClass = (active) => `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-bold border-0 cursor-pointer transition-colors ${active ? 'bg-white text-slate-900 shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-800'}`;
    const countClass = (active) => `min-w-[1.25rem] rounded-full px-1.5 text-[11px] leading-5 text-center ${active ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`;

    return (
        // No overflow-x-hidden root class here (shared .*-root rule): it would break the sticky map column.
        <div className="w-full min-h-[calc(100svh-76px)] bg-slate-50 p-4 md:p-8 box-border">
            <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 text-left items-start">

                {/*Left column: header, rules and the room list; the page scrolls, not the list*/}
                <div className="lg:col-span-8 flex flex-col min-w-0 gap-5 animate-slide-up">

                    {/*Page header from the admin's Preview Page settings. Waits for them so the
                       built-in wording never flashes before the admin's own.*/}
                    {heroText ? (
                        <header className="flex flex-col gap-2">
                            {heroText.badge && (
                                <span className="self-start rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[10px] sm:text-xs font-bold uppercase tracking-widest text-brand">{heroText.badge}</span>
                            )}
                            {heroText.title ? (
                                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 m-0 break-words">{heroText.title}</h1>
                            ) : (
                                <h1 className="sr-only">{t('preview.title')}</h1>
                            )}
                            {heroText.location && (
                                <p className="text-slate-600 text-sm sm:text-base m-0 font-medium flex items-center gap-1.5">
                                    <MapPin aria-hidden="true" className="w-4 h-4 flex-shrink-0 text-brand" />
                                    <span className="min-w-0 break-words">{heroText.location}</span>
                                </p>
                            )}
                            {heroText.features.length > 0 && (
                                <ul className="m-0 p-0 list-none flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-brand">
                                    {heroText.features.map((feature) => (
                                        <li key={feature} className="flex items-center gap-1.5"><CheckCircle2 aria-hidden="true" className="w-4 h-4" /><span>{feature}</span></li>
                                    ))}
                                </ul>
                            )}
                        </header>
                    ) : (
                        <div className="h-[104px] rounded-2xl bg-slate-200/60 animate-pulse" aria-hidden="true" />
                    )}

                    {/*Apartment rules summary and modal action*/}
                    <section aria-label={t('houseRules.title')} className="w-full min-w-0 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-xs">
                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                            <h2 className="m-0 flex flex-shrink-0 items-center gap-1.5 text-xs font-bold text-slate-800 sm:min-h-7">
                                <ShieldCheck aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-indigo-600" />
                                <span>{t('houseRules.title')}</span>
                            </h2>
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                {houseRules.map((rule) => (
                                    <button
                                        key={rule.id}
                                        type="button"
                                        title={getRuleTitle(rule)}
                                        onClick={() => setActiveModalRule(rule)}
                                        className="inline-flex min-h-7 max-w-full cursor-pointer items-center rounded-full border border-slate-200/90 bg-slate-100/80 px-3 py-0.5 text-left text-xs font-medium text-slate-700 transition-all duration-150 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 hover:shadow-2xs"
                                    >
                                        <span>{getRuleTitle(rule)}</span>
                                    </button>
                                ))}
                                {houseRules.length === 0 && <span className="text-xs text-slate-500">{t('houseRules.empty')}</span>}
                            </div>
                            {houseRules.length > 0 && (
                                <button type="button" onClick={() => setIsHouseRulesOpen(true)} className="inline-flex min-h-7 flex-shrink-0 self-start cursor-pointer items-center border-0 bg-transparent p-0 text-xs font-semibold text-indigo-600 transition-colors hover:text-indigo-800">
                                    {t('houseRules.viewAll')}
                                </button>
                            )}
                        </div>
                    </section>

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
                                <span className="text-sm font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">{t('preview.units').replace('{n}', rooms.length)}</span>
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
                            <div className="flex flex-col items-center justify-center py-16 space-y-4">
                                <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                                <span className="text-slate-500 font-medium text-sm">{t('preview.loading')}</span>
                            </div>
                        ) : sortedList.length === 0 ? (
                            <div className="bg-white rounded-[2rem] p-12 border border-dashed border-slate-300 text-center shadow-sm">
                                <p className="text-slate-500 font-medium m-0">{t('preview.noRooms')}</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                                            only takes a move-in date from the day it is free.
                                            Below md, Rent Now drops to its own full-width row. */}
                                        <div className="flex flex-wrap gap-2">
                                            {canPreview && (
                                            <button
                                                type="button"
                                                onClick={() => handleOpenPreview(room.id)}
                                                className="flex-[1] min-h-11 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 font-semibold py-2.5 rounded-xl text-xs transition-all border border-slate-200 cursor-pointer flex items-center justify-center shadow-sm group/btn"
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
                                                className={`min-h-11 bg-white hover:bg-indigo-50 text-indigo-600 border border-indigo-200 font-semibold py-2.5 rounded-xl text-xs transition-all duration-200 shadow-sm cursor-pointer flex items-center justify-center space-x-1.5 ${canPreview ? 'flex-[1.5]' : 'flex-[1]'}`}
                                            >
                                                <Mail aria-hidden="true" className="w-4 h-4" />
                                                <span>{t('preview.inquire')}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onRentClick(room.id)}
                                                className={`basis-full md:basis-0 min-h-11 bg-emerald-700 hover:bg-emerald-800 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] text-white font-black py-2.5 rounded-xl text-xs transition-all duration-200 shadow-md shadow-emerald-600/30 border-0 cursor-pointer text-center uppercase tracking-wide ${canPreview ? 'md:flex-[3]' : 'md:flex-[2]'}`}
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

                {/*Right column: building photo and map, sticky under the 76px top bar on desktop*/}
                {/*Desktop: fixed-height column (76px top bar + 32px page padding + 16px gap) so it fits before and after sticking; the photo keeps its 3:2 shape and the map takes what is left*/}
                <aside className="lg:col-span-4 lg:sticky lg:top-[92px] grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-col lg:h-[calc(100vh-124px)] gap-4 animate-slide-up" style={{animationDelay: '0.1s'}}>
                    <img
                        key={heroImage}
                        src={heroImage}
                        alt={t('preview.title')}
                        className="hidden sm:block self-start lg:shrink-0 w-full aspect-[3/2] object-cover object-center rounded-[2rem] shadow-xl"
                        onError={(e) => {
                            // A removed upload falls back to the built-in photo.
                            if (e.currentTarget.src !== new URL(ApartmentPic, window.location.href).href) e.currentTarget.src = ApartmentPic;
                        }}
                    />
                    <div className="h-[260px] sm:h-auto sm:min-h-[200px] lg:flex-1 lg:min-h-[240px] bg-white rounded-[2rem] border-2 border-brand shadow-xl overflow-hidden flex">
                        <iframe
                            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3866.795386520632!2d121.00438957587829!3d14.26515188519988!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x33bd7d000a3458f3%3A0x44fda1a8f72e3c6a!2sAngcanan%20Apartment!5e0!3m2!1sen!2sph!4v1783046721885!5m2!1sen!2sph"
                            className="w-full h-full border-0 flex-grow min-h-0 grayscale-[20%] contrast-125 transition-all duration-700 hover:grayscale-0 hover:contrast-100 rounded-2xl"
                            allowFullScreen=""
                            loading="lazy"
                            referrerPolicy="strict-origin-when-cross-origin"
                            title="Apartment Location Map"
                        ></iframe>
                    </div>
                </aside>

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