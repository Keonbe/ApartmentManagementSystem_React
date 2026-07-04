import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileInvoiceDollar, faParking, faWrench, faVideo } from '@fortawesome/free-solid-svg-icons';

export default function Services() {
    const navigate = useNavigate();

    const serviceList = [
        {
            id: 1,
            title: 'Bill Payments',
            description: 'View outstanding apartment utility statement accounts and settle monthly balances securely.',
            icon: faFileInvoiceDollar,
            buttonText: 'Pay Now',
            path: '/pay-bills',
        },
        {
            id: 2,
            title: 'Parking Reservation',
            description: 'Check slot availability charts and reserve motorcycle or vehicle parking spaces.',
            icon: faParking,
            buttonText: 'Reserve Now',
            path: '/parking-reservation',
        },
        {
            id: 3,
            title: 'Maintenance Request',
            description: 'Submit technical service tickets for unit repairs, electrical fixtures, or plumbing issues.',
            icon: faWrench,
            buttonText: 'Request Now',
            path: '/maintenance-request',
        },
        {
            id: 4,
            title: 'CCTV Footage Request',
            description: 'File formal security review logs to request administrative access to corridor camera recording archives.',
            icon: faVideo,
            buttonText: 'File Request',
            path: '/cctv-request',
        },
    ];

    return (
        <div className="w-full min-h-[calc(100vh-76px)] bg-slate-50 py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-[1400px] space-y-8 flex flex-col justify-start text-left">

                {/*Page Title*/}
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

                {/*Services Grid*/}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full">
                    {serviceList.map((service) => (
                        <div
                            key={service.id}
                            className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col sm:flex-row items-center sm:items-stretch space-y-4 sm:space-y-0 sm:space-x-6 hover:shadow-md hover:border-slate-200/80 transition-all duration-200 group"
                        >
                            {/*Left Rounded Icon Box*/}
                            <div className="w-24 h-24 sm:w-32 sm:h-auto rounded-xl flex items-center justify-center text-white flex-shrink-0 shadow-sm bg-slate-100 transition-transform duration-300 group-hover:scale-105">
                                <FontAwesomeIcon
                                    icon={service.icon}
                                    className="text-3xl sm:text-4xl text-[#3b4276]"
                                />
                            </div>

                            {/*Right Metadata Row*/}
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

                                {/*Action Trigger Button Layout*/}
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