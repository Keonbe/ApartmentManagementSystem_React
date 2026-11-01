import { useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSun, faMoon, faGem } from '@fortawesome/free-solid-svg-icons';
import ApartmentPic from '../assets/Apartment_Pic.webp';
import { publicAssetUrl } from '../api/fileUrl';
import { THEMES, useTheme, useGlassAppearance, glassTintGradient } from '../config/theme';
import { useLang } from '../config/i18n';
import { withViewTransition } from '../utils/viewTransition';

const THEME_ICONS = { light: faSun, dark: faMoon, glass: faGem };
const AUTH_THEMES = ['light', 'dark'];
const LANGS = [['en', 'EN'], ['fil', 'FIL']];

// Wraps user-side content in the chosen theme (.ut-root .ut-<theme>, see
// assets/styles/themes.user.css). `force` pins one (Home is always Glass);
// `backdrop={false}` skips the Glass photo for a second scope on the same
// screen (the chat widget).
export function UserThemeScope({ force, backdrop = true, className = '', children }) {
    const { theme } = useTheme();
    const active = THEMES.includes(force) ? force : theme;
    const ref = useRef(null);
    const shown = useRef(active);

    // Cross-fade colours when the theme changes in place (not on first paint),
    // unless a theme View Transition is animating the change already.
    useEffect(() => {
        if (shown.current === active) return undefined;
        shown.current = active;
        if (document.documentElement.dataset.vt === 'theme') return undefined;
        const el = ref.current;
        if (!el) return undefined;
        el.classList.add('ut-switching');
        const timer = setTimeout(() => el.classList.remove('ut-switching'), 450);
        return () => {
            clearTimeout(timer);
            el.classList.remove('ut-switching');
        };
    }, [active]);

    return (
        <div ref={ref} data-theme={active} className={`ut-root ut-${active} ${className}`}>
            {active === 'glass' && backdrop && <GlassBackdrop />}
            {children}
        </div>
    );
}

// The fixed photo behind Glass pages, as the admin configured it.
export function GlassBackdrop() {
    const appearance = useGlassAppearance();
    return <GlassLayers {...appearance} className="ut-backdrop" />;
}

// Photo + tint layers. Also used by the admin's live preview, unfixed.
export function GlassLayers({ glassBgImage, glassOverlayOpacity, glassBlur, glassTint, className = '', style }) {
    const src = glassBgImage ? publicAssetUrl(glassBgImage) : ApartmentPic;
    const blur = Math.min(20, Math.max(0, Number(glassBlur) || 0));
    return (
        <div className={className} style={style} aria-hidden="true">
            <img
                key={src}
                src={src}
                alt=""
                decoding="async"
                className="ut-backdrop-img"
                // Blur bleeds transparent edges in; a slight zoom hides them.
                style={blur ? { filter: `blur(${blur}px)`, transform: 'scale(1.08)' } : undefined}
                onError={(e) => {
                    // A removed upload falls back to the built-in photo.
                    if (e.currentTarget.src !== new URL(ApartmentPic, window.location.href).href) e.currentTarget.src = ApartmentPic;
                }}
            />
            <div className="ut-backdrop-tint" style={{ backgroundImage: glassTintGradient(glassTint, glassOverlayOpacity) }} />
        </div>
    );
}

