import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHourglassHalf, faConciergeBell, faBroom, faTshirt, faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { useLang } from '../config/i18n';
import InlineAlert from '../Components/InlineAlert';
import '../assets/styles/responsive/user/services.responsive.css';

//MapsTheServiceCatalogIconColumnOntoRealFontAwesomeIcons
const CATALOG_ICONS = { faBroom, faTshirt, faConciergeBell };
const iconFor = (name) => CATALOG_ICONS[name] || faConciergeBell;

export default function ServiceCatalog() {
    const navigate = useNavigate();
    const { t } = useLang();

    const [settings, setSettings] = useState(null);
    const [catalog, setCatalog] = useState([]);
    const [loading, setLoading] = useState(true);
    // A failed load used to show "no services available", which is not true.
    const [loadFailed, setLoadFailed] = useState(false);
    const [loadAttempt, setLoadAttempt] = useState(0);

    //1.FetchSettingsAndTheActiveCatalogInParallel-SamePatternAsServices.jsx
    useEffect(() => {
        const loadCatalog = async () => {
            setLoadFailed(false);
            try {
                const [settingsRes, catalogRes] = await Promise.all([
                    api.get('/get_system_settings.php'),
                    api.get('/get_service_catalog.php?active=1'),
                ]);

                if (settingsRes.data.success && settingsRes.data.settings) {
                    setSettings(settingsRes.data.settings);
                } else {
                    setLoadFailed(true);
                }
                if (catalogRes.data.success) {
                    setCatalog(catalogRes.data.services || []);
                } else {
                    setLoadFailed(true);
                }
            } catch (err) {
                console.error("Failed to load service catalog:", err);
                setLoadFailed(true);
            } finally {
                setLoading(false);
            }
        };

        loadCatalog();
    }, [loadAttempt]);

    //2.OnlyShowRowsWhoseCategoryToggleIsAlsoOn (unknown settings: show none)
    const visibleCatalog = catalog.filter(row => {
        const key = `service_${row.category}_active`;
        if (!settings) return false;
        return settings[key] === undefined || settings[key] === 'true' || settings[key] === true;
    });

    if (loading) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center space-y-3 text-slate-500">
                    <FontAwesomeIcon icon={faHourglassHalf} className="text-3xl text-indigo-500 animate-spin" />
                    <p className="text-sm font-semibold m-0">{t('serviceCatalog.loading')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="services-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-6 sm:py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-[1400px] space-y-6 sm:space-y-8 flex flex-col justify-start text-left">

                {/*BackLink*/}
                <button
                    onClick={() => navigate('/services')}
                    className="inline-flex items-center gap-2 self-start text-sm font-semibold text-slate-500 hover:text-indigo-600 bg-transparent border-0 cursor-pointer p-0 transition-colors"
                >
                    <FontAwesomeIcon icon={faArrowLeft} className="text-xs" />
                    {t('serviceCatalog.back')}
                </button>

                {/*PageTitle*/}
                <div className="border-b border-slate-200 pb-4">
                    <h1
                        className="services-heading text-3xl sm:text-4xl font-sans font-extrabold m-0 tracking-tight select-none text-brand"
                    >
                        {t('serviceCatalog.heading')}
                    </h1>
                    <p className="services-subtext text-slate-500 text-sm mt-1 m-0">
                        {t('serviceCatalog.subtext')}
                    </p>
                </div>

                {/*EmptyState-ReachableViaDirectURLAfterAllCategoriesAreDisabled*/}
                {loadFailed ? (
                    <InlineAlert>
                        {t('common.loadFailed')}{' '}
                        <button type="button" onClick={() => { setLoading(true); setLoadAttempt((n) => n + 1); }} className="ml-1 min-h-[36px] px-3 rounded-lg bg-white border border-rose-300 text-rose-800 text-sm font-bold cursor-pointer hover:bg-rose-100">
                            {t('common.retry')}
                        </button>
                    </InlineAlert>
                ) : visibleCatalog.length === 0 ? (
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-md p-10 text-center">
                        <FontAwesomeIcon icon={faConciergeBell} className="text-4xl text-slate-200 mb-4" />
                        <h3 className="text-lg font-bold text-slate-700 m-0">{t('serviceCatalog.empty')}</h3>
                        <p className="text-sm text-slate-500 mt-2 mb-0">{t('serviceCatalog.emptyDesc')}</p>
                    </div>
                ) : (
                    <div className="stagger-children grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 w-full">
                        {visibleCatalog.map(row => (
                            <div
                                key={row.id}
                                className="services-card card-interactive relative bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sm:p-6 flex flex-col sm:flex-row items-center sm:items-stretch space-y-4 sm:space-y-0 sm:space-x-6 hover:shadow-md hover:border-slate-200/80 transition-all duration-200 group"
                            >
                                {/*LeftRoundedIconBox*/}
                                <div className="services-icon-box w-20 h-20 sm:w-32 sm:h-auto rounded-xl flex items-center justify-center text-white flex-shrink-0 shadow-sm bg-slate-100 transition-transform duration-300 group-hover:scale-105">
                                    <FontAwesomeIcon
                                        icon={iconFor(row.icon)}
                                        className="text-2xl sm:text-4xl text-brand"
                                    />
                                </div>

                                {/*RightMetadataRow*/}
                                <div className="flex flex-col justify-between flex-grow text-center sm:text-left min-w-0 space-y-4 w-full">
                                    <div className="space-y-1">
                                        <h2
                                            className="services-card-title text-lg sm:text-xl font-bold m-0 tracking-tight"
                                        >
                                            {row.name}
                                        </h2>
                                        <p className="text-slate-500 text-xs leading-relaxed max-w-xl m-0 line-clamp-2">
                                            {row.description}
                                        </p>
                                        <p className="text-xs font-bold text-indigo-600 m-0 pt-1">
                                            ₱{row.price.toLocaleString()}
                                            <span className="ml-1 font-medium text-slate-500">/ {row.pricingUnit}</span>
                                        </p>
                                    </div>

                                    {/*ActionTriggerButtonLayout*/}
                                    <div className="w-full sm:w-auto self-center sm:self-start">
                                        <button
                                            onClick={() => navigate(`/service-booking?serviceId=${row.id}`)}
                                            className="services-action-btn btn-interactive after:absolute after:inset-0 after:content-[''] w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 hover:scale-[1.03] active:scale-[0.97] text-white font-semibold px-6 py-2.5 sm:py-2 rounded-xl text-sm sm:text-xs transition-all duration-200 shadow-sm hover:shadow-indigo-500/20 border-0 cursor-pointer flex items-center justify-center"
                                        >
                                            {t('services.book')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

            </div>
        </div>
    );
}
