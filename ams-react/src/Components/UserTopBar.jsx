import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserCircle, faChevronDown, faSignOutAlt, faBars, faTimes } from '@fortawesome/free-solid-svg-icons';

export default function UserTopBar({ hasRentedRoom, username = "Username" }) {
    const navigate = useNavigate();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <nav className="w-full bg-[#3b4276] px-6 md:px-8 py-4 shadow-md sticky top-0 z-50">
            <div className="w-full flex justify-between items-center">
                <div className="flex items-center space-x-6">
                    {/*AMS Logo*/}
                    <div
                        onClick={() => navigate('/home')}
                        className="text-white font-serif text-3xl italic font-bold tracking-wider cursor-pointer select-none transition-transform duration-200 hover:scale-105"
                    >
                        AMS
                    </div>
                    {/*Desktop Links*/}
                    <div className="hidden md:flex items-center space-x-6">
                        <button
                            onClick={() => navigate('/home')}
                            className="text-white/90 hover:text-white font-medium text-sm transition-all duration-200 border-0 bg-transparent cursor-pointer hover:-translate-y-0.5 relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-white after:transition-all hover:after:w-full"
                        >
                            Home
                        </button>
                        {hasRentedRoom && (
                            <>
                                <button
                                    onClick={() => navigate('/services')}
                                    className="text-white/90 hover:text-white font-medium text-sm transition-all duration-200 border-0 bg-transparent cursor-pointer hover:-translate-y-0.5 relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-white after:transition-all hover:after:w-full"
                                >
                                    Services
                                </button>
                                <button
                                    onClick={() => navigate('/current-room')}
                                    className="text-white/90 hover:text-white font-medium text-sm transition-all duration-200 border-0 bg-transparent cursor-pointer hover:-translate-y-0.5 relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-white after:transition-all hover:after:w-full"
                                >
                                    Current Room
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/*Desktop Profile Dropdown*/}
                <div className="hidden md:block relative" ref={dropdownRef}>
                    <button
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="flex items-center space-x-2 text-white/90 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border-0 bg-transparent cursor-pointer transition-all duration-200 select-none outline-none"
                    >
                        <FontAwesomeIcon
                            icon={faChevronDown}
                            className={`text-xs transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
                        />
                        <FontAwesomeIcon icon={faUserCircle} className="text-lg" />
                        <span className="font-medium text-sm">{username}</span>
                    </button>

                    {isDropdownOpen && (
                        <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-50 overflow-hidden">
                            <button
                                onClick={() => {
                                    sessionStorage.removeItem("loggedInUser");
                                    setIsDropdownOpen(false);
                                    navigate('/');
                                }}
                                className="w-full px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 flex items-center space-x-2 transition-colors border-0 bg-transparent text-left cursor-pointer font-medium"
                            >
                                <FontAwesomeIcon icon={faSignOutAlt} className="text-xs" />
                                <span>Logout</span>
                            </button>
                        </div>
                    )}
                </div>

                {/*Mobile Hamburger Toggle*/}
                <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="md:hidden text-white hover:text-white/80 transition-colors bg-transparent border-0 cursor-pointer text-xl outline-none"
                >
                    <FontAwesomeIcon icon={isMobileMenuOpen ? faTimes : faBars} />
                </button>
            </div>

            {/*Mobile Dropdown Panel*/}
            {isMobileMenuOpen && (
                <div className="md:hidden absolute top-full left-0 w-full bg-[#3b4276] border-t border-white/10 shadow-xl flex flex-col min-h-[280px] justify-between p-6 box-border transition-all animate-fade-in">
                    {/*Top Section: Navigation Links*/}
                    <div className="flex flex-col space-y-4">
                        <button
                            onClick={() => {
                                setIsMobileMenuOpen(false);
                                navigate('/home');
                            }}
                            className="text-white/90 hover:text-white text-left font-medium text-base py-2 border-0 bg-transparent cursor-pointer"
                        >
                            Home
                        </button>
                        {hasRentedRoom && (
                            <>
                                <button
                                    onClick={() => {
                                        setIsMobileMenuOpen(false);
                                        navigate('/services');
                                    }}
                                    className="text-white/90 hover:text-white text-left font-medium text-base py-2 border-0 bg-transparent cursor-pointer"
                                >
                                    Services
                                </button>
                                <button
                                    onClick={() => {
                                        setIsMobileMenuOpen(false);
                                        navigate('/current-room');
                                    }}
                                    className="text-white/90 hover:text-white text-left font-medium text-base py-2 border-0 bg-transparent cursor-pointer"
                                >
                                    Current Room
                                </button>
                            </>
                        )}
                    </div>

                    {/*Bottom Section: User Options & Logout*/}
                    <div className="pt-4 border-t border-white/10 flex flex-col space-y-4 w-full">
                        {/*Displaying Username Profile Meta Information*/}
                        <div className="flex items-center space-x-2 text-white/70 px-1 select-none">
                            <FontAwesomeIcon icon={faUserCircle} className="text-xl" />
                            <span className="font-medium text-sm">{username}</span>
                        </div>

                        <button
                            onClick={() => {
                                sessionStorage.removeItem("loggedInUser");
                                setIsMobileMenuOpen(false);
                                navigate('/');
                            }}
                            className="w-full bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-xl font-medium text-center shadow-md border-0 cursor-pointer flex items-center justify-center space-x-2 text-base"
                        >
                            <FontAwesomeIcon icon={faSignOutAlt} />
                            <span>Logout</span>
                        </button>
                    </div>
                </div>
            )}
        </nav>
    );
}