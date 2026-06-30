import React from 'react';

export default function UserHome({ onCardClick, username = "Username" }) {
    return (
        <div className="w-full min-h-[calc(100vh-76px)] bg-slate-50 flex flex-col items-center py-10 px-6">
            <div className="w-full max-w-4xl text-left space-y-6">
                {/*Welcome Message*/}
                <h1 className="text-5xl font-sans font-medium text-[#636bf1] m-0">
                    Welcome, {username}
                </h1>

                {/*Featured Apartment Card*/}
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

                    <div className="p-8 text-white space-y-2">
                        <h2 className="text-3xl font-bold text-white m-0">Apartment in Silang</h2>
                        <p className="text-white/80 text-base m-0">Maguyam Silang, Cavite</p>
                        <p className="text-white/90 text-sm pt-4 m-0">Available Rooms: 4/14</p>
                    </div>
                </div>
            </div>
        </div>
    );
}