import { useState, useEffect, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBullhorn, faBell, faPaperclip, faFilePdf, faThumbtack, faMagnifyingGlass, faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { fileUrl } from '../api/fileUrl';
import { useLang, dateLocale } from '../config/i18n';
import InlineAlert from '../Components/InlineAlert';
import '../assets/styles/responsive/user/user-announcements.responsive.css';
import { SkeletonList } from '../Components/tenant/Skeleton';

// Strictly uses megaphone (faBullhorn) and bell (faBell) icons
const TYPES = {
    General:  { key: 'general',  icon: faBullhorn, stripe: 'border-l-indigo-500', dot: 'bg-indigo-100 text-indigo-700', chip: 'bg-indigo-50 text-indigo-800' },
    Urgent:   { key: 'urgent',   icon: faBullhorn, stripe: 'border-l-rose-500',   dot: 'bg-rose-100 text-rose-700',     chip: 'bg-rose-50 text-rose-800' },
    Reminder: { key: 'reminder', icon: faBell,     stripe: 'border-l-amber-500',  dot: 'bg-amber-100 text-amber-800',   chip: 'bg-amber-50 text-amber-900' },
};
const typeOf = (tag) => TYPES[tag] || TYPES.General;

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

const linkify = (text) => String(text).split(URL_RE).map((part, i) => (
    i % 2 === 1
        ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-700 underline break-all">{part}</a>
        : part
));

const parseStamp = (value) => new Date(String(value).replace(' ', 'T'));
const seenKey = (userId) => `ams_announcements_seen_${userId || 'x'}`;
const readSeen = (userId) => {
    try { return localStorage.getItem(seenKey(userId)) || ''; } catch { return ''; }
};
const writeSeen = (userId, iso) => {
    try { localStorage.setItem(seenKey(userId), iso); } catch { /* no-op */ }
};

function AnnouncementCard({ item, isNew, t }) {
    const type = typeOf(item.tag);
    const stamp = parseStamp(item.created_at);
    const pinned = Number(item.is_pinned) === 1;
    const isPdf = item.attachment_path?.toLowerCase().endsWith('.pdf');
    const attachmentUrl = item.attachment_path ? fileUrl(item.attachment_path) : '';
    const dateText = stamp.toLocaleDateString(dateLocale(), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

    return (
        <li className={`user-announcements-card relative mb-3.5 overflow-hidden rounded-2xl border border-l-4 border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:shadow-md sm:p-5 ${type.stripe}`}>
            <div className="flex items-start gap-3 sm:gap-4">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base ${type.dot}`} aria-hidden="true">
                    <FontAwesomeIcon icon={type.icon} />
                </span>
                <div className="min-w-0 flex-1">
                    <h3 className="user-announcements-item-title m-0 text-base font-bold text-slate-900 sm:text-lg">{item.title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${type.chip}`}>{t(`announcements.type.${type.key}`)}</span>
                        <time className="text-xs text-slate-400" dateTime={stamp.toISOString()}>{dateText}</time>
                        {pinned && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700">
                                <FontAwesomeIcon icon={faThumbtack} aria-hidden="true" /> {t('announcements.pinned')}
                            </span>
                        )}
                        {isNew && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">{t('announcements.new')}</span>}
                    </div>
                </div>
            </div>

            <div className="user-announcements-card-body mt-3 sm:pl-[3.5rem]">
                <p className="user-announcements-content m-0 max-w-[68ch] whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{linkify(item.body || '')}</p>
                {attachmentUrl && (
                    <div className="mt-4">
                        {isPdf ? (
                            <a href={attachmentUrl} target="_blank" rel="noopener noreferrer"
                               className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-indigo-700 no-underline hover:bg-indigo-50">
                                <FontAwesomeIcon icon={faFilePdf} aria-hidden="true" />
                                {t('announcements.openAttachment')}
                            </a>
                        ) : (
                            <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="block w-fit" aria-label={t('announcements.openAttachment')}>
                                <img
                                    src={attachmentUrl}
                                    alt={t('announcements.imageAlt', { title: item.title })}
                                    loading="lazy"
                                className="max-h-72 max-w-full rounded-xl border border-slate-200 bg-slate-50 object-contain"
                                />
                                <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700">
                                    <FontAwesomeIcon icon={faPaperclip} aria-hidden="true" /> {t('announcements.openAttachment')}
                                </span>
                            </a>
                        )}
                    </div>
                )}
            </div>
        </li>
    );
}

export default function UserAnnouncements() {
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 5;

    const { t } = useLang();

    const userId = useMemo(() => {
        try { return JSON.parse(sessionStorage.getItem('loggedInUser') || '{}').id; } catch { return null; }
    }, []);

    const [seenAt] = useState(() => readSeen(userId));
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            try {
                const response = await api.get('get_announcements.php?public=1');
                if (!isMounted) return;
                if (response.data.success) {
                    setAnnouncements(response.data.announcements);
                    setLoadFailed(false);
                    writeSeen(userId, new Date().toISOString());
                } else {
                    setLoadFailed(true);
                }
            } catch (error) {
                console.error('Failed to fetch announcements', error);
                if (isMounted) setLoadFailed(true);
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        load();
        return () => { isMounted = false; };
    }, [userId, reloadKey]);

    const retry = () => { setLoading(true); setReloadKey((k) => k + 1); };

    const isNew = (item) => !!seenAt && parseStamp(item.created_at) > new Date(seenAt);
    const newCount = announcements.filter(isNew).length;
    const pinnedCount = announcements.filter((a) => Number(a.is_pinned) === 1).length;
    const latest = announcements.filter((a) => Number(a.is_pinned) !== 1)[0] || announcements[0];

    const handleFilterChange = (key) => {
        setFilter(key);
        setCurrentPage(1);
    };

    const handleSearchChange = (value) => {
        setSearch(value);
        setCurrentPage(1);
    };

    const filtered = filter === 'all' ? announcements : announcements.filter((a) => typeOf(a.tag).key === filter);
    const query = search.trim().toLocaleLowerCase();
    const shown = filtered.filter((a) => !query || [a.title, a.body, a.tag].some((val) => String(val || '').toLocaleLowerCase().includes(query)));

    // Pagination
    const totalPages = Math.ceil(shown.length / ITEMS_PER_PAGE);
    const paginatedItems = shown.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    // Group current page items by month
    const months = paginatedItems.reduce((acc, a) => {
        const key = String(a.created_at).slice(0, 7);
        (acc[key] = acc[key] || []).push(a);
        return acc;
    }, {});
    const monthKeys = Object.keys(months).sort((a, b) => b.localeCompare(a));
    const monthLabel = (key) => new Date(`${key}-01T00:00:00`).toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' });

    return (
        <div className="user-announcements-root box-border flex min-h-[calc(100vh-76px)] w-full flex-col items-center bg-slate-50 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <div className="w-full max-w-6xl">

                {/* Standardized Header */}
                <header className="mb-6 border-b border-slate-200 pb-5">
                    <a href="/my-room" className="group mb-2 inline-flex items-center gap-1.5 py-1 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800">
                        <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
                        <span>Back to My Room</span>
                    </a>
                    <h1 className="user-announcements-heading m-0 flex items-center gap-3 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                        <FontAwesomeIcon icon={faBullhorn} className="text-xl text-indigo-600 sm:text-2xl" aria-hidden="true" />
                        {t('announcements.heading')}
                    </h1>
                    <p className="user-announcements-subtext m-0 mt-1.5 max-w-2xl text-sm text-slate-500">
                        {t('announcements.subtext')}
                    </p>
                </header>

                {loading ? (
                    <SkeletonList label={t('announcements.loading')} count={3} />
                ) : loadFailed && announcements.length === 0 ? (
                    <InlineAlert>
                        {t('common.loadFailed')}{' '}
                        <button type="button" onClick={retry} className="ml-1 min-h-[44px] cursor-pointer rounded-lg border border-rose-300 bg-white px-3 text-sm font-bold text-rose-800 hover:bg-rose-100">
                            {t('common.retry')}
                        </button>
                    </InlineAlert>
                ) : announcements.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center shadow-sm">
                        <FontAwesomeIcon icon={faBullhorn} className="mb-4 text-5xl text-slate-300" aria-hidden="true" />
                        <h2 className="m-0 text-xl font-bold text-slate-800">{t('announcements.noAnnouncements')}</h2>
                        <p className="m-0 mt-2 text-slate-500">{t('announcements.noActive')}</p>
                    </div>
                ) : (
                    <>
                        {/* Keep status and controls above the feed for quick access. */}
                        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-indigo-50/30 p-5 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                                        <FontAwesomeIcon icon={faBullhorn} />
                                    </div>
                                    <div>
                                        <p className="m-0 text-base font-bold text-slate-900">
                                            {newCount > 0 ? t('announcements.newCount', { count: newCount }) : t('announcements.allCaughtUp')}
                                        </p>
                                        <p className="m-0 mt-0.5 text-xs text-slate-500">
                                            {latest && t('announcements.latestLabel', { title: latest.title })}
                                            {pinnedCount > 0 && <> &middot; {t('announcements.pinnedCount', { count: pinnedCount })}</>}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                <label className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-400 focus-within:border-indigo-500 focus-within:bg-white">
                                    <FontAwesomeIcon icon={faMagnifyingGlass} aria-hidden="true" />
                                    <input
                                        value={search}
                                        onChange={(e) => handleSearchChange(e.target.value)}
                                        placeholder={t('notifications.searchPlaceholder')}
                                        aria-label={t('notifications.searchPlaceholder')}
                                        className="w-full border-0 bg-transparent p-0 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                                    />
                                </label>
                                <div role="group" aria-label={t('announcements.heading')} className="mt-3 flex flex-wrap gap-1.5">
                                    {['all', 'urgent', 'reminder', 'general'].map((key) => (
                                        <button
                                            key={key}
                                            type="button"
                                            aria-pressed={filter === key}
                                            onClick={() => handleFilterChange(key)}
                                            className={`min-h-[34px] shrink-0 cursor-pointer rounded-full border px-3 text-xs font-semibold transition-all ${filter === key ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}
                                        >
                                            {key === 'all' ? t('announcements.filterAll') : t(`announcements.type.${key}`)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="w-full">
                            {shown.length === 0 ? (
                                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center shadow-sm">
                                    <p className="m-0 text-slate-700">{t('announcements.noneInFilter', { type: t(`announcements.type.${filter}`).toLowerCase() })}</p>
                                    <button type="button" onClick={() => handleFilterChange('all')} className="mt-3 inline-flex min-h-[44px] cursor-pointer items-center border-0 bg-transparent p-0 text-sm font-bold text-indigo-700 underline">
                                        {t('announcements.showAllTypes')}
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {monthKeys.map((key) => (
                                        <section key={key} aria-label={monthLabel(key)}>
                                            <div className="my-4 flex items-center gap-3">
                                                <span className="whitespace-nowrap text-xs font-bold uppercase tracking-wider text-slate-400">{monthLabel(key)}</span>
                                                <div className="h-px w-full bg-slate-200" />
                                            </div>
                                            <ul className="m-0 list-none p-0">
                                                {months[key].map((item) => <AnnouncementCard key={item.id} item={item} isNew={isNew(item)} t={t} />)}
                                            </ul>
                                        </section>
                                    ))}

                                    {/* Pagination Controls */}
                                    {totalPages > 1 && (
                                        <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setCurrentPage((prev) => Math.max(prev - 1, 1));
                                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                                }}
                                                disabled={currentPage === 1}
                                                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm"
                                            >
                                                <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" />
                                                <span>Previous</span>
                                            </button>

                                            <span className="text-xs font-medium text-slate-500">
                                                Page {currentPage} of {totalPages}
                                            </span>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
                                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                                }}
                                                disabled={currentPage === totalPages}
                                                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm"
                                            >
                                                <span>Next</span>
                                                <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                    </>
                )}
            </div>
        </div>
    );
}
