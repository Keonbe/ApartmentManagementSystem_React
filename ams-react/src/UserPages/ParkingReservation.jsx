import { useState, useEffect, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloudUploadAlt, faFilePdf, faEye, faTimes, faExclamationTriangle, faCar, faClock, faBan } from '@fortawesome/free-solid-svg-icons';
import SuccessModal from '../Components/SuccessModal';
import { useNavigate } from 'react-router-dom';
import api from "../api/axiosConfig";
import { useLang } from '../config/i18n';
import { getSystemSettings } from '../config/systemSettings';
import '../assets/styles/responsive/user/parking-reservation.responsive.css';

export default function ParkingReservation() {
    const { t } = useLang();
    const [vehicleType, setVehicleType] = useState('motorcycle');
    const [vehicleModel, setVehicleModel] = useState('');
    const [plateNumber, setPlateNumber] = useState('');
    const [plateError, setPhonePlateError] = useState('');
    const [transmission, setTransmission] = useState('');
    const [durationMonths, setDurationMonths] = useState('');
    const [uploadedFile, setUploadedFile] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

    //1.DynamicSlotCounterAndPDFModalStates
    const [totalCapacity, setTotalCapacity] = useState(3); //AdminConfigurableTotalParkingSlots
    const [allowedVehicleTypes, setAllowedVehicleTypes] = useState(['motorcycle']); //AdminConfigurableAllowedTypes
    const [availableSlots, setAvailableSlots] = useState(3);
    const [loadingSlots, setLoadingSlots] = useState(true);
    
    const [pdfModalUrl, setPdfModalUrl] = useState(null);
    const [pdfModalTitle, setPdfModalTitle] = useState('PDF Viewer');

    const [monthlyFee, setMonthlyFee] = useState(null);
    const [myReservation, setMyReservation] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');

    const navigate = useNavigate();

    //2.RealCapacityFeeAndTheTenantsOwnReservation
    // The counter used to call the admin-only reservations endpoint, get a 403, and
    // show every slot as free. get_available_parking_slots.php is the tenant view.
    useEffect(() => {
        const fetchAvailableSlots = async () => {
            try {
                const [{ parkingAllowedVehicleTypes }, slotsRes] = await Promise.all([
                    getSystemSettings(),
                    api.get('get_available_parking_slots.php'),
                ]);
                const allowedTypes = (parkingAllowedVehicleTypes && parkingAllowedVehicleTypes.length > 0)
                    ? parkingAllowedVehicleTypes
                    : ['motorcycle'];
                setAllowedVehicleTypes(allowedTypes);
                if (!allowedTypes.includes(vehicleType)) {
                    setVehicleType(allowedTypes[0]);
                }

                if (slotsRes.data.success) {
                    setTotalCapacity(slotsRes.data.max_slots);
                    setAvailableSlots(slotsRes.data.available_slots);
                    setMonthlyFee(Number(slotsRes.data.monthly_fee));
                    setMyReservation(slotsRes.data.my_reservation);
                }
            } catch (err) {
                console.error("Failed to load parking availability:", err);
                setFormError('Could not load parking availability. Please refresh the page.');
            } finally {
                setLoadingSlots(false);
            }
        };

        fetchAvailableSlots();
    }, []);

    //3.DynamicHintAndPlaceholderHelper
    const getPlateHint = () => {
        switch (vehicleType) {
            case 'motorcycle':
                return "Accepted format: 123-ABC, 1234-AB, or Sticker FA-8231";
            case 'sedan':
            case 'suv':
            case 'pickup':
            case 'van':
                return "Accepted format: NKI-321, NKI-3212, or Sticker NK-1234";
            default:
                return "Accepted format: 123-ABC or Sticker FA-8231";
        }
    };

    const getPlatePlaceholder = () => {
        switch (vehicleType) {
            case 'motorcycle':
                return "123-ABC or FA-8231";
            case 'sedan':
            case 'suv':
            case 'pickup':
            case 'van':
                return "NKI-321 or NKI-3212";
            default:
                return "123-ABC or FA-8231";
        }
    };

    //PriceCalculationMetrics — the fee is the admin-configured parking_monthly_fee
    const calculatedTotal = durationMonths && !isNaN(durationMonths) && monthlyFee
        ? monthlyFee * parseInt(durationMonths, 10)
        : 0;
    const peso = (n) => `₱${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const hasOpenReservation = myReservation && ['Pending', 'Assigned'].includes(myReservation.status);

    //ImagePreviewUrlIsCreatedOnceAndRevoked (it was recreated on every render and never freed)
    const isImageFile = uploadedFile && (uploadedFile.type.startsWith('image/') || /\.(png|jpe?g|gif)$/i.test(uploadedFile.name));
    const previewUrl = useMemo(() => (isImageFile ? URL.createObjectURL(uploadedFile) : null), [uploadedFile, isImageFile]);
    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

    //4.IntelligentPhilippineLTOPlateAndInductionStickerValidation
    const validatePhilippinePlate = (val) => {
        if (!val.trim()) return "Plate/Sticker number is required.";

        //StripHyphensForCleanAlphanumericValidation
        const raw = val.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

        //Motorcycle:3Nums+3Letters(e.g.,123ABC)
        if (/^\d{3}[A-Z]{3}$/.test(raw)) return "";
        //Motorcycle:4Nums+2Letters(e.g.,1234AB)
        if (/^\d{4}[A-Z]{2}$/.test(raw)) return "";
        //Motorcycle/InductionSticker:2Letters+4Nums(e.g.,AB1234)
        if (/^[A-Z]{2}\d{4}$/.test(raw)) return "";
        //Car/OldMotorcycle:3Letters+3Nums(e.g.,ABC123)
        if (/^[A-Z]{3}\d{3}$/.test(raw)) return "";
        //Car:3Letters+4Nums(e.g.,NKI3212)
        if (/^[A-Z]{3}\d{4}$/.test(raw)) return "";
        //InductionSticker:2Letters+5Nums(e.g.,FA82312)
        if (/^[A-Z]{2}\d{5}$/.test(raw)) return "";
        //MVFileNo:10To15Digits
        if (/^\d{10,15}$/.test(raw)) return "";

        return "Invalid LTO format. Accepted: 123-ABC, NKI-3212, FA-8231, etc.";
    };

    //FreeTypingHandlerWithoutForcedHyphenation
    const handlePlateNumberChange = (e) => {
        let val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
        if (val.length > 15) val = val.substring(0, 15);
        setPlateNumber(val);
        if (plateError) setPhonePlateError('');
    };

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
            const file = e.dataTransfer.files[0];
            if (validateFile(file)) setUploadedFile(file);
        }
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (validateFile(file)) setUploadedFile(file);
        }
    };

    const validateFile = (file) => {
        if (!file) return false;
        const maxSizeBytes = 10 * 1024 * 1024; //10MB
        if (file.size > maxSizeBytes) {
            alert(`File "${file.name}" exceeds 10MB limit.`);
            return false;
        }
        const allowedExtensions = ['jpg', 'jpeg', 'png', 'pdf'];
        const ext = file.name.split('.').pop().toLowerCase();
        if (!allowedExtensions.includes(ext)) {
            alert("Only JPG, PNG, and PDF files are accepted.");
            return false;
        }
        return true;
    };

    //5.NumericInputHandlerCappedToMax6Months
    const handleNumberInput = (e) => {
        const value = e.target.value;
        if (value === '') {
            setDurationMonths('');
            return;
        }
        const num = parseInt(value, 10);
        if (!isNaN(num)) {
            if (num > 6) setDurationMonths(6);
            else if (num < 1) setDurationMonths(1);
            else setDurationMonths(num);
        }
    };

    const openPdfPreview = (file, title) => {
        const url = URL.createObjectURL(file);
        setPdfModalUrl(url);
        setPdfModalTitle(title);
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;
        setFormError('');

        const plateValidationError = validatePhilippinePlate(plateNumber);
        if (plateValidationError) {
            setPhonePlateError(plateValidationError);
            setFormError(plateValidationError);
            return;
        }

        if (!uploadedFile) {
            setFormError("Please upload your Vehicle Registration Form (OR/CR) before proceeding.");
            return;
        }

        // The reservation is filed under the signed-in account on the server.
        const formData = new FormData();
        formData.append('vehicleType', vehicleType);
        formData.append('vehicleModel', vehicleModel.trim());
        formData.append('plateNumber', plateNumber.trim());
        formData.append('transmission', transmission);
        formData.append('durationMonths', durationMonths);
        formData.append('uploadedFile', uploadedFile);

        setSubmitting(true);
        try {
            const res = await api.post("parking_reservation.php", formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data.success) {
                setIsModalOpen(true);
            } else {
                setFormError(res.data.message || 'Could not submit the reservation.');
            }
        } catch (error) {
            setFormError(error.response?.data?.message || "A network error occurred.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="parking-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-6 sm:py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-4xl space-y-6 sm:space-y-8 flex flex-col justify-start text-left">

                {/*TopHeaderRowWithDynamicSlotCounter*/}
                <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1
                            className="parking-heading text-3xl sm:text-4xl font-sans font-extrabold m-0 tracking-tight select-none"
                            style={{ color: '#3b4276' }}
                        >
                            {t('parking.heading')}
                        </h1>
                        <p className="parking-subtext text-slate-500 text-sm mt-1 m-0">
                            {t('parking.subtext')}
                        </p>
                    </div>

                    {/*DynamicAvailableSlotsCounterWidget*/}
                    <div className="parking-slots-widget bg-white border border-slate-200 px-5 py-3 rounded-2xl shadow-sm flex items-center space-x-3 flex-shrink-0 select-none">
                        <div className={`w-2.5 h-2.5 rounded-full ${availableSlots > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                        <div>
                            <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider">{t('parking.availableSpaces')}</span>
                            <span className="text-xl font-black text-slate-800 tracking-tight">
                                {loadingSlots ? '...' : `${availableSlots} / ${totalCapacity} ${t('parking.slotsFree')}`}
                            </span>
                        </div>
                    </div>
                </div>

                {/*LastClosedReservationOutcome*/}
                {myReservation && !hasOpenReservation && (
                    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 flex items-start gap-3">
                        <FontAwesomeIcon icon={faBan} className="text-slate-400 mt-0.5" />
                        <p className="m-0">
                            Your last parking request ({myReservation.plate_number}) was <strong>{myReservation.status.toLowerCase()}</strong>
                            {(myReservation.rejection_reason || myReservation.release_reason) && `: ${myReservation.rejection_reason || myReservation.release_reason}`}.
                            You can submit a new request below.
                        </p>
                    </div>
                )}

                {formError && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 flex items-center gap-2">
                        <FontAwesomeIcon icon={faExclamationTriangle} /> {formError}
                    </div>
                )}

                {/*OpenReservationStatusCard — replaces the form so a second request can't be filed*/}
                {hasOpenReservation ? (
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-md p-6 sm:p-10 space-y-5">
                        <div className="flex items-center gap-4">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl ${myReservation.status === 'Assigned' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                <FontAwesomeIcon icon={myReservation.status === 'Assigned' ? faCar : faClock} />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 m-0">Your parking</p>
                                <h2 className="text-2xl font-extrabold m-0" style={{ color: '#3b4276' }}>
                                    {myReservation.status === 'Assigned' ? `Slot #${myReservation.slot_number}` : 'Awaiting review'}
                                </h2>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                            <div><p className="text-[11px] font-bold uppercase text-slate-400 m-0">Vehicle</p><p className="font-bold text-slate-800 m-0">{myReservation.vehicle_model}</p></div>
                            <div><p className="text-[11px] font-bold uppercase text-slate-400 m-0">Plate</p><p className="font-bold text-slate-800 m-0 font-mono">{myReservation.plate_number}</p></div>
                            <div><p className="text-[11px] font-bold uppercase text-slate-400 m-0">Term</p><p className="font-bold text-slate-800 m-0">{myReservation.duration_months} month(s){myReservation.term_ends_at ? ` · until ${new Date(myReservation.term_ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}</p></div>
                            <div><p className="text-[11px] font-bold uppercase text-slate-400 m-0">Monthly fee</p><p className="font-bold text-slate-800 m-0">{peso(monthlyFee)}</p></div>
                        </div>
                        {myReservation.status === 'Assigned' ? (
                            <p className="text-xs text-slate-500 m-0">
                                The parking fee is added to your monthly bill.
                                {myReservation.billed_periods?.length > 0 && ` Billed so far: ${myReservation.billed_periods.join(', ')}.`}
                            </p>
                        ) : (
                            <p className="text-xs text-slate-500 m-0">Management will review your OR/CR and assign a slot. You'll get a notification either way.</p>
                        )}
                    </div>
                ) : (
                <form className="parking-form-card bg-white rounded-3xl border border-slate-100 shadow-md p-5 sm:p-8 md:p-10 grid grid-cols-1 md:grid-cols-2 gap-6 items-start" onSubmit={handleFormSubmit}>

                    {/*VehicleTypeSelectorRestrictedToMotorcycle*/}
                    <div className="flex flex-col space-y-2">
                        <label className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>{t('parking.vehicleType')}</label>
                        <select
                            value={vehicleType}
                            onChange={(e) => setVehicleType(e.target.value)}
                            className="parking-select w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]"
                            style={{ color: '#1e293b' }}
                        >
                            {[
                                { value: 'motorcycle', label: t('parking.motorcycle') },
                                { value: 'sedan', label: 'Sedan' },
                                { value: 'suv', label: 'SUV' },
                                { value: 'pickup', label: 'Pickup Truck' },
                                { value: 'van', label: 'Van' },
                                { value: 'ebike', label: 'E-Bike' },
                            ].map((vt) => {
                                const isAllowed = allowedVehicleTypes.includes(vt.value);
                                return (
                                    <option key={vt.value} value={vt.value} disabled={!isAllowed}>
                                        {vt.label}{!isAllowed ? ' (Not currently accepted)' : ''}
                                    </option>
                                );
                            })}
                        </select>
                    </div>

                    {/*VehicleModelInput*/}
                    <div className="flex flex-col space-y-2">
                        <label className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>{t('parking.vehicleModel')}</label>
                        <input
                            type="text"
                            placeholder="e.g. Yamaha Nmax / Honda Click"
                            value={vehicleModel}
                            required
                            onChange={(e) => setVehicleModel(e.target.value)}
                            className="parking-input w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]"
                            style={{ color: '#1e293b' }}
                        />
                    </div>

                    {/*PlateNumberInputFieldWithAlignedLabelAndHelperText*/}
                    <div className="flex flex-col space-y-2">
                        <label className="text-sm font-bold text-slate-700 block" style={{ color: '#3b4276' }}>
                            {t('parking.plateNo')}
                        </label>
                        <input
                            type="text"
                            placeholder={getPlatePlaceholder()}
                            value={plateNumber}
                            onChange={handlePlateNumberChange}
                            onBlur={() => setPhonePlateError(validatePhilippinePlate(plateNumber))}
                            required
                            className={`parking-input w-full px-4 py-3 rounded-xl bg-slate-50 border text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base uppercase transition-colors min-h-[48px] ${plateError ? 'border-red-400 focus:ring-red-400' : 'border-slate-200'}`}
                            style={{ color: '#1e293b' }}
                        />
                        <span className="text-xs font-normal text-slate-400 leading-tight m-0">{getPlateHint()}</span>
                        {plateError && (
                            <span className="text-xs text-red-500 font-semibold mt-1 flex items-center gap-1">
                                <FontAwesomeIcon icon={faExclamationTriangle} /> {plateError}
                            </span>
                        )}
                    </div>

                    {/*TransmissionTypeSelector*/}
                    <div className="flex flex-col space-y-2">
                        <label className="text-sm font-bold text-slate-700 block" style={{ color: '#3b4276' }}>
                            {t('parking.transmission')}
                        </label>
                        <select
                            value={transmission}
                            onChange={(e) => setTransmission(e.target.value)}
                            className="parking-select w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]"
                            style={{ color: '#1e293b' }}
                            required
                        >
                            <option value="" disabled hidden>Select transmission type...</option>
                            <option value="Automatic">{t('parking.automatic')}</option>
                            <option value="Manual">{t('parking.manual')}</option>
                        </select>
                    </div>

                    {/*RentalDurationInputCappedToMax6Months*/}
                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label className="text-sm font-bold text-slate-700 flex items-center justify-between" style={{ color: '#3b4276' }}>
                            <span>{t('parking.duration')}</span>
                            <span className="text-xs font-normal text-slate-400">{t('parking.maxMonths')}</span>
                        </label>
                        <input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            max="6"
                            placeholder="e.g. 6 (Max 6)"
                            value={durationMonths}
                            onChange={handleNumberInput}
                            required
                            className="parking-input w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base min-h-[48px]"
                            style={{ color: '#1e293b' }}
                        />
                    </div>

                    {/*EnhancedORCRFileUploadContainer*/}
                    <div className="flex flex-col space-y-2 md:col-span-2">
                        <label className="text-sm font-bold text-slate-700" style={{ color: '#3b4276' }}>Vehicle Registration Form (LTO OR/CR)</label>
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            className={`w-full border-2 border-dashed rounded-2xl p-6 text-center transition-all duration-150 relative bg-slate-50 flex flex-col items-center justify-center min-h-[160px] ${isDragging ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                        >
                            {!uploadedFile ? (
                                <>
                                    <input
                                        type="file"
                                        id="file-upload-input"
                                        accept=".pdf,.jpg,.jpeg,.png"
                                        onChange={handleFileChange}
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                    />
                                    <div className="space-y-2 pointer-events-none">
                                        <FontAwesomeIcon icon={faCloudUploadAlt} className="text-3xl text-slate-400" />
                                        <p className="text-sm font-medium text-slate-700 m-0">Drag and drop OR/CR document here, or <span className="text-indigo-600 font-bold">browse</span></p>
                                        <p className="text-slate-400 text-xs m-0">Supports PDFs, PNGs, and JPG documents (Max 10MB)</p>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-3 flex flex-col items-center w-full z-10 p-2">
                                    {isImageFile ? (
                                        <img
                                            src={previewUrl}
                                            alt="OR/CR Document Preview" 
                                            className="w-full max-w-[360px] h-40 object-contain rounded-xl border border-slate-200 bg-white shadow-sm"
                                        />
                                    ) : (
                                        <div className="w-full max-w-[360px] h-32 bg-indigo-50 flex flex-col items-center justify-center rounded-xl border border-indigo-200 text-indigo-600 gap-2">
                                            <FontAwesomeIcon icon={faFilePdf} className="text-4xl text-rose-500" />
                                            <button
                                                type="button"
                                                onClick={() => openPdfPreview(uploadedFile, 'Vehicle Registration OR/CR PDF')}
                                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl border-0 cursor-pointer transition-colors shadow flex items-center gap-2"
                                            >
                                                <FontAwesomeIcon icon={faEye} /> View PDF Document
                                            </button>
                                        </div>
                                    )}
                                    <p className="text-xs font-bold text-slate-800 m-0 truncate max-w-[300px]">{uploadedFile.name}</p>
                                    <button
                                        type="button"
                                        onClick={() => setUploadedFile(null)}
                                        className="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold px-4 py-1.5 rounded-xl border-0 cursor-pointer transition-colors shadow-sm"
                                    >
                                        Remove / Retake
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/*PricingOverviewAndSubmitButton*/}
                    <div className="parking-pricing-row md:col-span-2 border-t border-slate-100 pt-6 sm:pt-8 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-6 mt-4">
                        <div className="parking-pricing-items flex items-center justify-between sm:justify-start gap-6 sm:space-x-12 select-none">
                            <div>
                                <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider mb-1">{t('parking.monthlyCost')}</span>
                                <span className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">{monthlyFee === null ? '…' : peso(monthlyFee)}</span>
                            </div>
                            <div>
                                <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider mb-1">{t('parking.totalCost')}</span>
                                <span className="text-xl sm:text-2xl font-black text-indigo-600 tracking-tight">{peso(calculatedTotal)}</span>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loadingSlots || availableSlots <= 0 || submitting}
                            className="parking-submit-btn w-full sm:w-auto min-h-[48px] bg-[#10b981] hover:bg-[#059669] hover:scale-[1.03] active:scale-[0.97] text-white font-bold px-10 py-3.5 rounded-xl text-base transition-all duration-200 shadow-md border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                        >
                            {submitting ? 'Submitting…' : availableSlots > 0 ? t('parking.reserveBtn') : t('parking.fullyBooked')}
                        </button>
                    </div>

                </form>
                )}
            </div>

            {/*PDFPreviewModalOverlay*/}
            {pdfModalUrl && (
                <div 
                    onClick={() => setPdfModalUrl(null)}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        className="parking-pdf-modal bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] sm:h-[85vh] flex flex-col overflow-hidden"
                    >
                        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                            <h3 className="text-base font-bold text-slate-800 m-0 flex items-center gap-2">
                                <FontAwesomeIcon icon={faFilePdf} className="text-rose-500" />
                                {pdfModalTitle}
                            </h3>
                            <button 
                                onClick={() => setPdfModalUrl(null)}
                                className="parking-pdf-modal-close-btn text-slate-400 hover:text-slate-600 font-bold bg-transparent border-0 cursor-pointer text-lg p-2"
                            >
                                <FontAwesomeIcon icon={faTimes} />
                            </button>
                        </div>
                        <div className="flex-1 w-full bg-slate-100 p-2">
                            <iframe 
                                src={pdfModalUrl} 
                                title={pdfModalTitle} 
                                className="w-full h-full border-0 rounded-xl bg-white"
                            ></iframe>
                        </div>
                        <div className="p-3 border-t border-slate-200 flex justify-end bg-slate-50">
                            <button
                                type="button"
                                onClick={() => setPdfModalUrl(null)}
                                className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2 rounded-xl text-xs border-0 cursor-pointer transition-colors"
                            >
                                Close PDF
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/*StandaloneSuccessModal*/}
            <SuccessModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false); 
                    navigate('/home');
                }}
                message={t('parking.success')}
            />
        </div>
    );
}