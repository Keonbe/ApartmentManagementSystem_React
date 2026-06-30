import React from 'react';

export default function GuestHome({ onCardClick }) {
    return (
        <div className="w-full min-h-[calc(100vh-76px)] bg-slate-50 flex items-center justify-center p-8">
            {/*Featured Large Apartment Card*/}
            <div
                onClick={onCardClick}
                className="w-full max-w-4xl bg-[#636bf1] rounded-3xl overflow-hidden shadow-2xl cursor-pointer transform hover:scale-[1.01] transition-all duration-300"
            >
                <div className="h-96 w-full overflow-hidden bg-slate-200 relative">
                    <img
                        src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80"
                        alt="Apartment in Silang"
                        className="w-full h-full object-cover"
                    />
                </div>

                <div className="p-8 text-white space-y-4 text-left">
                    <h1 className="text-4xl font-bold font-sans m-0 text-white">Apartment in Silang</h1>
                    <p className="text-white/80 text-lg m-0">Maguyam Silang, Cavite</p>

                    <div className="pt-4 flex justify-between items-center border-t border-white/20">
                        <span className="text-base font-medium bg-white/10 px-5 py-2 rounded-full">
                            14 Rooms
                        </span>
                        <span className="text-base font-semibold bg-emerald-500 text-white px-5 py-2 rounded-full shadow-sm">
                            Available Rooms: 4/14
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}