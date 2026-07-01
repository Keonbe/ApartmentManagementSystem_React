import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars, faTimes } from '@fortawesome/free-solid-svg-icons';

export default function GuestTopBar({ onLoginClick }) {
    const navigate = useNavigate();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    return (
        <nav className="w-full bg-[#3b4276] px-6 md:px-8 py-4 shadow-md sticky top-0 z-50">
            <div className="w-full flex justify-between items-center">
                <div className="flex items-center space-x-6">
                    {/*AMS Logo*/}
                    <div
                        onClick={() => navigate('/')}
                        className="text-white font-serif text-3xl italic font-bold tracking-wider cursor-pointer select-none transition-transform duration-200 hover:scale-105"
                    >
                        AMS
                    </div>
                    {/*Desktop Links*/}
                    <button
                        onClick={() => navigate('/')}
                        className="hidden md:inline-block text-white/90 hover:text-white font-medium text-sm transition-all duration-200 border-0 bg-transparent cursor-pointer hover:-translate-y-0.5 relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-white after:transition-all hover:after:w-full"
                    >
                        Home
                    </button>
                </div>

                {/*Desktop Action*/}
                <div className="hidden md:block">
                    <button
                        onClick={onLoginClick}
                        className="bg-[#6366f1] hover:bg-[#4f46e5] hover:scale-105 active:scale-95 text-white px-6 py-1.5 rounded-md font-medium text-sm shadow-md hover:shadow-indigo-500/30 transition-all duration-200 border-0 cursor-pointer"
                    >
                        Login
                    </button>
                </div>

                {/*Mobile Hamburger Toggle*/}
                <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="md:hidden text-white hover:text-white/80 transition-colors bg-transparent border-0 cursor-pointer text-xl outline-none"
                >
                    <FontAwesomeIcon icon={isMenuOpen ? faTimes : faBars} />
                </button>
            </div>

            {/*Mobile Dropdown Panel*/}
            {isMenuOpen && (
                <div className="md:hidden absolute top-full left-0 w-full bg-[#3b4276] border-t border-white/10 shadow-xl flex flex-col min-h-[200px] justify-between p-6 box-border transition-all animate-fade-in">
                    {/*Top Section: Navigation*/}
                    <div className="flex flex-col space-y-4">
                        <button
                            onClick={() => {
                                setIsMenuOpen(false);
                                navigate('/');
                            }}
                            className="text-white/90 hover:text-white text-left font-medium text-base py-2 border-0 bg-transparent cursor-pointer"
                        >
                            Home
                        </button>
                    </div>

                    {/*Bottom Section: Action Trigger*/}
                    <div className="pt-6 border-t border-white/10 w-full">
                        <button
                            onClick={() => {
                                setIsMenuOpen(false);
                                onLoginClick();
                            }}
                            className="w-full bg-[#6366f1] hover:bg-[#4f46e5] text-white py-3 rounded-xl font-medium text-center shadow-md border-0 cursor-pointer text-base"
                        >
                            Login
                        </button>
                    </div>
                </div>
            )}
        </nav>
    );
}