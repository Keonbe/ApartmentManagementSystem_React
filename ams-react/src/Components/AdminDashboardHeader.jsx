import React from 'react';
import { Bell } from 'lucide-react';

const Header = ({ title = "Dashboard" }) => {
  return (
    <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
      <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
      <div className="flex items-center gap-6">
        <button className="text-slate-500 hover:text-slate-700 transition-colors relative">
          <Bell size={24} />
          <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
        </button>
        <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold shadow-md cursor-pointer">
          Ad
        </div>
      </div>
    </header>
  );
};

export default Header;