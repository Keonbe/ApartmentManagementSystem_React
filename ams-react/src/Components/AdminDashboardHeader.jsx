import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell } from '@fortawesome/free-solid-svg-icons';

const Header = ({ title = "Dashboard" }) => {
  return (
    <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 select-none">
      <h2 className="text-2xl font-bold text-slate-800 m-0">{title}</h2>
      <div className="flex items-center gap-6">
        <button className="text-slate-500 hover:text-slate-700 transition-colors relative bg-transparent border-0 cursor-pointer p-1 outline-none">
          <FontAwesomeIcon icon={faBell} className="text-xl" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
        </button>
        <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold shadow-md cursor-pointer text-sm">
          Ad
        </div>
      </div>
    </header>
  );
};

export default Header;