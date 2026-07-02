import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloudUploadAlt, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import SuccessModal from '../Components/SuccessModal';

export default function ParkingReservation() {
    const [vehicleType, setVehicleType] = useState('motorcycle');
    const [vehicleModel, setVehicleModel] = useState('');
    const [plateNumber, setPlateNumber] = useState('');
    const [transmission, setTransmission] = useState('');
    const [durationMonths, setDurationMonths] = useState('');
    const [uploadedFile, setUploadedFile] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

    //Mocked price calculation metrics
    const BASE_PRICE = 300;
    const calculatedTotal = durationMonths && !isNaN(durationMonths)
        ? BASE_PRICE * parseInt(durationMonths, 10)
        : 0;

    //File uploading drop mechanics
    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setUploadedFile(e.dataTransfer.files[0]);
        }
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setUploadedFile(e.target.files[0]);
        }
    };

    //Locks key inputs exclusively to numeric digits
    const handleNumberInput = (e) => {
        const value = e.target.value;
        if (value === '' || /^[0-9]\d*$/.test(value)) {
            setDurationMonths(value);
        }
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        setIsModalOpen(true);
    };

    return (
        <div className="w-full min-h-[calc(100vh-76px)] bg-slate-50 py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-4xl space-y-8 flex flex-col justify-start text-left">

                {/*Top Header Row containing Live Slot Counter Indicators*/}
                <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1
                            className="text-4xl font-sans font-extrabold m-0 tracking-tight select-none"
                            style={{ color: '#3b4276' }}
                        >
                            Reserve Parking
                        </h1>
                        <p className="text-slate-500 text-sm mt-1 m-0">
                            Complete the registration information grid below to acquire your allotted compound space stall.
                        </p>
                    </div>

                    {/*Available Slots Counter Widget*/}
                    <div className="bg-white border border-slate-200 px-5 py-3 rounded-2xl shadow-sm flex items-center space-x-3 flex-shrink-0 select-none">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                        <div>
                            <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider">Available Spaces</span>
                            <span className="text-xl font-black text-slate-800 tracking-tight">2 / 3 Slots Free</span>
                        </div>
                    </div>
                </div>

                {/*Form Inputs Panel Layout*/}
                <form className="bg-white rounded-3xl border border-slate-100 shadow-md p-6 md:p-10 grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={handleFormSubmit}>

                    {/*Vehicle Type Select Component Dropdown Menu*/}
                    <div className="flex flex-col space-y-2">
                        <label className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>Vehicle Type</label>
                        <select
                            value={vehicleType}
                            onChange={(e) => setVehicleType(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base"
                            style={{ color: '#1e293b' }}
                        >
                            <option value="" disabled hidden>Vehicle Type...</option>
                            <option value="motorcycle">Motorcycle</option>
                            <option value="sedan" disabled>Sedan (Only motorcycles are allowed)</option>
                            <option value="suv" disabled>SUV (Only motorcycles are allowed)</option>
                            <option value="pickup" disabled>Pickup Truck (Only motorcycles are allowed)</option>
                            <option value="van" disabled>Van (Only motorcycles are allowed)</option>
                        </select>
                    </div>

                    {/*Vehicle Model Input Field Box Component Layout*/}
                    <div className="flex flex-col space-y-2">
                        <label className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>Vehicle Model</label>
                        <input
                            type="text"
                            placeholder="Yamaha Nmax"
                            value={vehicleModel}
                            onChange={(e) => setVehicleModel(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base"
                            style={{ color: '#1e293b' }}
                        />
                    </div>

                    {/*Plate Number Field Box Element Area Layout Component*/}
                    <div className="flex flex-col space-y-2">
                        <label className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>Plate Number</label>
                        <input
                            type="text"
                            placeholder="FAJ-8231"
                            value={plateNumber}
                            onChange={(e) => setPlateNumber(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base uppercase"
                            style={{ color: '#1e293b' }}
                        />
                    </div>

                    {/*Transmission Selection Modifier Utility Dropdown Box Component Layout*/}
                    <div className="flex flex-col space-y-2">
                        <label className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>Transmission System</label>
                        <select
                            value={transmission}
                            onChange={(e) => setTransmission(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base"
                            style={{ color: '#1e293b' }}
                        >
                            <option value="" disabled hidden>Select transmission type...</option>
                            <option value="automatic">Automatic</option>
                            <option value="manual">Manual</option>
                        </select>
                    </div>

                    {/*Rent Duration Length Interval Numeric Box Modifiers Layout*/}
                    <div className="flex flex-col space-y-2">
                        <label className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>Rental Duration (Months)</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="e.g. 6"
                            value={durationMonths}
                            onChange={handleNumberInput}
                            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base"
                            style={{ color: '#1e293b' }}
                        />
                    </div>

                    {/*File Storage DropBox Wrapper Area Workspace Container Layout Component Area*/}
                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>Vehicle Registration Form (LTO OR/CR)</label>
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            className={`w-full border-2 border-dashed rounded-2xl p-6 text-center transition-all duration-150 relative bg-slate-50 flex flex-col items-center justify-center min-h-[140px] ${isDragging ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300'
                                }`}
                        >
                            <input
                                type="file"
                                id="file-upload-input"
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={handleFileChange}
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            />
                            {!uploadedFile ? (
                                <div className="space-y-2 pointer-events-none">
                                    <FontAwesomeIcon icon={faCloudUploadAlt} className="text-3xl text-slate-400" />
                                    <p className="text-sm font-medium text-slate-700 m-0">Drag and drop file paperwork assets here, or <span className="text-indigo-600 font-bold">browse</span></p>
                                    <p className="text-slate-400 text-xs m-0">Supports PDFs, PNGs, and JPG documents</p>
                                </div>
                            ) : (
                                <div className="space-y-2 flex flex-col items-center pointer-events-none">
                                    <FontAwesomeIcon icon={faCheckCircle} className="text-3xl text-emerald-500" />
                                    <p className="text-sm font-bold text-slate-800 m-0">{uploadedFile.name}</p>
                                    <p className="text-slate-400 text-xs m-0">({(uploadedFile.size / 1024 / 1024).toFixed(2)} MB)</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/*Financial Pricing Total Overview Invoicing Mock Block Area*/}
                    <div className="md:col-span-2 border-t border-slate-100 pt-8 flex flex-col sm:flex-row justify-between items-center gap-6 mt-4">
                        <div className="flex items-center space-x-12 select-none">
                            <div>
                                <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider mb-1">Monthly Cost</span>
                                <span className="text-2xl font-black text-slate-800 tracking-tight">₱300.00</span>
                            </div>
                            <div>
                                <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider mb-1">Total Statement Cost</span>
                                <span className="text-2xl font-black text-indigo-600 tracking-tight">₱{calculatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                        </div>

                        {/*Submission Reservation Trigger Button Component Layout Area*/}
                        <button
                            type="submit"
                            className="w-full sm:w-auto bg-[#10b981] hover:bg-[#059669] hover:scale-[1.03] active:scale-[0.97] text-white font-bold px-10 py-3.5 rounded-xl text-base transition-all duration-200 shadow-md hover:shadow-emerald-500/20 border-0 cursor-pointer"
                        >
                            Reserve Space
                        </button>
                    </div>

                </form>
            </div>

            {/*Standalone Modular Success Display Layer Component*/}
            <SuccessModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                message="Reservation Successfully" 
            />
        </div>
    );
}