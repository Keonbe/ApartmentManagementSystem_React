import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react';

const AUTO_MS = 4000;

const prefersReducedMotion = () =>
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// A phone has no pointer to hover with, so nothing would ever pause the strip
// while someone reads a chip: there it moves only when swiped.
const hasHover = () =>
    typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover)').matches;

// The apartment rules on the Preview page as one line of chips that pages
// through on its own (every AUTO_MS) on screens with a pointer, with ← →
// buttons. It pauses while the pointer or keyboard focus is on it, never moves
// for "reduce motion", and can be swiped on touch screens. A page always starts
// on a whole chip.
export default function RulesCarousel({ rules, getTitle, onPick, onViewAll, t }) {
    const trackRef = useRef(null);
    const [paused, setPaused] = useState(false);
    const [canPrev, setCanPrev] = useState(false);
    const [canNext, setCanNext] = useState(false);

    const update = useCallback(() => {
        const el = trackRef.current;
        if (!el) return;
        setCanPrev(el.scrollLeft > 2);
        setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    }, []);

    // One page forward (back to the start after the last) or back.
    const page = useCallback((dir) => {
        const el = trackRef.current;
        if (!el) return;
        const chips = [...el.children];
        const smooth = prefersReducedMotion() ? 'auto' : 'smooth';
        if (dir > 0) {
            if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 2) {
                el.scrollTo({ left: 0, behavior: smooth });
                return;
            }
            const edge = el.scrollLeft + el.clientWidth;
            const next = chips.find((c) => c.offsetLeft + c.offsetWidth > edge + 1);
            el.scrollTo({ left: next ? next.offsetLeft : el.scrollWidth, behavior: smooth });
        } else {
            const target = Math.max(0, el.scrollLeft - el.clientWidth);
            const prev = chips.find((c) => c.offsetLeft >= target - 1);
            el.scrollTo({ left: prev ? prev.offsetLeft : 0, behavior: smooth });
        }
    }, []);

    // The chips' text (so their widths) changes with the language, not only with the rules.
    const titles = rules.map(getTitle).join('\u0001');
    useEffect(() => {
        update();
        const el = trackRef.current;
        if (!el) return undefined;
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
        observer?.observe(el);
        return () => observer?.disconnect();
    }, [titles, update]);

    // Auto-advance only when there is more than one page.
    const overflowing = canPrev || canNext;
    useEffect(() => {
        if (paused || !overflowing || prefersReducedMotion() || !hasHover()) return undefined;
        const timer = setInterval(() => page(1), AUTO_MS);
        return () => clearInterval(timer);
    }, [paused, overflowing, page]);

    const arrow = 'hidden sm:inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:text-indigo-700 hover:border-indigo-300 cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-default';
    // Fade the chip cut off at an edge instead of slicing it.
    const fade = canPrev && canNext
        ? 'linear-gradient(to right, transparent, #000 24px, #000 calc(100% - 24px), transparent)'
        : canNext ? 'linear-gradient(to right, #000 calc(100% - 24px), transparent)'
            : canPrev ? 'linear-gradient(to right, transparent, #000 24px)' : 'none';

    return (
        <section
            aria-label={t('houseRules.title')}
            aria-roledescription="carousel"
            className="w-full min-w-0 flex-shrink-0 rounded-2xl border border-slate-200/60 bg-white px-3 sm:px-4 py-2.5 shadow-sm"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false); }}
        >
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                {/* Short labels here (the full title is the section's aria-label and the
                    tooltip): the long Filipino title and link used to leave room for less
                    than one chip. The title gives way (truncates) before the chips do. */}
                <h3 title={t('houseRules.title')} className="m-0 flex min-w-0 shrink items-center gap-1.5 text-xs font-bold text-slate-800">
                    <ShieldCheck aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-indigo-600" />
                    <span className="hidden min-w-0 truncate xl:inline">{t('houseRules.stripTitle')}</span>
                </h3>
                {overflowing && (
                    <button type="button" className={arrow} onClick={() => page(-1)} disabled={!canPrev} aria-label={t('houseRules.prev')}>
                        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                    </button>
                )}
                <ul
                    ref={trackRef}
                    onScroll={update}
                    className="relative m-0 flex min-w-[8rem] flex-1 list-none flex-nowrap items-center gap-2 overflow-x-auto p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    style={{ maskImage: fade, WebkitMaskImage: fade }}
                >
                    {rules.map((rule) => (
                        <li key={rule.id} className="shrink-0">
                            <button
                                type="button"
                                title={getTitle(rule)}
                                onClick={() => onPick(rule)}
                                className="inline-flex cursor-pointer items-center whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-3 py-0.5 text-xs font-medium text-slate-700 transition-all duration-150 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                            >
                                {getTitle(rule)}
                            </button>
                        </li>
                    ))}
                    {rules.length === 0 && <li className="whitespace-nowrap text-xs text-slate-500">{t('houseRules.empty')}</li>}
                </ul>
                {overflowing && (
                    <button type="button" className={arrow} onClick={() => page(1)} aria-label={t('houseRules.next')}>
                        <ChevronRight aria-hidden="true" className="h-4 w-4" />
                    </button>
                )}
                {rules.length > 0 && (
                    <button type="button" onClick={onViewAll} title={t('houseRules.viewAll')} className="inline-flex flex-shrink-0 whitespace-nowrap cursor-pointer items-center border-0 bg-transparent p-0 text-xs font-semibold text-indigo-600 transition-colors hover:text-indigo-800">
                        {t('houseRules.viewAllShort')}
                    </button>
                )}
            </div>
        </section>
    );
}
