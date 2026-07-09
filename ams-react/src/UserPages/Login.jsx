import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import api from "../api/axiosConfig";
import ApartmentPic from "../assets/Apartment_Pic.png";

export default function Login({ onRegisterRedirect, onAdminRedirect, onHomeRedirect }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [message, setMessage] = useState('');

    const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');

    try {
        const res = await api.post("/login.php", {
            email_address: email.trim(),
            password
        });

        if (res.data.valid) {
            sessionStorage.setItem("loggedInUser", JSON.stringify(res.data.user));
            
            if (res.data.role === 'admin') {
                onAdminRedirect();
            } else {
                onHomeRedirect();
            }
        } else {
            setMessage(res.data.message || "Incorrect email or password");
        }
    } catch (error) {
        setMessage("Unable to log in. Please try again.");
    }
};

    return (
        <div className="min-h-screen w-full grid grid-cols-1 md:grid-cols-12 overflow-hidden bg-white text-left">
            <style>
                {`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,700&display=swap');
          .custom-ams-logo {
            font-family: 'Playfair Display', Georgia, serif !important;
          }
        `}
            </style>

            {/*Left Splash Panel with Image Background and Deepened Blue Overlay Layer*/}
            <div className="hidden md:flex md:col-span-6 relative flex-col items-center justify-center p-12 text-center text-white select-none overflow-hidden">
                <img 
                    src={ApartmentPic} 
                    alt="Apartment Splash" 
                    className="absolute inset-0 w-full h-full object-cover object-center z-0"
                />
                {/*Opacity increased to 90% for a stronger blue tint*/}
                <div className="absolute inset-0 bg-[#3b4276]/90 z-10"></div>
                
                <div className="relative z-20 flex flex-col items-center justify-center">
                    <h1 className="custom-ams-logo text-8xl italic font-bold tracking-wider mb-2 text-white border-0 bg-transparent uppercase">
                        AMS
                    </h1>
                    <div className="w-48 border-t border-white/20 my-2"></div>
                    <p className="text-xs font-light uppercase tracking-widest text-white/60 m-0">
                        Apartment Management System
                    </p>
                </div>
            </div>

            {/*Right Form Panel*/}
            <div className="col-span-1 md:col-span-6 flex flex-col justify-center items-center p-8 sm:p-16 bg-white">
                <div className="w-full max-w-md flex flex-col items-center">

                    {/*Mobile View Branding Logo*/}
                    <div className="md:hidden flex flex-col items-center mb-8 select-none">
                        <h1
                            className="custom-ams-logo text-6xl italic font-bold tracking-wider border-0 bg-transparent uppercase m-0"
                            style={{ color: '#3b4276' }}
                        >
                            AMS
                        </h1>
                        <div className="w-24 border-t my-1.5" style={{ borderColor: 'rgba(59, 66, 118, 0.2)' }}></div>
                        <p
                            className="text-[9px] font-medium uppercase tracking-widest m-0 text-center"
                            style={{ color: '#64748b' }}
                        >
                            Apartment Management System
                        </p>
                    </div>

                    <div className="w-full space-y-6">
                        <h2 className="text-3xl font-extrabold text-center mb-8 border-0" style={{ color: '#3b4276' }}>
                            Login
                        </h2>

                        <form className="space-y-5" onSubmit={handleSubmit}>
                            <div>
                                <input
                                    type="email"
                                    placeholder="Email Address"
                                    className="w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base"
                                    style={{ color: '#1e293b' }}
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>

                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Password"
                                    className="w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base"
                                    style={{ color: '#1e293b' }}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
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
                            <p className="h-5 text-center text-sm text-red-500">
                                {message}
                            </p>
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
        </div>
    );
}