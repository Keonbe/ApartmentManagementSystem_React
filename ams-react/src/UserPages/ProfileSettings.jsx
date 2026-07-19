import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileAlt, faKey, faSave, faCamera, faUpload, faTrash, faUndo, faUser } from '@fortawesome/free-solid-svg-icons';
import DocumentsModal from '../Components/DocumentsModal';
import ChangePasswordModal from '../Components/ChangePasswordModal';
import api from '../api/axiosConfig';

export default function ProfileSettings() {
    const [loggedInUser, setLoggedInUser] = useState(JSON.parse(sessionStorage.getItem("loggedInUser") || "{}"));

    const [firstName, setFirstName] = useState(loggedInUser.first_name || '');
    const [lastName, setLastName] = useState(loggedInUser.last_name || '');
    const [suffix, setSuffix] = useState(loggedInUser.suffix || '');
    const [phoneRawNumber, setPhoneRawNumber] = useState(loggedInUser.contact_no ? loggedInUser.contact_no.replace('+63 ', '') : '');
    const [phoneError, setPhoneError] = useState('');
    const [email, setEmail] = useState(loggedInUser.email_address || '');
    const [gender, setGender] = useState(loggedInUser.gender || '');
    const [avatarUrl, setAvatarUrl] = useState(loggedInUser.avatar_url || '');

    const [showDocsModal, setShowDocsModal] = useState(false);
    const [showPassModal, setShowPassModal] = useState(false);

    // Camera Snapshot Simulation States
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [cameraStream, setCameraStream] = useState(null);
    const [tempAvatar, setTempAvatar] = useState(null); // Before submission preview
    const [selectedFile, setSelectedFile] = useState(null); // Store the actual file object
    const videoRef = useRef(null);

    useEffect(() => {
        const fetchProfile = async () => {
            if (!loggedInUser.email_address) return;
            try {
                const res = await api.get(`/profile.php?email=${encodeURIComponent(loggedInUser.email_address)}`);
                if (res.data.success && res.data.data) {
                    const data = res.data.data;
                    setFirstName(data.first_name || '');
                    setLastName(data.last_name || '');
                    setSuffix(data.suffix || '');
                    setGender(data.gender || '');
                    if (data.contact_no) {
                        setPhoneRawNumber(data.contact_no.replace('+63 ', ''));
                    }
                    if (data.avatar_url) {
                        // Ensure the URL is properly formatted for the browser
                        const avatarPath = data.avatar_url.startsWith('/') ? data.avatar_url : '/' + data.avatar_url;
                        setAvatarUrl(avatarPath);
                        // Update session storage
                        const updatedUser = {
                            ...loggedInUser,
                            avatar_url: avatarPath
                        };
                        sessionStorage.setItem("loggedInUser", JSON.stringify(updatedUser));
                        setLoggedInUser(updatedUser);
                    }
                }
            } catch (error) {
                console.error("Failed to load profile data:", error);
            }
        };
        fetchProfile();
    }, [loggedInUser.email_address]);

    // Handle profile image file change
    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedFile(file); // Store the file for later upload
            const reader = new FileReader();
            reader.onloadend = () => {
                setTempAvatar(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    // Simulate starting camera
    const startCamera = async () => {
        setIsCameraActive(true);
        setTempAvatar(null);
        setSelectedFile(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            setCameraStream(stream);
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err) {
            console.warn("Camera hardware not available, running fallback simulation mode.", err);
        }
    };

    // Simulate capturing photo from camera
    const capturePhoto = () => {
        if (cameraStream) {
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = 320;
            const ctx = canvas.getContext('2d');
            if (videoRef.current) {
                ctx.drawImage(videoRef.current, 0, 0, 320, 320);
                const dataUrl = canvas.toDataURL('image/png');
                // Convert data URL to file
                fetch(dataUrl)
                    .then(res => res.blob())
                    .then(blob => {
                        const file = new File([blob], `camera_${Date.now()}.png`, { type: 'image/png' });
                        setSelectedFile(file);
                        setTempAvatar(dataUrl);
                        stopCamera();
                    });
            }
        } else {
            // Static simulation fallback photo
            const mockPhotos = [
                "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200",
                "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200",
                "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200"
            ];
            const randomMock = mockPhotos[Math.floor(Math.random() * mockPhotos.length)];
            setTempAvatar(randomMock);
            setIsCameraActive(false);
        }
    };

    // Stop camera feed
    const stopCamera = () => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
        }
        setIsCameraActive(false);
    };

    // Retake snapshot or re-upload file
    const handleRetake = () => {
        setTempAvatar(null);
        setSelectedFile(null);
        if (isCameraActive) {
            startCamera();
        }
    };

    const handlePhoneRawInput = (e) => {
        const val = e.target.value.replace(/\D/g, '');
        if (val.length <= 10) {
            setPhoneRawNumber(val);
            setPhoneError('');
        }
    };

    const validatePhilippineNumber = (number) => {
        if (number.length !== 10) return "Mobile number must be exactly 10 digits.";
        if (!/^[89]/.test(number)) return "Invalid prefix.";
        if (/^(\d)\1+$/.test(number)) return "Repetitive number pattern flagged.";
        if ("012345678901".includes(number) || "09876543210".includes(number)) return "Sequential numbers rejected.";
        return "";
    };

    // Update your handleFormSubmit function with this complete flow
    const handleFormSubmit = async (e) => {
        e.preventDefault();

        // Validate phone number
        const validationError = validatePhilippineNumber(phoneRawNumber);
        if (validationError) {
            setPhoneError(validationError);
            return;
        }

        try {
            let currentAvatarUrl = avatarUrl;

            // 1. If a new avatar file is pending, upload it first!
            if (selectedFile) {
                const formData = new FormData();
                formData.append('oldEmail', loggedInUser.email_address);
                formData.append('avatar', selectedFile);

                const avatarRes = await api.post('/profile.php', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                if (avatarRes.data.success && avatarRes.data.avatar_url) {
                    // Update our tracked tracking path variable
                    currentAvatarUrl = avatarRes.data.avatar_url;
                } else {
                    alert(avatarRes.data.message || "Failed to upload avatar image file.");
                    return; // Halt if image upload explicitly failed
                }
            }

            // 2. Submit the primary profile data updates via JSON
            const fullContactNumber = `+63 ${phoneRawNumber}`;
            const profileData = {
                oldEmail: loggedInUser.email_address,
                email: email.trim(),
                firstName: firstName.trim(),
                middleName: loggedInUser.middle_name || '',
                lastName: lastName.trim(),
                suffix: suffix.trim(),
                contactNo: fullContactNumber,
                gender: gender
            };

            const res = await api.post('/profile.php', profileData, {
                headers: { 'Content-Type': 'application/json' }
            });

            if (res.data.success) {
                // 3. Sync both text and new image paths to session storage
                const updatedUser = {
                    ...loggedInUser,
                    email_address: email.trim(),
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    suffix: suffix.trim(),
                    contact_no: fullContactNumber,
                    gender: gender,
                    avatar_url: currentAvatarUrl
                };

                sessionStorage.setItem("loggedInUser", JSON.stringify(updatedUser));
                alert("Profile and avatar settings updated successfully.");
                window.location.reload();
            } else {
                alert(res.data.message || "Failed to update profile text registry.");
            }
        } catch (error) {
            console.error("Error updating profile settings payload workflow:", error);
            alert("An error occurred while saving your profile data layers.");
        }
    };

    // Replace your getFullAvatarUrl helper to prevent backslash/path errors
    const getFullAvatarUrl = (url) => {
        if (!url) return null;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;

        // Ensure relative paths match your backend asset framework endpoint
        const cleanPath = url.replace(/^\//, '');
        return `http://localhost/ApartmentManagementSystem_React/backend/${cleanPath}`;
    };

    const getInitials = () => {
        const firstLetter = firstName ? firstName.charAt(0) : '';
        const lastLetter = lastName ? lastName.charAt(0) : '';
        return `${firstLetter}${lastLetter}`.toUpperCase();
    };

    return (
        <div className="w-full min-h-[calc(100vh-76px)] bg-slate-50 py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-4xl space-y-8 flex flex-col justify-start text-left">
                <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-4xl font-sans font-extrabold m-0 tracking-tight select-none" style={{ color: '#3b4276' }}>
                            Profile Settings
                        </h1>
                        <p className="text-slate-500 text-sm mt-1 m-0">
                            Review and maintain your master identity records configuration details below.
                        </p>
                    </div>

                    {/* Profile Picture Display / Preview */}
                    <div className="flex items-center gap-4">
                        <div className="relative group select-none">
                            {tempAvatar || avatarUrl ? (
                                <img
                                    src={tempAvatar || getFullAvatarUrl(avatarUrl)}
                                    alt="Avatar"
                                    className="w-20 h-20 rounded-full object-cover border-2 border-indigo-500 shadow-md"
                                    onError={(e) => {
                                        // If image fails to load, show initials
                                        e.target.style.display = 'none';
                                        e.target.parentElement.innerHTML = `
                                            <div class="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-black shrink-0 tracking-wider shadow-md border-2 border-white" style="background-color: #3b4276">
                                                ${getInitials() || "?"}
                                            </div>
                                        `;
                                    }}
                                />
                            ) : (
                                <div
                                    className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-black shrink-0 tracking-wider shadow-md border-2 border-white"
                                    style={{ backgroundColor: '#3b4276' }}
                                >
                                    {getInitials() || "?"}
                                </div>
                            )}
                            {(tempAvatar || avatarUrl) && (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (window.confirm("Are you sure you want to delete your profile avatar?")) {
                                            try {
                                                // Post an empty string or clear signal to the backend
                                                const res = await api.post('/profile.php', {
                                                    oldEmail: loggedInUser.email_address,
                                                    clearAvatar: true
                                                });

                                                if (res.data.success) {
                                                    setAvatarUrl('');
                                                    setTempAvatar(null);
                                                    setSelectedFile(null);

                                                    // Update session storage details locally
                                                    const updatedUser = { ...loggedInUser, avatar_url: '' };
                                                    sessionStorage.setItem("loggedInUser", JSON.stringify(updatedUser));
                                                    setLoggedInUser(updatedUser);

                                                    alert("Avatar deleted successfully.");
                                                    window.location.reload(); // Force real-time topbar synchronization sync
                                                } else {
                                                    alert(res.data.message || "Failed to delete avatar from server.");
                                                }
                                            } catch (err) {
                                                console.error("Error deleting avatar:", err);
                                                alert("An error occurred during avatar deletion processing.");
                                            }
                                        }
                                    }}
                                    className="absolute -top-1 -right-1 bg-red-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] hover:bg-red-600 border-0 cursor-pointer shadow-sm"
                                    title="Delete Avatar"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-100 shadow-md p-6 md:p-10 space-y-8">
                    {/* Profile Photo Uploader with Camera Capture */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-bold text-slate-700 m-0">Profile Avatar Photo</h3>

                        {isCameraActive ? (
                            <div className="max-w-sm w-full bg-slate-900 rounded-2xl overflow-hidden aspect-square relative flex flex-col items-center justify-center border border-slate-800">
                                {tempAvatar ? (
                                    <img src={tempAvatar} alt="Captured preview" className="w-full h-full object-cover" />
                                ) : (
                                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]"></video>
                                )}

                                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 px-4">
                                    {!tempAvatar ? (
                                        <>
                                            <button type="button" onClick={capturePhoto} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl border-0 cursor-pointer shadow">
                                                Capture Photo
                                            </button>
                                            <button type="button" onClick={stopCamera} className="bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-4 py-2 rounded-xl border-0 cursor-pointer">
                                                Cancel
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button type="button" onClick={handleRetake} className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2 rounded-xl border-0 cursor-pointer shadow flex items-center gap-1.5">
                                                <FontAwesomeIcon icon={faUndo} /> Retake
                                            </button>
                                            <button type="button" onClick={() => setIsCameraActive(false)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl border-0 cursor-pointer shadow">
                                                Keep Snapshot
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Local file selector */}
                                <div className="border border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl p-4 flex flex-col items-center justify-center text-center bg-slate-50/50 relative cursor-pointer group transition-colors min-h-[110px]">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleFileChange}
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                    />
                                    <FontAwesomeIcon icon={faUpload} className="text-slate-400 group-hover:text-indigo-500 text-lg mb-1.5 transition-colors" />
                                    <span className="text-xs font-bold text-slate-700">Choose Image File</span>
                                    <span className="text-[10px] text-slate-400 mt-0.5">JPG, PNG or GIF up to 2MB</span>
                                </div>

                                {/* Simulated Camera button */}
                                <button
                                    type="button"
                                    onClick={startCamera}
                                    className="border border-slate-200 hover:border-indigo-400 rounded-2xl p-4 flex flex-col items-center justify-center text-center bg-slate-50/50 cursor-pointer group transition-all min-h-[110px]"
                                >
                                    <FontAwesomeIcon icon={faCamera} className="text-slate-400 group-hover:text-indigo-500 text-lg mb-1.5 transition-colors" />
                                    <span className="text-xs font-bold text-slate-700">Take Snapshot Photo</span>
                                    <span className="text-[10px] text-slate-400 mt-0.5">Use your device webcam camera</span>
                                </button>
                            </div>
                        )}

                        {tempAvatar && !isCameraActive && (
                            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <img src={tempAvatar} alt="preview" className="w-12 h-12 rounded-full object-cover border border-indigo-200 shadow-sm" />
                                    <div>
                                        <p className="text-xs font-bold text-indigo-900 m-0">Pre-uploaded avatar preview</p>
                                        <p className="text-[10px] text-indigo-500 m-0">Click Save Profile below to commit updates</p>
                                    </div>
                                </div>
                                <button type="button" onClick={() => {
                                    setTempAvatar(null);
                                    setSelectedFile(null);
                                }} className="text-slate-400 hover:text-red-500 bg-transparent border-0 cursor-pointer text-xs font-semibold px-2">
                                    Remove
                                </button>
                            </div>
                        )}
                    </div>

                    <form className="space-y-8" onSubmit={handleFormSubmit}>
                        <div className="space-y-4">
                            <h3 className="text-lg font-bold m-0 border-b border-slate-100 pb-2" style={{ color: '#3b4276' }}>Personal Details</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="flex flex-col space-y-1.5">
                                    <label className="text-sm font-bold text-slate-700">First Name</label>
                                    <input
                                        type="text"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                                        required
                                    />
                                </div>
                                <div className="flex flex-col space-y-1.5">
                                    <label className="text-sm font-bold text-slate-700">Last Name</label>
                                    <input
                                        type="text"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                                        required
                                    />
                                </div>
                                <div className="flex flex-col space-y-1.5">
                                    <label className="text-sm font-bold text-slate-700">Suffix</label>
                                    <input
                                        type="text"
                                        value={suffix}
                                        onChange={(e) => setSuffix(e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="flex flex-col space-y-1.5">
                                    <label className="text-sm font-bold text-slate-700">Contact No.</label>
                                    <div className="w-full flex relative">
                                        <div className="flex items-center space-x-1 px-3 bg-slate-100 border border-slate-200 rounded-l-xl text-slate-800 text-sm font-bold select-none border-r-0 pointer-events-none opacity-80 box-border">
                                            <span>🇵🇭</span>
                                            <span className="text-slate-600 text-xs font-semibold">+63</span>
                                        </div>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            placeholder="917 123 4567"
                                            value={phoneRawNumber}
                                            onChange={handlePhoneRawInput}
                                            className={`w-full flex-grow px-4 py-2.5 rounded-r-xl bg-slate-50 border text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm box-border ${phoneError ? 'border-red-400' : 'border-slate-200'}`}
                                            required
                                        />
                                    </div>
                                    {phoneError && <p className="text-red-500 text-xs mt-1">{phoneError}</p>}
                                </div>

                                <div className="flex flex-col space-y-1.5">
                                    <label className="text-sm font-bold text-slate-700">Email Address</label>
                                    <input
                                        type="text"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                                        required
                                    />
                                </div>
                                <div className="flex flex-col space-y-1.5">
                                    <label className="text-sm font-bold text-slate-700">Gender</label>
                                    <select
                                        value={gender}
                                        onChange={(e) => setGender(e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm"
                                        required
                                    >
                                        <option value="" disabled hidden>Select gender...</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                            <button type="button" onClick={() => setShowDocsModal(true)} className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl p-4 text-left flex items-center space-x-4 cursor-pointer transition-all duration-150 shadow-sm">
                                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                    <FontAwesomeIcon icon={faFileAlt} className="text-base" />
                                </div>
                                <div>
                                    <p className="m-0 text-sm font-bold text-slate-800">Verification Documents</p>
                                    <p className="m-0 text-xs text-slate-400 mt-0.5">Manage Valid ID & NBI Clearance</p>
                                </div>
                            </button>
                            <button type="button" onClick={() => setShowPassModal(true)} className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl p-4 text-left flex items-center space-x-4 cursor-pointer transition-all duration-150 shadow-sm">
                                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                    <FontAwesomeIcon icon={faKey} className="text-base" />
                                </div>
                                <div>
                                    <p className="m-0 text-sm font-bold text-slate-800">Account Security</p>
                                    <p className="m-0 text-xs text-slate-400 mt-0.5">Update login credentials</p>
                                </div>
                            </button>
                        </div>

                        <div className="border-t border-slate-100 pt-6 flex justify-end">
                            <button
                                type="submit"
                                className="w-full sm:w-auto bg-[#6366f1] hover:bg-[#4f46e5] text-white font-bold px-10 py-3.5 rounded-xl text-base transition-all duration-200 shadow-md border-0 cursor-pointer flex items-center justify-center space-x-2"
                            >
                                <FontAwesomeIcon icon={faSave} />
                                <span>Save Profile</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
            <DocumentsModal isOpen={showDocsModal} onClose={() => setShowDocsModal(false)} />
            <ChangePasswordModal isOpen={showPassModal} onClose={() => setShowPassModal(false)} />
        </div>
    );
}