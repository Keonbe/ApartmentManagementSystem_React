import React from 'react';

export default function Home({ onCardClick, username }) {
    return (
        <div className="w-full min-h-[calc(100vh-76px)] bg-slate-50 flex flex-col items-center py-10 px-6">
            <div className="w-full max-w-4xl text-left space-y-6">

                {/* Conditional Header Greeting */}
                <h1
                    className="text-5xl font-sans font-medium m-0 tracking-tight select-none"
                    style={{ color: '#636bf1', fontWeight: '600' }}
                >
                    {username ? `Welcome, ${username}` : "Find Your Next Home"}
                </h1>

                {/* Featured Main Listing Card */}
                <div
                    onClick={onCardClick}
                    className="w-full bg-[#636bf1] rounded-3xl overflow-hidden shadow-2xl cursor-pointer transform hover:scale-[1.01] transition-all duration-300 mt-6"
                >
                    <div className="h-80 w-full overflow-hidden bg-slate-200 relative">
                        <img
                            src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80"
                            alt="Apartment in Silang"
                            className="w-full h-full object-cover"
                        />
                    </div>

                    <div className="p-8 text-white space-y-2 text-left">
                        <h2 className="text-3xl font-bold text-white m-0 tracking-tight">Apartment in Silang</h2>
                        <p className="text-white/80 text-base m-0">Maguyam Silang, Cavite</p>
                        
                        <div className="pt-4 flex justify-between items-center border-t border-white/20 mt-4">
                            <span className="text-sm font-medium bg-white/10 px-4 py-1.5 rounded-full">
                                14 Total Units
                            </span>
                            <span className="text-sm font-semibold bg-emerald-500 text-white px-4 py-1.5 rounded-full shadow-sm">
                                Available Rooms: 4/14
                            </span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}