// Light / Dark / Glass switch.
//   variant="menu"   inside a light dropdown (the account menu)
//   variant="bar"    icons only, on the TopBar's coloured bar
//   variant="drawer" labelled, on the dark mobile drawer
//   variant="floating" icons only, Light and Dark, floating over the sign-in pages
// The highlight slides to the picked option, and the page changes in a circle
// spreading from the button (withViewTransition).
export function ThemePicker({ variant = 'menu' }) {
    const { theme, setTheme } = useTheme();
    const { t } = useLang();

    const groupLabel = t('theme.label');
    // The sign-in pages offer Light and Dark only (App.jsx shows Glass as Dark there).
    const shownTheme = variant === 'floating' && theme === 'glass' ? 'dark' : theme;
    const options = variant === 'floating' ? AUTH_THEMES : THEMES;
    const pick = (id, button) => {
        if (id === shownTheme) return;
        withViewTransition(() => setTheme(id), { kind: 'theme', from: button });
    };
    const button = (id) => {
        const active = shownTheme === id;
        // Icon above the word, each button a third of the row: "Maliwanag" fits
        // as well as "Light", so switching language never resizes the menu.
        const base = 'relative z-[1] flex items-center justify-center border-0 bg-transparent cursor-pointer transition-colors duration-300 font-bold';
        const look = variant === 'menu'
            ? `flex-1 basis-0 min-w-0 flex-col gap-0.5 min-h-[50px] px-1 rounded-lg text-[11px] leading-tight ${active ? 'text-white' : 'text-slate-600 hover:text-slate-900'}`
            : variant === 'bar'
                ? `w-9 h-7 rounded-md text-xs ${active ? 'text-brand' : 'text-white/70 hover:text-white'}`
                : variant === 'floating'
                    ? `w-10 h-10 rounded-lg text-sm ${active ? 'text-white' : 'text-slate-500 hover:text-slate-900'}`
                    : `flex-1 basis-0 min-w-0 flex-col gap-0.5 min-h-[50px] px-1 rounded-lg text-[11px] leading-tight ${active ? 'text-brand' : 'text-white/75 hover:text-white'}`;
        const iconOnly = variant === 'bar' || variant === 'floating';
        return (
            <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={iconOnly ? t(`theme.${id}`) : undefined}
                title={t(`theme.${id}`)}
                onClick={(e) => pick(id, e.currentTarget)}
                className={`${base} ${look}`}
            >
                <FontAwesomeIcon icon={THEME_ICONS[id]} aria-hidden="true" className={active ? 'ut-pick-pop' : undefined} />
                {!iconOnly && <span className="max-w-full truncate">{t(`theme.${id}`)}</span>}
            </button>
        );
    };
    const index = options.indexOf(shownTheme);

    if (variant === 'bar') {
        return (
            <div role="radiogroup" aria-label={groupLabel} className="relative flex items-center bg-white/10 rounded-lg p-0.5 select-none">
                <SegmentThumb index={index} count={options.length} pad={2} className="rounded-md bg-white shadow-sm" />
                {options.map(button)}
            </div>
        );
    }

    // Top-right of the sign-in, registration and reset pages (App.jsx AuthThemeLayout),
    // which have no TopBar. Light and Dark only. Light-palette classes, so it follows the theme too.
    if (variant === 'floating') {
        return (
            <div role="radiogroup" aria-label={groupLabel} className="relative flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-lg select-none">
                <SegmentThumb index={index} count={options.length} className="bg-indigo-600 shadow-sm" />
                {options.map(button)}
            </div>
        );
    }

    if (variant === 'drawer') {
        return (
            <div className="flex items-center justify-between gap-3 px-2">
                <span className="text-white/70 text-xs font-bold shrink-0">{groupLabel}</span>
                <div role="radiogroup" aria-label={groupLabel} className="relative flex flex-1 max-w-[16rem] items-center bg-white/10 rounded-xl p-1 select-none">
                    <SegmentThumb index={index} count={options.length} className="bg-white shadow-sm" />
                    {options.map(button)}
                </div>
            </div>
        );
    }

    return (
        <div className="px-3 py-2">
            <p className="m-0 mb-1.5 px-1 text-xs font-bold text-slate-500">{groupLabel}</p>
            <div role="radiogroup" aria-label={groupLabel} className="relative flex items-center rounded-xl bg-slate-100 p-1 select-none">
                <SegmentThumb index={index} count={options.length} className="bg-indigo-600 shadow-sm" />
                {options.map(button)}
            </div>
        </div>
    );
}

// The highlight behind the picked option of a row of equal-width buttons. It
// slides when the choice changes. The row needs `relative` and `pad` px of
// padding, the buttons `relative z-[1]` so they sit above it.
export function SegmentThumb({ index, count, pad = 4, className = '' }) {
    if (index < 0) return null;
    return (
        <span
            aria-hidden="true"
            className={`ut-segment-thumb pointer-events-none absolute rounded-lg ${className}`}
            style={{
                top: pad,
                bottom: pad,
                left: pad,
                width: `calc((100% - ${pad * 2}px) / ${count})`,
                transform: `translateX(${index * 100}%)`,
            }}
        />
    );
}

// EN / FIL switch with the sliding highlight; the page text cross-fades on change.
//   variant="bar"      on the TopBar's coloured bar (size="lg" in the mobile drawer)
//   variant="floating" over the sign-in, registration and reset pages
//                      (App.jsx AuthThemeLayout), next to the floating theme switch
export function LangSwitch({ variant = 'bar', size = 'sm' }) {
    const { lang, setLang, t } = useLang();
    const index = LANGS.findIndex(([id]) => id === lang);
    const floating = variant === 'floating';
    const pick = (id) => {
        if (id === lang) return;
        withViewTransition(() => setLang(id), { kind: 'lang' });
    };
    const sizeCls = floating
        ? 'h-10 min-w-[2.75rem] px-2 rounded-lg'
        : size === 'lg' ? 'min-h-[44px] min-w-[52px] px-3 rounded-md' : 'px-2.5 py-1.5 rounded-md';
    return (
        <div
            role="group"
            aria-label={t('topbar.language')}
            className={`relative grid grid-cols-2 text-xs font-bold select-none ${floating ? 'rounded-xl border border-slate-200 bg-white p-1 shadow-lg' : 'rounded-lg bg-white/10 p-0.5'}`}
        >
            <SegmentThumb
                index={index}
                count={LANGS.length}
                pad={floating ? 4 : 2}
                className={floating ? 'bg-indigo-600 shadow-sm' : 'rounded-md bg-white shadow-sm'}
            />
            {LANGS.map(([id, label]) => {
                const active = lang === id;
                const tone = floating
                    ? (active ? 'text-white' : 'text-slate-500 hover:text-slate-900')
                    : (active ? 'text-brand' : 'text-white/70 hover:text-white');
                return (
                    <button
                        key={id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => pick(id)}
                        className={`relative z-[1] border-0 bg-transparent cursor-pointer transition-colors duration-300 ${sizeCls} ${tone}`}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}

export function FloatingLangSwitch() {
    return <LangSwitch variant="floating" />;
}
