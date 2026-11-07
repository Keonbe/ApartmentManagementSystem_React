import { useState, useEffect, useMemo, useId } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBullhorn, faBell, faTriangleExclamation, faPaperclip, faFilePdf, faThumbtack, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { fileUrl } from '../api/fileUrl';
import { useLang, dateLocale } from '../config/i18n';
import InlineAlert from '../Components/InlineAlert';
import '../assets/styles/responsive/user/user-announcements.responsive.css';
import { SkeletonList } from '../Components/tenant/Skeleton';

// The three types the admin composer offers. The type sets the icon, colour and
// label, so an urgent notice is told apart without reading it.
const TYPES = {
    General:  { key: 'general',  icon: faBullhorn,            dot: 'bg-indigo-100 text-indigo-700', chip: 'bg-indigo-50 text-indigo-800' },
    Urgent:   { key: 'urgent',   icon: faTriangleExclamation, dot: 'bg-rose-100 text-rose-700',     chip: 'bg-rose-50 text-rose-800' },
    Reminder: { key: 'reminder', icon: faBell,                dot: 'bg-amber-100 text-amber-800',   chip: 'bg-amber-50 text-amber-900' },
};
const typeOf = (tag) => TYPES[tag] || TYPES.General;

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

// Plain text with clickable links: the body is user-written text, never HTML.
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
    try { localStorage.setItem(seenKey(userId), iso); } catch { /* storage blocked: New markers just reset next visit */ }
};

const SECTION = 'm-0 list-none divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white p-0 shadow-sm';

