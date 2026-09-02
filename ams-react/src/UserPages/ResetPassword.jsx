import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/axiosConfig';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import ApartmentPic from "../assets/Apartment_Pic.png";
import '../assets/styles/responsive/user/login.responsive.css';

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const email = searchParams.get('email');
    const token = searchParams.get('token');

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    useEffect(() => {
        if (!email || !token) {
            setMessage("Invalid password reset link.");
        }
    }, [email, token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('');

        if (password !== confirmPassword) {
            setMessage("Passwords do not match.");
            return;
        }

        if (password.length < 6) {
            setMessage("Password must be at least 6 characters.");
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await api.post("/reset_password.php", {
                email,
                token,
                new_password: password
            });

            if (res.data.success) {
                setIsSuccess(true);
                setMessage(res.data.message);
            } else {
                setMessage(res.data.message);
            }
        } catch (error) {
            setMessage("Failed to reset password. The link might be expired.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="login-page-root min-h-screen w-full grid grid-cols-1 md:grid-cols-12 overflow-hidden bg-slate-50 text-left">
            <style>
                {`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,700&display=swap');
          .custom-ams-logo {
            font-family: 'Playfair Display', Georgia, serif !important;
          }
        `}
            </style>

            {/*LeftSplashPanelWithImageBackground*/}
            <div className="hidden md:flex md:col-span-6 relative flex-col items-center justify-center p-12 text-center text-white select-none overflow-hidden">
                <img 
                    src={ApartmentPic} 
                    alt="Apartment Splash" 
                    className="absolute inset-0 w-full h-full object-cover object-center z-0"
                />
                <div className="absolute inset-0 bg-[#3b4276]/90 z-10"></div>
                
                <div className="relative z-20 flex flex-col items-center justify-center">
                    <h1 className="custom-ams-logo text-8xl italic font-bold tracking-wider mb-2 text-white border-0 bg-transparent uppercase m-0">
                        AMS
                    </h1>
                    <div className="w-48 border-t border-white/20 my-3"></div>
                    <p className="text-xs font-light uppercase tracking-widest text-white/70 m-0">
                        Apartment Management System
                    </p>
                </div>
            </div>

            {/*RightFormPanel*/}
            <div className="login-form-panel col-span-1 md:col-span-6 flex flex-col justify-center items-center p-8 sm:p-16 bg-white shadow-xl md:shadow-none">
                <div className="w-full max-w-md flex flex-col items-center">

                    {/*MobileBrandingLogo*/}
                    <div className="login-mobile-logo md:hidden flex flex-col items-center mb-6 select-none">
                        <h1 className="custom-ams-logo text-6xl italic font-bold tracking-wider border-0 bg-transparent uppercase m-0" style={{ color: '#3b4276' }}>
                            AMS
                        </h1>
                        <div className="w-24 border-t my-1.5" style={{ borderColor: 'rgba(59, 66, 118, 0.2)' }}></div>
                        <p className="text-[9px] font-medium uppercase tracking-widest m-0 text-center text-slate-500">
                            Apartment Management System
                        </p>
                    </div>

                    <div className="w-full space-y-6">
                        <div className="text-center">
                            <h2 className="login-heading text-3xl font-extrabold tracking-tight border-0 m-0" style={{ color: '#3b4276' }}>
                                Create New Password
                            </h2>
                            <p className="text-xs text-slate-500 mt-1 m-0">
                                Enter a new secure password for {email}
                            </p>
                        </div>

                        {isSuccess ? (
                            <div className="space-y-4 text-center mt-6">
                                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold rounded-xl">
                                    {message}
                                </div>
                                <button
                                    onClick={() => navigate('/login')}
                                    className="w-full bg-[#3b4276] text-white py-3 px-4 rounded-xl font-bold text-sm hover:bg-[#2c325c] transition-colors border-0 cursor-pointer shadow-lg mt-2 box-border"
                                >
                                    Proceed to Login
                                </button>
                            </div>
                        ) : (
                            <form className="space-y-5" onSubmit={handleSubmit}>
                                {(!email || !token) ? (
                                    <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 text-xs rounded-xl text-center font-semibold">
                                        {message}
                                    </div>
                                ) : (
                                    <>
                                        <div className="space-y-1.5">
                                            <div className="flex justify-between items-center">
                                                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">New Password</label>
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type={showPassword ? "text" : "password"}
                                                    placeholder="••••••••••••"
                                                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 text-sm transition-all shadow-inner pr-12 box-border"
                                                    required
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    minLength={6}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute right-4 top-3.5 text-slate-400 hover:text-slate-600 transition-colors bg-transparent border-0 cursor-pointer"
                                                >
                                                    <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">Confirm Password</label>
                                            <div className="relative">
                                                <input
                                                    type={showPassword ? "text" : "password"}
                                                    placeholder="••••••••••••"
                                                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 text-sm transition-all shadow-inner pr-12 box-border"
                                                    required
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    minLength={6}
                                                />
                                            </div>
                                        </div>

                                        {message && (
                                            <p className="text-center text-xs font-semibold text-rose-500 m-0 pt-1">
                                                {message}
                                            </p>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="w-full bg-[#6366f1] hover:bg-[#4f46e5] active:scale-[0.98] text-white font-bold py-3.5 rounded-xl shadow-md hover:shadow-indigo-200 transition-all border-0 cursor-pointer text-sm tracking-wide disabled:opacity-70 mt-2"
                                        >
                                            {isSubmitting ? 'Resetting...' : 'Reset Password'}
                                        </button>
                                    </>
                                )}
                            </form>
                        )}
                        
                        <div className="text-center pt-2 border-t border-slate-100">
                            <p className="text-xs text-slate-500 m-0">
                                <Link to="/login" className="text-indigo-600 font-bold hover:underline no-underline">
                                    Return to Login
                                </Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
