import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileInvoiceDollar, faParking, faWrench, faVideo, faListAlt, faBullhorn, faHistory, faHourglassHalf, faIdBadge } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { useLang } from '../config/i18n';
import '../assets/styles/responsive/user/services.responsive.css';

export default function Services() {
    const navigate = useNavigate();
    const { t } = useLang();

    //1.StaticBaseServicesListMappedToSystemSettingKeys
    const allServices = [
        {
            id: 1,
            key: 'service_pay_bills_active',
            title: t('services.billPayments.title'),
            description: t('services.billPayments.desc'),
            icon: faFileInvoiceDollar,
            buttonText: t('services.billPayments.btn'),
            path: '/pay-bills',
        },
        {
            id: 2,
            key: 'service_parking_active',
            title: t('services.parking.title'),
            description: t('services.parking.desc'),
            icon: faParking,
            buttonText: t('services.parking.btn'),
            path: '/parking-reservation',
        },
        {
            id: 3,
            key: 'service_maintenance_active',
            title: t('services.maintenance.title'),
            description: t('services.maintenance.desc'),
            icon: faWrench,
            buttonText: t('services.maintenance.btn'),
            path: '/maintenance-request',
        },
        {
            id: 4,
            key: 'service_cctv_active',
            title: t('services.cctv.title'),
            description: t('services.cctv.desc'),
            icon: faVideo,
            buttonText: t('services.cctv.btn'),
            path: '/cctv-request',
        },
        {
            id: 5,
            key: 'service_visitor_management_active',
            title: t('services.visitors.title'),
            description: t('services.visitors.desc'),
            icon: faIdBadge,
            buttonText: t('services.visitors.btn'),
            path: '/visitor-management',
        },
        {
            id: 6,
            key: null, //AlwaysActiveSystemUtility
            title: t('services.myRequests.title'),
            description: t('services.myRequests.desc'),
            icon: faListAlt,
            buttonText: t('services.myRequests.btn'),
            path: '/my-requests',
        },
        {
            id: 7,
            key: null, //AlwaysActiveSystemUtility
            title: t('services.announcements.title'),
            description: t('services.announcements.desc'),
            icon: faBullhorn,
            buttonText: t('services.announcements.btn'),
            path: '/announcements',
        },
        {
            id: 8,
            key: null, //AlwaysActiveSystemUtility
            title: t('services.paymentHistory.title'),
            description: t('services.paymentHistory.desc'),
            icon: faHistory,
            buttonText: t('services.paymentHistory.btn'),
            path: '/payment-history',
        },
    ];

    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);

    // 2. Fetch Active System Settings On Load
    useEffect(() => {
        const loadServiceVisibility = async () => {
            try {
                const res = await api.get('/get_system_settings.php');
                if (res.data.success && res.data.settings) {
                    setSettings(res.data.settings);
                }
            } catch (err) {
                console.error("Failed to load modular service states:", err);
            } finally {
                setLoading(false);
            }
        };

        loadServiceVisibility();
    }, []);

    // Filter Only Enabled Services dynamically so language changes re-evaluate translations instantly
    const visibleServices = allServices.filter(s => {
        if (!s.key) return true; // Always show utilities like History and My Requests
        if (!settings) return true;
        return settings[s.key] === undefined || settings[s.key] === 'true' || settings[s.key] === true;
    });

    if (loading) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center space-y-3 text-slate-500">
                    <FontAwesomeIcon icon={faHourglassHalf} className="text-3xl text-indigo-500 animate-spin" />
                    <p className="text-sm font-semibold m-0">{t('services.loading')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="services-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-6 sm:py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-[1400px] space-y-6 sm:space-y-8 flex flex-col justify-start text-left">

                {/*PageTitle*/}
                <div className="border-b border-slate-200 pb-4">
                    <h1
                        className="services-heading text-3xl sm:text-4xl font-sans font-extrabold m-0 tracking-tight select-none"
                        style={{ color: '#3b4276' }}
                    >
                        {t('services.heading')}
                    </h1>
                    <p className="services-subtext text-slate-500 text-sm mt-1 m-0">
                        {t('services.subtext')}
                    </p>
                </div>

                {/*ServicesGrid*/}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 w-full">
                    {visibleServices.map((service) => (
                        <div
                            key={service.id}
                            className="services-card bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sm:p-6 flex flex-col sm:flex-row items-center sm:items-stretch space-y-4 sm:space-y-0 sm:space-x-6 hover:shadow-md hover:border-slate-200/80 transition-all duration-200 group"
                        >
                            {/*LeftRoundedIconBox*/}
                            <div className="services-icon-box w-20 h-20 sm:w-32 sm:h-auto rounded-xl flex items-center justify-center text-white flex-shrink-0 shadow-sm bg-slate-100 transition-transform duration-300 group-hover:scale-105">
                                <FontAwesomeIcon
                                    icon={service.icon}
                                    className="text-2xl sm:text-4xl text-[#3b4276]"
                                />
                            </div>

                            {/*RightMetadataRow*/}
                            <div className="flex flex-col justify-between flex-grow text-center sm:text-left min-w-0 space-y-4 w-full">
                                <div className="space-y-1">
                                    <h2
                                        className="services-card-title text-lg sm:text-xl font-bold m-0 tracking-tight"
                                        style={{ color: '#1e293b' }}
                                    >
                                        {service.title}
                                    </h2>
                                    <p className="text-slate-500 text-xs leading-relaxed max-w-xl m-0 line-clamp-2">
                                        {service.description}
                                    </p>
                                </div>

                                {/*ActionTriggerButtonLayout*/}
                                <div className="w-full sm:w-auto self-center sm:self-start">
                                    <button
                                        onClick={() => navigate(service.path)}
                                        className="services-action-btn w-full sm:w-auto bg-[#6366f1] hover:bg-[#4f46e5] hover:scale-[1.03] active:scale-[0.97] text-white font-semibold px-6 py-2.5 sm:py-2 rounded-xl text-sm sm:text-xs transition-all duration-200 shadow-sm hover:shadow-indigo-500/20 border-0 cursor-pointer flex items-center justify-center"
                                    >
                                        {service.buttonText}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </div>
    );
}