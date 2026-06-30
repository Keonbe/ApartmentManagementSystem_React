import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserCircle, faChevronDown, faSignOutAlt } from '@fortawesome/free-solid-svg-icons';

export default function UserTopBar({ hasRentedRoom, username = "Username" }) {
    const navigate = useNavigate();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
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
        <nav className="w-full bg-[#3b4276] px-8 py-4 flex justify-between items-center shadow-md sticky top-0 z-50">
            <div className="flex items-center space-x-6">
                {/*AMS Logo*/}
                <div
                    onClick={() => navigate('/home')}
                    className="text-white font-serif text-3xl italic font-bold tracking-wider cursor-pointer select-none transition-transform duration-200 hover:scale-105"
                >
                    AMS
                </div>
                <button
                    onClick={() => navigate('/home')}
                    className="text-white/90 hover:text-white font-medium text-sm transition-all duration-200 border-0 bg-transparent cursor-pointer hover:-translate-y-0.5 relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-white after:transition-all hover:after:w-full"
                >
                    Home
                </button>

                {/*Conditional Navigation Links*/}
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

            {/*Profile Section Container*/}
            <div className="relative" ref={dropdownRef}>
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

                {/*Logout Dropdown Menu*/}
                {isDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-50 overflow-hidden animation-fade-in">
                        <button
                            onClick={() => {
                                setIsDropdownOpen(false);
                                navigate('/');
                            }}
                            className="w-full px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 flex items-center space-x-2 transition-colors duration-150 border-0 bg-transparent text-left cursor-pointer font-medium"
                        >
                            <FontAwesomeIcon icon={faSignOutAlt} className="text-xs" />
                            <span>Logout</span>
                        </button>
                    </div>
                )}
            </div>
        </nav>
    );
}