function AnnouncementRow({ item, isNew, defaultOpen, t }) {
    const [open, setOpen] = useState(defaultOpen);
    const panelId = useId();
    const type = typeOf(item.tag);
    const stamp = parseStamp(item.created_at);
    const pinned = Number(item.is_pinned) === 1;
    const isPdf = item.attachment_path?.toLowerCase().endsWith('.pdf');
    const attachmentUrl = item.attachment_path ? fileUrl(item.attachment_path) : '';
    const dateText = stamp.toLocaleDateString(dateLocale(), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

    return (
        <li className="user-announcements-card">
            <h3 className="m-0">
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                    aria-controls={panelId}
                    className="flex w-full cursor-pointer items-start gap-3 border-0 bg-transparent px-4 py-4 text-left hover:bg-slate-50 sm:gap-4 sm:px-6"
                >
                    <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base ${type.dot}`} aria-hidden="true">
                        <FontAwesomeIcon icon={type.icon} />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="user-announcements-item-title block text-base font-bold text-slate-900 sm:text-lg">{item.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${type.chip}`}>{t(`announcements.type.${type.key}`)}</span>
                            <time dateTime={stamp.toISOString()}>{dateText}</time>
                            {pinned && (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-800">
                                    <FontAwesomeIcon icon={faThumbtack} aria-hidden="true" /> {t('announcements.pinned')}
                                </span>
                            )}
                            {isNew && <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-xs font-bold text-white">{t('announcements.new')}</span>}
                        </span>
                    </span>
                    <FontAwesomeIcon icon={faChevronDown} aria-hidden="true" className={`mt-3 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
            </h3>

            {open && (
                <div id={panelId} className="user-announcements-card-body px-4 pb-5 sm:px-6 sm:pl-[5.5rem]">
                    <p className="user-announcements-content m-0 max-w-[68ch] whitespace-pre-wrap text-sm leading-relaxed text-slate-700 sm:text-base">{linkify(item.body || '')}</p>
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
            )}
        </li>
    );
}

export default function UserAnnouncements() {
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);
    // A failed load used to read as "no announcements", which was not true.
    const [loadFailed, setLoadFailed] = useState(false);
    const [filter, setFilter] = useState('all');
    const { t } = useLang();

    const userId = useMemo(() => {
        try { return JSON.parse(sessionStorage.getItem('loggedInUser') || '{}').id; } catch { return null; }
    }, []);
    // What counts as New is fixed for this visit; the timestamp is saved once
    // the list has loaded, so the next visit starts from here.
    const [seenAt] = useState(() => readSeen(userId));

    const load = async () => {
        try {
            const response = await api.get('get_announcements.php?public=1');
            if (response.data.success) {
                setAnnouncements(response.data.announcements);
                setLoadFailed(false);
                writeSeen(userId, new Date().toISOString());
            } else {
                setLoadFailed(true);
            }
        } catch (error) {
            console.error('Failed to fetch announcements', error);
            setLoadFailed(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const run = async () => { await load(); };
        run();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const retry = () => { setLoading(true); load(); };

    // First visit (nothing saved): nothing is flagged, so a new tenant is not shown a wall of "New".
    const isNew = (item) => !!seenAt && parseStamp(item.created_at) > new Date(seenAt);
    const newCount = announcements.filter(isNew).length;
    const pinnedCount = announcements.filter((a) => Number(a.is_pinned) === 1).length;
    const latest = announcements.filter((a) => Number(a.is_pinned) !== 1)[0] || announcements[0];

    const shown = filter === 'all' ? announcements : announcements.filter((a) => typeOf(a.tag).key === filter);
    const pinned = shown.filter((a) => Number(a.is_pinned) === 1);
    // The rest by month, newest first (the feed arrives newest first).
    const months = shown.filter((a) => Number(a.is_pinned) !== 1).reduce((acc, a) => {
        const key = String(a.created_at).slice(0, 7);
        (acc[key] = acc[key] || []).push(a);
        return acc;
    }, {});
    const monthKeys = Object.keys(months).sort((a, b) => b.localeCompare(a));
    const monthLabel = (key) => new Date(`${key}-01T00:00:00`).toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' });

    return (
        <div className="user-announcements-root flex min-h-[calc(100vh-76px)] w-full flex-col items-center bg-slate-50 px-4 py-6 sm:py-10 md:px-12 box-border">
            <div className="flex w-full max-w-[900px] lg:max-w-[1400px] flex-col justify-start gap-6 text-left">

                <header className="border-b border-slate-200 pb-4">
                    <h1 className="user-announcements-heading m-0 flex items-center gap-3 text-3xl font-extrabold tracking-tight text-brand sm:text-4xl">
                        <FontAwesomeIcon icon={faBullhorn} className="text-2xl text-indigo-600 sm:text-3xl" aria-hidden="true" />
                        {t('announcements.heading')}
                    </h1>
                    <p className="user-announcements-subtext m-0 mt-2 max-w-[60ch] text-sm text-slate-600">
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
                    <div className="rounded-xl border border-slate-200 bg-white py-16 text-center shadow-sm">
                        <FontAwesomeIcon icon={faBullhorn} className="mb-4 text-5xl text-slate-300" aria-hidden="true" />
                        <h2 className="m-0 text-xl font-bold text-slate-800">{t('announcements.noAnnouncements')}</h2>
                        <p className="m-0 mt-2 text-slate-600">{t('announcements.noActive')}</p>
                    </div>
                ) : (
                    <>
                        {/* Summary: what is new since the last visit, and the latest notice. */}
                        <div className="rounded-2xl bg-brand p-5 text-white sm:p-6" role="status">
                            <p className="m-0 text-3xl font-extrabold tabular-nums">
                                {newCount > 0 ? t('announcements.newCount', { count: newCount }) : t('announcements.allCaughtUp')}
                            </p>
                            <p className="m-0 mt-2 text-sm text-indigo-100">
                                {latest && t('announcements.latestLabel', { title: latest.title })}
                                {pinnedCount > 0 && <> &middot; {t('announcements.pinnedCount', { count: pinnedCount })}</>}
                            </p>
                        </div>

                        <div role="group" aria-label={t('announcements.heading')} className="flex flex-wrap gap-2">
                            {['all', 'urgent', 'reminder', 'general'].map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    aria-pressed={filter === key}
                                    onClick={() => setFilter(key)}
                                    className={`min-h-[44px] cursor-pointer rounded-full border px-4 text-sm font-semibold transition-colors ${filter === key ? 'border-indigo-700 bg-indigo-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}
                                >
                                    {key === 'all' ? t('announcements.filterAll') : t(`announcements.type.${key}`)}
                                </button>
                            ))}
                        </div>

                        {shown.length === 0 ? (
                            <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center shadow-sm">
                                <p className="m-0 text-slate-700">{t('announcements.noneInFilter', { type: t(`announcements.type.${filter}`).toLowerCase() })}</p>
                                <button type="button" onClick={() => setFilter('all')} className="mt-3 inline-flex min-h-[44px] cursor-pointer items-center border-0 bg-transparent p-0 text-sm font-bold text-indigo-700 underline">
                                    {t('announcements.showAllTypes')}
                                </button>
                            </div>
                        ) : (
                            <>
                                {pinned.length > 0 && (
                                    <section aria-labelledby="ann-pinned">
                                        <h2 id="ann-pinned" className="m-0 mb-3 flex items-center gap-2 text-xl font-bold text-slate-900">
                                            <FontAwesomeIcon icon={faThumbtack} className="text-indigo-600" aria-hidden="true" /> {t('announcements.pinned')}
                                        </h2>
                                        <ul className={SECTION}>
                                            {pinned.map((item) => <AnnouncementRow key={item.id} item={item} isNew={isNew(item)} defaultOpen t={t} />)}
                                        </ul>
                                    </section>
                                )}
                                {monthKeys.map((key) => (
                                    <section key={key} aria-labelledby={`ann-${key}`}>
                                        <h2 id={`ann-${key}`} className="m-0 mb-3 text-xl font-bold text-slate-900">{monthLabel(key)}</h2>
                                        <ul className={SECTION}>
                                            {months[key].map((item) => <AnnouncementRow key={item.id} item={item} isNew={isNew(item)} defaultOpen={isNew(item)} t={t} />)}
                                        </ul>
                                    </section>
                                ))}
                            </>
                        )}
                    </>
                )}

            </div>
        </div>
    );
}
