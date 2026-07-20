import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileInvoiceDollar, faParking, faWrench, faVideo, faListAlt, faBullhorn, faHistory, faHourglassHalf } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';

export default function Services() {
    const navigate = useNavigate();

    //1.StaticBaseServicesListMappedToSystemSettingKeys
    const allServices = [
        {
            id: 1,
            key: 'service_pay_bills_active',
            title: 'Bill Payments',
            description: 'View outstanding apartment utility statement accounts and settle monthly balances securely.',
            icon: faFileInvoiceDollar,
            buttonText: 'Pay Now',
            path: '/pay-bills',
        },
        {
            id: 2,
            key: 'service_parking_active',
            title: 'Parking Reservation',
            description: 'Check slot availability charts and reserve motorcycle or vehicle parking spaces.',
            icon: faParking,
            buttonText: 'Reserve Now',
            path: '/parking-reservation',
        },
        {
            id: 3,
            key: 'service_maintenance_active',
            title: 'Maintenance Request',
            description: 'Submit technical service tickets for unit repairs, electrical fixtures, or plumbing issues.',
            icon: faWrench,
            buttonText: 'Request Now',
            path: '/maintenance-request',
        },
        {
            id: 4,
            key: 'service_cctv_active',
            title: 'CCTV Footage Request',
            description: 'File formal security review logs to request administrative access to corridor camera recording archives.',
            icon: faVideo,
            buttonText: 'File Request',
            path: '/cctv-request',
        },
        {
            id: 5,
            key: null, //AlwaysActiveSystemUtility
            title: 'My Requests',
            description: 'Track the status and timeline of all your submitted service, parking, and CCTV requests.',
            icon: faListAlt,
            buttonText: 'View Requests',
            path: '/my-requests',
        },
        {
            id: 6,
            key: null, //AlwaysActiveSystemUtility
            title: 'Announcements',
            description: 'Read important memos, scheduled maintenance notices, and general building updates.',
            icon: faBullhorn,
            buttonText: 'Read Memos',
            path: '/announcements',
        },
        {
            id: 7,
            key: null, //AlwaysActiveSystemUtility
            title: 'Payment History',
            description: 'Review your past monthly billing invoices and download official payment receipts.',
            icon: faHistory,
            buttonText: 'View History',
            path: '/payment-history',
        },
    ];

    const [visibleServices, setVisibleServices] = useState([]);
    const [loading, setLoading] = useState(true);

    //2.FetchActiveSystemSettingsOnLoad
    useEffect(() => {
        const loadServiceVisibility = async () => {
            try {
                const res = await api.get('/get_system_settings.php');
                if (res.data.success && res.data.settings) {
                    const settings = res.data.settings;
                    
                    //FilterOnlyEnabledServices
                    const filtered = allServices.filter(s => {
                        if (!s.key) return true; //AlwaysShowUtilitiesLikeHistoryAndMyRequests
                        return settings[s.key] === undefined || settings[s.key] === 'true' || settings[s.key] === true;
                    });
                    setVisibleServices(filtered);
                } else {
                    setVisibleServices(allServices);
                }
            } catch (err) {
                console.error("Failed to load modular service states:", err);
                setVisibleServices(allServices);
            } finally {
                setLoading(false);
            }
        };

        loadServiceVisibility();
    }, []);

    if (loading) {
        return (
            <div className="w-full min-h-[calc(100vh-76px)] flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center space-y-3 text-slate-500">
                    <FontAwesomeIcon icon={faHourglassHalf} className="text-3xl text-indigo-500 animate-spin" />
                    <p className="text-sm font-semibold m-0">Loading Available Services...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full min-h-[calc(100vh-76px)] bg-slate-50 py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-[1400px] space-y-8 flex flex-col justify-start text-left">

                {/*PageTitle*/}
                <div className="border-b border-slate-200 pb-4">
                    <h1
                        className="text-4xl font-sans font-extrabold m-0 tracking-tight select-none"
                        style={{ color: '#3b4276' }}
                    >
                        Services
                    </h1>
                    <p className="text-slate-500 text-sm mt-1 m-0">
                        Select an administrative action or utility assignment below to manage your tenancy requirements.
                    </p>
                </div>

                {/*ServicesGrid*/}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full">
                    {visibleServices.map((service) => (
                        <div
                            key={service.id}
                            className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col sm:flex-row items-center sm:items-stretch space-y-4 sm:space-y-0 sm:space-x-6 hover:shadow-md hover:border-slate-200/80 transition-all duration-200 group"
                        >
                            {/*LeftRoundedIconBox*/}
                            <div className="w-24 h-24 sm:w-32 sm:h-auto rounded-xl flex items-center justify-center text-white flex-shrink-0 shadow-sm bg-slate-100 transition-transform duration-300 group-hover:scale-105">
                                <FontAwesomeIcon
                                    icon={service.icon}
                                    className="text-3xl sm:text-4xl text-[#3b4276]"
                                />
                            </div>

                            {/*RightMetadataRow*/}
                            <div className="flex flex-col justify-between flex-grow text-center sm:text-left min-w-0 space-y-4">
                                <div className="space-y-1">
                                    <h2
                                        className="text-xl font-bold m-0 tracking-tight"
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
                                        className="w-full sm:w-auto bg-[#6366f1] hover:bg-[#4f46e5] hover:scale-[1.03] active:scale-[0.97] text-white font-semibold px-6 py-2 rounded-xl text-xs transition-all duration-200 shadow-sm hover:shadow-indigo-500/20 border-0 cursor-pointer"
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