import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faSearch, faTimes } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { useLang } from '../config/i18n';
import InlineAlert from '../Components/InlineAlert';
import ServiceHubCard from '../Components/ServiceHubCard';
import { getServiceAppearance } from '../config/serviceAppearance';
import { SERVICE_HUB_CARDS } from '../config/serviceHubCards';
import { isServiceSwitchOn } from '../config/settingsSchema';
import '../assets/styles/responsive/user/services.responsive.css';

export default function Services() {
    const navigate = useNavigate();
    const { t } = useLang();

    const [settings, setSettings] = useState(null);
    const [catalog, setCatalog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');

    // Fetch system settings & active service catalog
    useEffect(() => {
        let isMounted = true;
        const loadServiceVisibility = async () => {
            setLoadFailed(false);
            try {
                const [settingsRes, catalogRes] = await Promise.all([
                    api.get('/get_system_settings.php'),
                    api.get('/get_service_catalog.php?active=1'),
                ]);

                if (!isMounted) return;

                if (settingsRes.data.success && settingsRes.data.settings) {
                    setSettings(settingsRes.data.settings);
                } else {
                    setLoadFailed(true);
                }
                if (catalogRes.data.success) {
                    setCatalog(catalogRes.data.services || []);
                }
            } catch (err) {
                if (isMounted) {
                    console.error('Failed to load modular service states:', err);
                    setLoadFailed(true);
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        loadServiceVisibility();

        // Listen for live system settings sync from admin customization
        const handleSettingsSync = (e) => {
            if (e?.detail) {
                setSettings((prev) => ({ ...(prev || {}), ...e.detail }));
            }
        };
        window.addEventListener('system-settings-updated', handleSettingsSync);

        return () => {
            isMounted = false;
            window.removeEventListener('system-settings-updated', handleSettingsSync);
        };
    }, [loadAttempt]);

    // Check if a specific module key is enabled in admin settings
    const isKeyEnabled = useCallback(
        (key) => {
            if (!key) return true; // Account utilities are always enabled
            if (!settings) return false;
            return isServiceSwitchOn(settings[key]);
        },
        [settings]
    );

    // Active add-on services count (gated by category toggles)
    const activeCatalogCount = useMemo(() => {
        return catalog.filter((row) => isKeyEnabled(`service_${row.category}_active`)).length;
    }, [catalog, isKeyEnabled]);

    // All cards, from the list the admin appearance preview also reads
    const allServices = useMemo(() => {
        return SERVICE_HUB_CARDS
            // The add-ons card only shows while some bookable add-on is on
            .filter((card) => (card.id === 'addons' ? activeCatalogCount > 0 : isKeyEnabled(card.key)))
            .map((card) => ({
                id: card.id,
                path: card.path,
                title: t(`${card.i18n}.title`),
                description: t(`${card.i18n}.desc`),
                buttonText: t(`${card.i18n}.btn`),
                categoryTag:
                    card.id === 'addons'
                        ? `${activeCatalogCount} ${t('services.servicesAvailable')}`
                        : t(card.tagKey),
                // Admin-customised preset color + icon
                appearance: getServiceAppearance(card.id, settings),
            }));
    }, [activeCatalogCount, isKeyEnabled, settings, t]);

    // Live search filter across the single unified list
    const filteredServices = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return allServices;
        return allServices.filter((service) => {
            const titleMatch = service.title.toLowerCase().includes(query);
            const descMatch = service.description.toLowerCase().includes(query);
            const tagMatch = service.categoryTag.toLowerCase().includes(query);
            return titleMatch || descMatch || tagMatch;
        });
    }, [allServices, searchQuery]);

    // Skeleton loader with prominent cards
    if (loading) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] bg-slate-50/70 py-8 sm:py-12 px-4 sm:px-6 lg:px-12 flex justify-center">
                <div className="w-full max-w-[1400px] space-y-8 animate-pulse">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200/80">
                        <div className="space-y-3">
                            <div className="h-6 w-32 bg-slate-200 rounded-full" />
                            <div className="h-9 w-64 bg-slate-200 rounded-xl" />
                            <div className="h-4 w-96 max-w-full bg-slate-200 rounded-lg" />
                        </div>
                        <div className="h-11 w-full sm:w-80 bg-slate-200 rounded-xl" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="min-h-[240px] bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between">
                                <div className="space-y-4">
                                    <div className="flex items-start justify-between">
                                        <div className="w-16 h-16 bg-slate-200 rounded-2xl" />
                                        <div className="w-24 h-6 bg-slate-100 rounded-full" />
                                    </div>
                                    <div className="space-y-2 pt-2">
                                        <div className="h-6 w-44 bg-slate-200 rounded-md" />
                                        <div className="h-4 w-full bg-slate-100 rounded-md" />
                                        <div className="h-4 w-3/4 bg-slate-100 rounded-md" />
                                    </div>
                                </div>
                                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                                    <div className="h-4 w-20 bg-slate-100 rounded" />
                                    <div className="h-9 w-28 bg-slate-200 rounded-xl" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="services-root w-full min-h-[calc(100vh-76px)] bg-slate-50/70 py-6 sm:py-10 px-4 sm:px-6 lg:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-[1400px] space-y-6 sm:space-y-8 flex flex-col justify-start text-left">
                {/* 1. Page Header with Compact Search Bar */}
                <div className="relative pb-6 border-b border-slate-200">
                    <Link className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors mb-2 py-1 -ml-0.5 group" to="/my-room">
                        <FontAwesomeIcon icon={faChevronLeft} className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                        <span>Back to My Room</span>
                    </Link>
                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
                        <div className="space-y-2">
                            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight m-0">
                                {t('services.heading')}
                            </h1>
                            <p className="text-slate-500 text-sm sm:text-base max-w-2xl m-0 leading-relaxed">
                                {t('services.subtext')}
                            </p>
                        </div>

                        {/* Search Input Box */}
                        <div className="relative w-full md:w-80 flex-shrink-0">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                <FontAwesomeIcon icon={faSearch} className="text-sm" />
                            </div>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('services.searchPlaceholder')}
                                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs sm:text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-sm"
                                aria-label={t('services.searchPlaceholder')}
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer bg-transparent border-0"
                                    aria-label="Clear search"
                                >
                                    <FontAwesomeIcon icon={faTimes} className="text-sm" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* 2. Load Failed Warning Banner with Retry */}
                {loadFailed && (
                    <InlineAlert>
                        {t('common.loadFailed')}{' '}
                        <button
                            type="button"
                            onClick={() => {
                                setLoading(true);
                                setLoadAttempt((n) => n + 1);
                            }}
                            className="ml-1 min-h-[36px] px-3 rounded-lg bg-white border border-rose-300 text-rose-800 text-sm font-bold cursor-pointer hover:bg-rose-100 transition-colors"
                        >
                            {t('common.retry')}
                        </button>
                    </InlineAlert>
                )}

                {/* 3. Single Unified Grid (Bigger cards, no section dividers) */}
                {filteredServices.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-7 w-full">
                        {filteredServices.map((service) => (
                            <ServiceHubCard
                                key={service.id}
                                colorConfig={service.appearance.colorConfig}
                                icon={service.appearance.icon}
                                title={service.title}
                                description={service.description}
                                tag={service.categoryTag}
                                buttonText={service.buttonText}
                                onClick={() => navigate(service.path)}
                            />
                        ))}
                    </div>
                ) : (
                    /* Empty Search State */
                    <div className="w-full bg-white rounded-2xl border border-slate-200/80 p-8 sm:p-12 text-center flex flex-col items-center justify-center space-y-4 shadow-sm">
                        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-2xl">
                            <FontAwesomeIcon icon={faSearch} />
                        </div>
                        <div className="space-y-1.5 max-w-md">
                            <h3 className="text-lg font-bold text-slate-800 m-0">{t('services.noResults')}</h3>
                            <p className="text-slate-500 text-xs sm:text-sm m-0 leading-relaxed">
                                {t('services.noResultsDesc')}
                            </p>
                        </div>
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-sm transition-all border-0 cursor-pointer"
                            >
                                {t('services.clearSearch')}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
