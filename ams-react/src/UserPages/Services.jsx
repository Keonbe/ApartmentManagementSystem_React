import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faSearch,
    faTimes,
    faArrowRight,
    faStar,
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { useLang } from '../config/i18n';
import InlineAlert from '../Components/InlineAlert';
import { clickable } from '../utils/clickable';
import { getServiceAppearance } from '../config/serviceAppearance';
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

    // Define all available services in a single unified list
    const allServices = useMemo(() => {
        const list = [
            {
                id: 'pay-bills',
                key: 'service_pay_bills_active',
                title: t('services.billPayments.title'),
                description: t('services.billPayments.desc'),
                buttonText: t('services.billPayments.btn'),
                path: '/pay-bills',
                categoryTag: 'Billing & Utilities',
            },
            {
                id: 'parking',
                key: 'service_parking_active',
                title: t('services.parking.title'),
                description: t('services.parking.desc'),
                buttonText: t('services.parking.btn'),
                path: '/parking-reservation',
                categoryTag: 'Vehicle & Parking',
            },
            {
                id: 'maintenance',
                key: 'service_maintenance_active',
                title: t('services.maintenance.title'),
                description: t('services.maintenance.desc'),
                buttonText: t('services.maintenance.btn'),
                path: '/maintenance-request',
                categoryTag: 'Repairs & Upkeep',
            },
            {
                id: 'cctv',
                key: 'service_cctv_active',
                title: t('services.cctv.title'),
                description: t('services.cctv.desc'),
                buttonText: t('services.cctv.btn'),
                path: '/cctv-request',
                categoryTag: 'Security & Safety',
            },
            {
                id: 'visitor-management',
                key: 'service_visitor_management_active',
                title: t('services.visitors.title'),
                description: t('services.visitors.desc'),
                buttonText: t('services.visitors.btn'),
                path: '/visitor-management',
                categoryTag: 'Access & Guests',
            },
            ...(activeCatalogCount > 0
                ? [
                      {
                          id: 'addons',
                          key: null,
                          title: t('services.addons.title'),
                          description: t('services.addons.desc'),
                          buttonText: t('services.addons.btn'),
                          path: '/service-catalog',
                          categoryTag: `${activeCatalogCount} ${t('services.servicesAvailable')}`,
                      },
                  ]
                : []),
            {
                id: 'my-requests',
                key: null,
                title: t('services.myRequests.title'),
                description: t('services.myRequests.desc'),
                buttonText: t('services.myRequests.btn'),
                path: '/my-requests',
                categoryTag: 'Tracking & Status',
            },
            {
                id: 'announcements',
                key: null,
                title: t('services.announcements.title'),
                description: t('services.announcements.desc'),
                buttonText: t('services.announcements.btn'),
                path: '/announcements',
                categoryTag: 'Notice Board',
            },
            {
                id: 'payment-history',
                key: null,
                title: t('services.paymentHistory.title'),
                description: t('services.paymentHistory.desc'),
                buttonText: t('services.paymentHistory.btn'),
                path: '/payment-history',
                categoryTag: 'Billing Ledger',
            },
        ];

        // Filter out services disabled by system settings
        const enabled = list.filter((s) => isKeyEnabled(s.key));

        // Attach customizable visual appearance (preset color + preset icon)
        return enabled.map((item) => {
            const appearance = getServiceAppearance(item.id, settings);
            return {
                ...item,
                appearance,
            };
        });
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
                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
                        <div className="space-y-2">
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                <FontAwesomeIcon icon={faStar} className="text-amber-500 text-[11px]" />
                                <span>{t('services.badgeHub')}</span>
                            </div>
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
                        {filteredServices.map((service) => {
                            const { colorConfig, icon } = service.appearance;

                            return (
                                <div
                                    key={service.id}
                                    {...clickable(() => navigate(service.path))}
                                    className={`service-hub-card group relative bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-7 flex flex-col justify-between transition-all duration-200 hover:-translate-y-1.5 hover:shadow-xl hover:border-slate-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${colorConfig.hoverBorder}`}
                                >
                                    <div className="space-y-5">
                                        {/* Card Top Row: Prominent Preset Icon Box & Category Badge */}
                                        <div className="flex items-start justify-between gap-3">
                                            <div
                                                className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center border shadow-xs transition-transform duration-300 group-hover:scale-105 ${colorConfig.bgLight} ${colorConfig.borderLight} ${colorConfig.text}`}
                                            >
                                                <FontAwesomeIcon icon={icon} className="text-2xl sm:text-3xl" />
                                            </div>
                                            <span
                                                className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase border ${colorConfig.badge}`}
                                            >
                                                {service.categoryTag}
                                            </span>
                                        </div>

                                        {/* Service Title & Detailed Description */}
                                        <div className="space-y-2 pt-1">
                                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 m-0 group-hover:text-indigo-600 transition-colors">
                                                {service.title}
                                            </h2>
                                            <p className="text-slate-500 text-sm leading-relaxed m-0 line-clamp-3">
                                                {service.description}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Bottom Action CTA Button */}
                                    {/* The label gives way first (truncates), so a longer Filipino button
                                        label stays on one line and every card keeps the same footer. */}
                                    <div className="pt-5 mt-6 border-t border-slate-100 flex items-center justify-between gap-3">
                                        <span className="min-w-0 truncate text-xs font-semibold text-slate-400 group-hover:text-slate-600 transition-colors">
                                            {t('services.badgeHub')}
                                        </span>
                                        <button
                                            type="button"
                                            tabIndex={-1}
                                            aria-hidden="true"
                                            className={`inline-flex shrink-0 max-w-full items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold leading-tight shadow-sm transition-all group-hover:scale-[1.03] border-0 cursor-pointer ${colorConfig.btn}`}
                                        >
                                            <span>{service.buttonText}</span>
                                            <FontAwesomeIcon
                                                icon={faArrowRight}
                                                className="text-xs transition-transform duration-200 group-hover:translate-x-1"
                                            />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
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
