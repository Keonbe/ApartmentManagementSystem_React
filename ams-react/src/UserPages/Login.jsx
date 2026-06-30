import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';

export default function Login({ onRegisterRedirect }) {
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div className="min-h-screen w-full grid grid-cols-1 md:grid-cols-12 overflow-hidden bg-white text-left">
            {/*Google Fonts*/}
            <style>
                {`
            @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,700&display=swap');
            .custom-ams-logo {
            font-family: 'Playfair Display', Georgia, serif !important;
            }
        `}
            </style>

            {/*Left Splash Panel*/}
            <div className="hidden md:flex md:col-span-6 bg-[#3b4276] flex-col items-center justify-center p-12 text-center text-white select-none">
                <h1 className="custom-ams-logo text-8xl italic font-bold tracking-wider mb-2 text-white border-0 bg-transparent uppercase">
                    AMS
                </h1>
                <div className="w-48 border-t border-white/20 my-2"></div>
                <p className="text-xs font-light uppercase tracking-widest text-white/60 m-0">
                    Apartment Management System
                </p>
            </div>

            {/*Right Form Panel*/}
            <div className="col-span-1 md:col-span-6 flex flex-col justify-center items-center p-8 sm:p-16 bg-white">
                <div className="w-full max-w-md space-y-6">
                    <h2 className="text-3xl font-extrabold text-[#3b4276] text-center mb-8 border-0">Login</h2>

                    <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
                        <div>
                            <input
                                type="email"
                                placeholder="Email Address"
                                className="w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base"
                            />
                        </div>

                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder="Password"
                                className="w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 transition-colors bg-transparent border-0 cursor-pointer"
                            >
                                <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
                            </button>
                        </div>

                        <div className="text-right">
                            <a href="#forgot" className="text-sm text-indigo-500 hover:underline font-medium">Forgot Password?</a>
                        </div>

                        <button type="submit" className="w-full bg-[#6366f1] hover:bg-[#4f46e5] text-white font-medium py-3.5 rounded-xl shadow-lg shadow-indigo-100 transition-all mt-2 border-0 cursor-pointer text-base">
                            Login
                        </button>
                    </form>

                    <div className="text-center pt-4">
                        <p className="text-sm text-slate-500 m-0">
                            Don't have an Account?{' '}
                            <button onClick={onRegisterRedirect} className="text-indigo-600 font-semibold hover:underline bg-transparent border-0 p-0 cursor-pointer">
                                Register
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}