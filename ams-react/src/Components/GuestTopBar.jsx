import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function GuestTopBar({ onLoginClick }) {
    const navigate = useNavigate();

    return (
        <nav className="w-full bg-[#3b4276] px-8 py-4 flex justify-between items-center shadow-md sticky top-0 z-50">
            <div className="flex items-center space-x-6">
                {/*AMS Logo*/}
                <div
                    onClick={() => navigate('/')}
                    className="text-white font-serif text-3xl italic font-bold tracking-wider cursor-pointer select-none transition-transform duration-200 hover:scale-105"
                >
                    AMS
                </div>
                <button
                    onClick={() => navigate('/')}
                    className="text-white/90 hover:text-white font-medium text-sm transition-all duration-200 border-0 bg-transparent cursor-pointer hover:-translate-y-0.5 relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-white after:transition-all hover:after:w-full"
                >
                    Home
                </button>
            </div>

            <button
                onClick={onLoginClick}
                className="bg-[#6366f1] hover:bg-[#4f46e5] hover:scale-105 active:scale-95 text-white px-6 py-1.5 rounded-md font-medium text-sm shadow-md hover:shadow-indigo-500/30 transition-all duration-200 border-0 cursor-pointer"
            >
                Login
            </button>
        </nav>
    );
}