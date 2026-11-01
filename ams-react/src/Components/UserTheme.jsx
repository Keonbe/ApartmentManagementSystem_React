import { useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSun, faMoon, faGem } from '@fortawesome/free-solid-svg-icons';
import ApartmentPic from '../assets/Apartment_Pic.webp';
import { publicAssetUrl } from '../api/fileUrl';
import { THEMES, useTheme, useGlassAppearance, glassTintGradient } from '../config/theme';
import { useLang } from '../config/i18n';

const THEME_ICONS = { light: faSun, dark: faMoon, glass: faGem };
const AUTH_THEMES = ['light', 'dark'];

// Wraps user-side content in the chosen theme (.ut-root .ut-<theme>, see
// assets/styles/themes.user.css). `force` pins one (Home is always Glass);
// `backdrop={false}` skips the Glass photo for a second scope on the same
// screen (the chat widget).
export function UserThemeScope({ force, backdrop = true, className = '', children }) {
    const { theme } = useTheme();
    const active = THEMES.includes(force) ? force : theme;
    const ref = useRef(null);
    const shown = useRef(active);

    // Cross-fade colours when the theme changes in place (not on first paint).
    useEffect(() => {
        if (shown.current === active) return undefined;
        shown.current = active;
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
export function ThemePicker({ variant = 'menu' }) {
    const { theme, setTheme } = useTheme();
    const { t } = useLang();

    const groupLabel = t('theme.label');
    // The sign-in pages offer Light and Dark only (App.jsx shows Glass as Dark there).
    const shownTheme = variant === 'floating' && theme === 'glass' ? 'dark' : theme;
    const button = (id) => {
        const active = shownTheme === id;
        // Icon above the word, each button a third of the row: "Maliwanag" fits
        // as well as "Light", so switching language never resizes the menu.
        const base = 'flex items-center justify-center border-0 cursor-pointer transition-all duration-200 font-bold';
        const look = variant === 'menu'
            ? `flex-1 basis-0 min-w-0 flex-col gap-0.5 min-h-[50px] px-1 rounded-lg text-[11px] leading-tight ${active ? 'bg-indigo-600 text-white shadow-sm' : 'bg-transparent text-slate-600 hover:text-slate-900 hover:bg-white/60'}`
            : variant === 'bar'
                ? `w-9 h-8 text-xs ${active ? 'bg-white text-brand' : 'bg-transparent text-white/70 hover:text-white'}`
                : variant === 'floating'
                    ? `w-10 h-10 rounded-lg text-sm ${active ? 'bg-indigo-600 text-white shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`
                    : `flex-1 basis-0 min-w-0 flex-col gap-0.5 min-h-[50px] px-1 rounded-lg text-[11px] leading-tight ${active ? 'bg-white text-brand' : 'bg-transparent text-white/75 hover:text-white'}`;
        const iconOnly = variant === 'bar' || variant === 'floating';
        return (
            <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={iconOnly ? t(`theme.${id}`) : undefined}
                title={t(`theme.${id}`)}
                onClick={() => setTheme(id)}
                className={`${base} ${look}`}
            >
                <FontAwesomeIcon icon={THEME_ICONS[id]} aria-hidden="true" />
                {!iconOnly && <span className="max-w-full truncate">{t(`theme.${id}`)}</span>}
            </button>
        );
    };

    if (variant === 'bar') {
        return (
            <div role="radiogroup" aria-label={groupLabel} className="flex items-center bg-white/10 rounded-lg overflow-hidden select-none">
                {THEMES.map(button)}
            </div>
        );
    }

    // Top-right of the sign-in, registration and reset pages (App.jsx AuthThemeLayout),
    // which have no TopBar. Light and Dark only. Light-palette classes, so it follows the theme too.
    if (variant === 'floating') {
        return (
            <div role="radiogroup" aria-label={groupLabel} className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg select-none">
                {AUTH_THEMES.map(button)}
            </div>
        );
    }

    if (variant === 'drawer') {
        return (
            <div className="flex items-center justify-between gap-3 px-2">
                <span className="text-white/70 text-xs font-bold shrink-0">{groupLabel}</span>
                <div role="radiogroup" aria-label={groupLabel} className="flex flex-1 max-w-[16rem] items-center gap-1 bg-white/10 rounded-xl p-1 select-none">
                    {THEMES.map(button)}
                </div>
            </div>
        );
    }

    return (
        <div className="px-3 py-2">
            <p className="m-0 mb-1.5 px-1 text-xs font-bold text-slate-500">{groupLabel}</p>
            <div role="radiogroup" aria-label={groupLabel} className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 select-none">
                {THEMES.map(button)}
            </div>
        </div>
    );
}

// EN / FIL switch floating over the sign-in, registration and reset pages
// (App.jsx AuthThemeLayout), next to the floating theme switch: those pages
// have no TopBar. Same look as ThemePicker variant="floating".
export function FloatingLangSwitch() {
    const { lang, setLang, t } = useLang();
    return (
        <div role="group" aria-label={t('topbar.language')} className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-lg select-none">
            {[['en', 'EN'], ['fil', 'FIL']].map(([id, label]) => (
                <button
                    key={id}
                    type="button"
                    aria-pressed={lang === id}
                    onClick={() => setLang(id)}
                    className={`h-10 min-w-[2.75rem] px-2 rounded-lg text-xs font-bold border-0 cursor-pointer transition-all duration-200 ${lang === id ? 'bg-indigo-600 text-white shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
