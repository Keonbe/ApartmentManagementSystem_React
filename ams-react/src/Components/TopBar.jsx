import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faSignOutAlt, faBars, faTimes, faCog, faSignInAlt } from '@fortawesome/free-solid-svg-icons';

export default function TopBar({ hasRentedRoom, isLoggedIn, username, onLoginClick }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const dropdownRef = useRef(null);

    {/* Close dropdown menus dynamically when clicking outside active areas */}
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    {/* Dynamic extraction framework to compute initials from username string parameters */}
    const getInitials = () => {
        if (!username || username === 'Guest') return 'U';
        const nameParts = username.split(' ');
        const firstInitial = nameParts[0] ? nameParts[0].charAt(0) : '';
        const lastInitial = nameParts[1] ? nameParts[1].charAt(0) : '';
        return `${firstInitial}${lastInitial}`.toUpperCase();
    };

    {/* Helper utilities to parse active routing styling highlights dynamically */}
    const isActive = (path) => location.pathname === path;
    const navItemClass = (path) => `text-sm font-medium transition-all duration-200 border-0 bg-transparent cursor-pointer hover:-translate-y-0.5 relative after:absolute after:bottom-0 after:left-0 after:h-0.5 after:bg-white after:transition-all hover:after:w-full ${isActive(path) ? 'text-white font-extrabold after:w-full' : 'text-white/90 hover:text-white after:w-0'}`;

    return (
        <nav className="w-full bg-[#3b4276] px-6 md:px-12 py-4 shadow-md sticky top-0 z-50 select-none box-border">
            <div className="w-full flex justify-between items-center h-[44px]">
                
                {/* Brand Branding Identity Node Layout */}
                <div className="flex items-center space-x-8">
                    <style>
                        {`
                            @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,700&display=swap');
                            .ams-topbar-logo {
                                font-family: 'Playfair Display', Georgia, serif !important;
                            }
                        `}
                    </style>
                    <div
                        onClick={() => navigate('/home')}
                        className="ams-topbar-logo text-white text-3xl italic font-bold tracking-wider cursor-pointer transition-transform duration-200 hover:scale-105"
                    >
                        AMS
                    </div>

                    {/* Central Links Menu Blocks Layer Context Grid */}
                    <div className="hidden md:flex items-center space-x-6">
                        <button onClick={() => navigate('/home')} className={navItemClass('/home')}>
                            Home
                        </button>
                        {isLoggedIn && (
                            <button onClick={() => navigate('/services')} className={navItemClass('/services')}>
                                Services
                            </button>
                        )}
                        {isLoggedIn && hasRentedRoom && (
                            <button onClick={() => navigate('/profile-settings')} className={navItemClass('/profile-settings')}>
                                Current Room
                            </button>
                        )}
                    </div>
                </div>

                {/* Desktop Account Session Interaction Block Workspace */}
                <div className="hidden md:block">
                    {isLoggedIn ? (
                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="flex items-center space-x-3 text-white/90 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-xl border-0 bg-transparent cursor-pointer transition-all duration-200 select-none outline-none"
                            >
                                <span className="font-bold text-sm tracking-wide">{username}</span>
                                
                                {/* Dynamic Google-Style Avatar Widget */}
                                <div className="w-9 h-9 rounded-full bg-indigo-600 border border-white/20 text-white flex items-center justify-center text-xs font-black tracking-wider shadow-inner transition-transform group-hover:scale-105">
                                    {getInitials()}
                                </div>
                                
                                <FontAwesomeIcon
                                    icon={faChevronDown}
                                    className={`text-[10px] opacity-70 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
                                />
                            </button>

                            {/* Floating Submenu Accounts Selection List Node Options */}
                            {isDropdownOpen && (
                                <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 py-1.5 z-50 overflow-hidden animate-fade-in text-left">
                                    <button
                                        onClick={() => {
                                            setIsDropdownOpen(false);
                                            navigate('/profile-settings');
                                        }}
                                        className="w-full px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center space-x-2.5 transition-colors border-0 bg-transparent text-left cursor-pointer font-semibold"
                                    >
                                        <FontAwesomeIcon icon={faCog} className="text-slate-400 text-xs" />
                                        <span>Profile Settings</span>
                                    </button>
                                    <div className="border-t border-slate-100 my-1"></div>
                                    <button
                                        onClick={() => {
                                            sessionStorage.removeItem("loggedInUser");
                                            setIsDropdownOpen(false);
                                            navigate('/login');
                                        }}
                                        className="w-full px-4 py-3 text-sm text-rose-600 hover:bg-rose-50 flex items-center space-x-2.5 transition-colors border-0 bg-transparent text-left cursor-pointer font-bold"
                                    >
                                        <FontAwesomeIcon icon={faSignOutAlt} className="text-xs" />
                                        <span>Logout</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <button
                            onClick={onLoginClick}
                            className="bg-white/10 hover:bg-white/20 text-white font-bold px-5 py-2.5 rounded-xl text-xs border-0 cursor-pointer transition-all duration-150 flex items-center space-x-1.5"
                        >
                            <FontAwesomeIcon icon={faSignInAlt} />
                            <span>Log In</span>
                        </button>
                    )}
                </div>

                {/* Mobile Hamburger Layout Button Trigger Node */}
                <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="md:hidden text-white hover:text-white/80 transition-colors bg-transparent border-0 cursor-pointer text-xl outline-none"
                >
                    <FontAwesomeIcon icon={isMobileMenuOpen ? faTimes : faBars} />
                </button>
            </div>

            {/* Mobile Adaptive Full View Overlay Drawer Panel Layout */}
            {isMobileMenuOpen && (
                <div className="md:hidden absolute top-full left-0 w-full bg-[#3b4276] border-t border-white/10 shadow-2xl flex flex-col min-h-[280px] justify-between p-6 box-border transition-all z-50 text-left animate-fade-in">
                    <div className="flex flex-col space-y-3">
                        <button
                            onClick={() => {
                                setIsMobileMenuOpen(false);
                                navigate('/home');
                            }}
                            className={`text-left text-base py-2.5 font-bold border-0 bg-transparent cursor-pointer ${isActive('/home') ? 'text-white' : 'text-white/70'}`}
                        >
                            Home
                        </button>
                        {isLoggedIn && (
                            <button
                                onClick={() => {
                                    setIsMobileMenuOpen(false);
                                    navigate('/services');
                                }}
                                className={`text-left text-base py-2.5 font-bold border-0 bg-transparent cursor-pointer ${isActive('/services') ? 'text-white' : 'text-white/70'}`}
                            >
                                Services
                            </button>
                        )}
                        {isLoggedIn && hasRentedRoom && (
                            <button
                                onClick={() => {
                                    setIsMobileMenuOpen(false);
                                    navigate('/profile-settings');
                                }}
                                className={`text-left text-base py-2.5 font-bold border-0 bg-transparent cursor-pointer ${isActive('/profile-settings') ? 'text-white' : 'text-white/70'}`}
                            >
                                Current Room
                            </button>
                        )}
                    </div>

                    <div className="pt-4 border-t border-white/10 flex flex-col space-y-4 w-full">
                        {isLoggedIn ? (
                            <>
                                <div className="flex items-center space-x-3 px-1 select-none">
                                    <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-black tracking-wider shadow-md">
                                        {getInitials()}
                                    </div>
                                    <span className="text-white font-bold text-sm">{username}</span>
                                </div>
                                <button
                                    onClick={() => {
                                        setIsMobileMenuOpen(false);
                                        navigate('/profile-settings');
                                    }}
                                    className="flex items-center space-x-2 text-white/90 hover:text-white text-left font-semibold text-sm py-2 border-0 bg-transparent cursor-pointer"
                                >
                                    <FontAwesomeIcon icon={faCog} className="text-slate-300 text-xs" />
                                    <span>Profile Settings</span>
                                </button>
                                <button
                                    onClick={() => {
                                        sessionStorage.removeItem("loggedInUser");
                                        setIsMobileMenuOpen(false);
                                        navigate('/login');
                                    }}
                                    className="w-full bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-xl font-bold text-center shadow-md border-0 cursor-pointer flex items-center justify-center space-x-2 text-sm transition-all"
                                >
                                    <FontAwesomeIcon icon={faSignOutAlt} />
                                    <span>Logout</span>
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => {
                                    setIsMobileMenuOpen(false);
                                    onLoginClick();
                                }}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold text-center shadow-md border-0 cursor-pointer flex items-center justify-center space-x-2 text-sm transition-all"
                            >
                                <FontAwesomeIcon icon={faSignInAlt} />
                                <span>Sign In</span>
                            </button>
                        )}
                    </div>
                </div>
            )}
        </nav>
    );
}