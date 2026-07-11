import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import api from "../api/axiosConfig";
import ApartmentPic from "../assets/Apartment_Pic.png";

export default function Registration({ onLoginRedirect }) {
    const [firstname, setFirstName] = useState('');
    const [middlename, setMiddleName] = useState('');
    const [lastname, setLastName] = useState('');
    const [suffix, setSuffix] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [conPassword, setConPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [showConfirmPass, setShowConfirmPass] = useState(false);
    const [message, setMessage] = useState('');

    const handleRegister = async (e) => {
        e.preventDefault();

        const payload = {
            first_name: firstname.trim(),
            middle_name: middlename.trim(),
            last_name: lastname.trim(),
            suffix: suffix.trim(),
            email_address: email.trim(),
            password: password,
            conPassword: conPassword
        };

        try {
            const res = await api.post("/registration.php", payload);
            if(res.data.success){
                onLoginRedirect();
            }
            else{
                setMessage(res.data.message);
            }
            
        }
        catch (e) {
            console.error("Error:", e);
        }
    }

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
            <div className="col-span-1 md:col-span-6 flex flex-col justify-center items-center p-8 bg-white">
                <div className="w-full max-w-sm flex flex-col items-center">

                    {/*Mobile View Branding Logo*/}
                    <div className="md:hidden flex flex-col items-center mb-6 select-none">
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

                    <div className="w-full space-y-4">
                        <h2 className="text-3xl font-extrabold text-center mb-6 border-0" style={{ color: '#3b4276' }}>
                            Register
                        </h2>

                        <form className="space-y-3" onSubmit={handleRegister}>
                            <div className="grid grid-cols-2 gap-3">
                                <input
                                    value={firstname}
                                    type="text"
                                    placeholder="First Name"
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base"
                                    style={{ color: '#1e293b' }}
                                    required
                                    onChange={(e) => setFirstName(e.target.value)}
                                />
                                <input
                                    value={middlename}
                                    type="text"
                                    placeholder="Middle Name (Opt)"
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base"
                                    style={{ color: '#1e293b' }}
                                    onChange={(e) => setMiddleName(e.target.value)}
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-2">
                                    <input
                                        value={lastname}
                                        type="text"
                                        placeholder="Last Name"
                                        className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base"
                                        style={{ color: '#1e293b' }}
                                        required
                                        onChange={(e) => setLastName(e.target.value)}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <input
                                        value={suffix}
                                        type="text"
                                        placeholder="Suffix (Opt)"
                                        className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base"
                                        style={{ color: '#1e293b' }}
                                        onChange={(e) => setSuffix(e.target.value)}
                                    />
                                </div>
                            </div>

                            <input
                                value={email}
                                type="email"
                                placeholder="Email Address"
                                className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base"
                                style={{ color: '#1e293b' }}
                                required
                                onChange={(e) => setEmail(e.target.value)}
                            />

                            <div className="relative">
                                <input
                                    value={password}
                                    type={showPass ? "text" : "password"}
                                    placeholder="Password"
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base"
                                    style={{ color: '#1e293b' }}
                                    required
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPass(!showPass)}
                                    className="absolute right-4 top-3 text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer"
                                >
                                    <FontAwesomeIcon icon={showPass ? faEyeSlash : faEye} />
                                </button>
                            </div>

                            <div className="relative">
                                <input
                                    value={conPassword}
                                    type={showConfirmPass ? "text" : "password"}
                                    placeholder="Confirm Password"
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base"
                                    style={{ color: '#1e293b' }}
                                    onChange={(e) => setConPassword(e.target.value)}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                                    className="absolute right-4 top-3 text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer"
                                >
                                    <FontAwesomeIcon icon={showConfirmPass ? faEyeSlash : faEye} />
                                </button>
                            </div>

                            <button type="submit" className="w-full bg-[#6366f1] hover:bg-[#4f46e5] text-white font-medium py-3 rounded-xl shadow-md transition-all mt-4 border-0 cursor-pointer">
                                Register
                            </button>
                            <p className="h-5 text-center text-sm text-red-500">
                                {message}
                            </p>
                        </form>

                        <div className="text-center pt-2">
                            <button onClick={onLoginRedirect} className="text-xs text-indigo-600 font-semibold hover:underline bg-transparent border-0 p-0 cursor-pointer">
                                Already have an Account?
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}