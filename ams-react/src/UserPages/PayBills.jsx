import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWallet, faUniversity, faMoneyBillWave, faChevronDown, faCheckCircle, faCreditCard, faCheck } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';

export default function PayBills() {
    const [selectedMethod, setSelectedMethod] = useState('gcash');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isAutoPayEnabled, setIsAutoPayEnabled] = useState(false);

    {/*Dynamically compute current calendar month and year variables*/}
    const currentDate = new Date();
    const currentMonthYear = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    {/*Billing breakdown parameters mirroring system metrics*/}
    const [billDetails, setBillDetails] = useState({
        baseRent: 0,
        water: 0,
        electricity: 0,
        parking: 0,
        invoiceId: null
    });

    useEffect(() => {
        const fetchInvoice = async () => {
            const loggedInUserStr = sessionStorage.getItem('loggedInUser');
            if (loggedInUserStr) {
                const user = JSON.parse(loggedInUserStr);
                try {
                    const res = await api.get(`/get_invoices.php?userId=${user.id}`);
                    if (res.data.success && res.data.invoices && res.data.invoices.length > 0) {
                        const pending = res.data.invoices.find(i => i.status === 'pending');
                        if (pending) {
                            setBillDetails({
                                baseRent: parseFloat(pending.base_rent) || 0,
                                water: parseFloat(pending.water) || 0,
                                electricity: parseFloat(pending.electricity) || 0,
                                parking: parseFloat(pending.parking) || 0,
                                invoiceId: pending.id
                            });
                        }
                    }
                } catch (error) {
                    console.error("Failed to fetch invoice:", error);
                }
            }
        };
        fetchInvoice();
    }, []);

    const totalAmount = billDetails.baseRent + billDetails.water + billDetails.electricity + billDetails.parking;

    {/*Available payment processing channels matrix*/}
    const paymentMethods = [
        { id: 'gcash', label: 'GCash', icon: faWallet, color: 'text-blue-600', isDigital: true },
        { id: 'bank', label: 'Bank Transfer', icon: faUniversity, color: 'text-indigo-600', isDigital: true },
        { id: 'cash', label: 'Cash on Hand', icon: faMoneyBillWave, color: 'text-emerald-600', isDigital: false }
    ];

    const currentMethodObj = paymentMethods.find(m => m.id === selectedMethod);

    const handleMethodSelect = (methodId) => {
        setSelectedMethod(methodId);
        setIsDropdownOpen(false);
        {/*Block enrollment if cash protocol is requested*/}
        if (methodId === 'cash') {
            setIsAutoPayEnabled(false);
        }
    };

    const handlePaymentExecution = async (e) => {
        e.preventDefault();
        if (!billDetails.invoiceId) {
            alert("No pending invoice found.");
            return;
        }

        try {
            const res = await api.post("/pay_bill.php", {
                invoiceId: billDetails.invoiceId,
                paymentMethod: currentMethodObj.label
            });

            if (res.data.success) {
                alert(`Payment successful via ${currentMethodObj.label}. Auto-Pay state: ${isAutoPayEnabled ? "ENABLED" : "DISABLED"}`);
                window.location.reload();
            } else {
                console.error("Server Error:", res.data.message);
                alert(res.data.message);
            }
        } catch (error) {
            console.error("Error submitting payment:", error);
            alert("Payment failed.");
        }
    };

    return (
        <div className="w-full min-h-[calc(100vh-76px)] bg-slate-50 py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-4xl space-y-8 flex flex-col justify-start text-left">
                
                {/*Header Summary Section displaying dynamic system calendar values*/}
                <div className="border-b border-slate-200 pb-4">
                    <h1 className="text-4xl font-sans font-extrabold m-0 tracking-tight select-none" style={{ color: '#3b4276' }}>
                        Current Bill: {currentMonthYear}
                    </h1>
                    <p className="text-slate-500 text-sm mt-1 m-0">
                        Review your unit breakdown ledger utilities and authorize transaction clearings securely.
                    </p>
                </div>

                {/*Main Workspace Content Segment Panel*/}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
                    
                    {/*Left Grid Parameter Block: Billing Items Statement Breakdown Ledger*/}
                    <div className="md:col-span-7 bg-white rounded-3xl border border-slate-100 shadow-md p-6 md:p-8 space-y-6">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                            <h3 className="text-lg font-bold m-0" style={{ color: '#3b4276' }}>Statement Ledger</h3>
                            <button type="button" className="text-xs font-bold text-indigo-600 hover:underline bg-transparent border-0 cursor-pointer p-0">
                                View Previous Bill
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center text-sm font-medium text-slate-600">
                                <span>Base Rent (Room C)</span>
                                <span className="font-bold text-slate-900">₱{billDetails.baseRent.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm font-medium text-slate-600">
                                <span>Water (Metered)</span>
                                <span className="font-bold text-slate-900">₱{billDetails.water.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm font-medium text-slate-600">
                                <span>Electricity (Metered)</span>
                                <span className="font-bold text-slate-900">₱{billDetails.electricity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm font-medium text-slate-600">
                                <span>Parking Reservation</span>
                                <span className="font-bold text-slate-900">₱{billDetails.parking.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>

                        <div className="border-t-2 border-slate-900 pt-4 mt-4 flex justify-between items-center">
                            <span className="text-base font-extrabold text-slate-800">Total Amount Due:</span>
                            <span className="text-2xl font-black text-indigo-600">₱{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>

                    {/*Right Grid Parameter Block: Clearing Channel Allocation Panel Controls*/}
                    <div className="md:col-span-5 bg-white rounded-3xl border border-slate-100 shadow-md p-6 md:p-8 space-y-6">
                        <h3 className="text-lg font-bold m-0 border-b border-slate-100 pb-3" style={{ color: '#3b4276' }}>Payment Settings</h3>
                        
                        {/*Custom Selected Dropdown Trigger Wrapper*/}
                        <div className="space-y-2 relative">
                            <label className="text-xs font-bold text-slate-700 block">Select Payment Method</label>
                            
                            <button
                                type="button"
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between transition-all hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer box-border"
                            >
                                <div className="flex items-center space-x-3 text-slate-800 font-semibold text-sm">
                                    {currentMethodObj.id === 'gcash' ? (
                                        <div className="w-5 h-5 rounded bg-blue-600 text-white flex items-center justify-center font-black text-[9px] tracking-tighter select-none px-0.5">GCash</div>
                                    ) : (
                                        <FontAwesomeIcon icon={currentMethodObj.icon} className={`text-base ${currentMethodObj.color}`} />
                                    )}
                                    <span>{currentMethodObj.label}</span>
                                </div>
                                <FontAwesomeIcon icon={faChevronDown} className={`text-slate-400 text-xs transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {/*Custom Dropdown Selections Layer Menu*/}
                            {isDropdownOpen && (
                                <div className="absolute top-full left-0 w-full bg-white border border-slate-100 shadow-xl rounded-xl mt-1 overflow-hidden z-50 py-1 box-border">
                                    {paymentMethods.map((method) => (
                                        <button
                                            key={method.id}
                                            type="button"
                                            onClick={() => handleMethodSelect(method.id)}
                                            className={`w-full px-4 py-3 flex items-center justify-between text-left transition-colors border-0 bg-transparent cursor-pointer font-medium text-sm ${selectedMethod === method.id ? 'bg-slate-50 text-indigo-600' : 'text-slate-700 hover:bg-slate-50'}`}
                                        >
                                            <div className="flex items-center space-x-3 font-semibold">
                                                {method.id === 'gcash' ? (
                                                    <div className="w-5 h-5 rounded bg-blue-600 text-white flex items-center justify-center font-black text-[9px] tracking-tighter select-none px-0.5">GCash</div>
                                                ) : (
                                                    <FontAwesomeIcon icon={method.icon} className={`text-base ${method.color}`} />
                                                )}
                                                <span>{method.label}</span>
                                            </div>
                                            {selectedMethod === method.id && (
                                                <FontAwesomeIcon icon={faCheckCircle} className="text-indigo-500 text-sm" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/*Polished Automatic Subscriptions Selection Box with Custom Transparent Checkbox*/}
                        <div className={`p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between ${currentMethodObj.isDigital ? 'bg-slate-50/50 border-slate-100 opacity-100' : 'bg-slate-50/30 border-slate-100/50 opacity-40 select-none pointer-events-none'}`}>
                            <div className="space-y-0.5 pr-4 text-left">
                                <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm">
                                    <FontAwesomeIcon icon={faCreditCard} className="text-slate-400 text-xs" />
                                    <span>Automatic Payment</span>
                                </div>
                                <p className="text-slate-400 text-[11px] m-0 leading-relaxed font-medium">
                                    Deduct monthly bills automatically via digital balance profiles on statement release dates.
                                </p>
                            </div>

                            {/*Custom Blueprint-Compliant Checkbox Box Element Layer Context*/}
                            <label className={`relative flex items-center justify-center w-5 h-5 rounded-md border-2 bg-transparent transition-all flex-shrink-0 ${!currentMethodObj.isDigital ? 'border-slate-300 cursor-not-allowed' : 'border-indigo-500 cursor-pointer'}`}>
                                <input
                                    type="checkbox"
                                    checked={isAutoPayEnabled}
                                    disabled={!currentMethodObj.isDigital}
                                    onChange={(e) => setIsAutoPayEnabled(e.target.checked)}
                                    className="sr-only"
                                />
                                <div className={`w-full h-full rounded-[4px] bg-indigo-600 flex items-center justify-center text-white text-[10px] transition-transform duration-150 ${isAutoPayEnabled ? 'scale-100' : 'scale-0'}`}>
                                    <FontAwesomeIcon icon={faCheck} />
                                </div>
                            </label>
                        </div>

                        {/*Action Submission Execution Button Panel Layout*/}
                        <div className="pt-2">
                            <button
                                type="button"
                                onClick={handlePaymentExecution}
                                className="w-full bg-[#22c55e] hover:bg-[#16a34a] hover:scale-[1.02] active:scale-[0.98] text-white font-extrabold py-3.5 rounded-xl text-base transition-all duration-150 shadow-md border-0 cursor-pointer text-center"
                            >
                                Proceed to Pay
                            </button>
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
}