import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileInvoiceDollar, faCheckCircle, faDownload, faHistory, faPrint } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';

export default function UserPaymentHistory() {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);

    const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "{}");
    const [showReceipt, setShowReceipt] = useState(false);
    const [receiptData, setReceiptData] = useState(null);

    useEffect(() => {
        fetchInvoices();
    }, []);

    const handleViewReceipt = (inv) => {
        let breakdown = `Rent: ${formatCurrency(inv.base_rent)}`;
        if (parseFloat(inv.security_deposit) > 0) {
            breakdown += `\nSecurity Deposit: ${formatCurrency(inv.security_deposit)}`;
        }
        if (parseFloat(inv.water) > 0) {
            breakdown += `\nWater: ${formatCurrency(inv.water)}`;
        }
        if (parseFloat(inv.electricity) > 0) {
            breakdown += `\nElectricity: ${formatCurrency(inv.electricity)}`;
        }
        if (parseFloat(inv.parking) > 0) {
            breakdown += `\nParking: ${formatCurrency(inv.parking)}`;
        }

        const datePaid = inv.paid_at 
            ? new Date(inv.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'N/A';

        setReceiptData({
            rctId: `RCT-${inv.id}`,
            date: datePaid,
            tenant: `${loggedInUser.first_name || ''} ${loggedInUser.last_name || ''}`.trim() || 'Tenant',
            unit: inv.room_name || 'N/A',
            period: inv.billing_period,
            amount: parseFloat(inv.total_amount),
            breakdown: breakdown,
            status: inv.status.toUpperCase(),
            method: inv.payment_method || 'N/A'
        });
        setShowReceipt(true);
    };

    const fetchInvoices = async () => {
        try {
            setLoading(true);
            const response = await api.get(`get_invoices.php?userId=${loggedInUser.id}`);
            if (response.data.success) {
                // Filter only paid ones or show all? The prompt said "Timeline of paid invoices".
                // I will show all but emphasize Paid ones. Or just show all so they know what they paid.
                setInvoices(response.data.invoices);
            }
        } catch (error) {
            console.error("Failed to fetch payment history", error);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    };

    return (
        <div className="w-full min-h-[calc(100vh-76px)] bg-slate-50 py-10 px-4 md:px-12 box-border flex flex-col items-center">
            <div className="w-full max-w-[1000px] space-y-8 flex flex-col justify-start text-left">
                
                <div className="border-b border-slate-200 pb-4">
                    <h1 className="text-4xl font-sans font-extrabold m-0 tracking-tight select-none flex items-center gap-3" style={{ color: '#3b4276' }}>
                        <FontAwesomeIcon icon={faHistory} className="text-indigo-500 text-3xl" />
                        Payment History
                    </h1>
                    <p className="text-slate-500 text-sm mt-2 m-0">
                        Review your past billing statements and official receipts.
                    </p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    {loading ? (
                        <div className="p-8 text-center text-slate-400">Loading payment records...</div>
                    ) : invoices.length === 0 ? (
                        <div className="p-12 text-center">
                            <FontAwesomeIcon icon={faFileInvoiceDollar} className="text-4xl text-slate-200 mb-4" />
                            <h3 className="text-lg font-bold text-slate-700 m-0">No Payment History</h3>
                            <p className="text-sm text-slate-500 mt-2">You don't have any generated invoices or payments yet.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {invoices.map((inv, idx) => {
                                const isPaid = inv.status?.toLowerCase() === 'paid';
                                return (
                                    <div key={idx} className="p-6 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                                        <div className="flex items-start gap-4">
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0 ${isPaid ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                                <FontAwesomeIcon icon={isPaid ? faCheckCircle : faFileInvoiceDollar} />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs font-bold tracking-wider text-slate-400">INV-{inv.id}</span>
                                                    <span className="text-xs text-slate-300">•</span>
                                                    <span className="text-xs font-medium text-slate-500">Billed: {new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                </div>
                                                <h3 className="text-lg font-bold text-slate-800 m-0">{formatCurrency(inv.total_amount)}</h3>
                                                
                                                <div className="mt-2 space-y-1 text-xs text-slate-500">
                                                    <div className="flex gap-2">
                                                        <span className="font-semibold">Billing Period:</span>
                                                        <span>{inv.billing_period}</span>
                                                    </div>
                                                    <div className="flex gap-3 flex-wrap text-[11px] text-slate-400">
                                                        <span>Rent: {formatCurrency(inv.base_rent)}</span>
                                                        {parseFloat(inv.security_deposit) > 0 && (
                                                            <span>Deposit: {formatCurrency(inv.security_deposit)}</span>
                                                        )}
                                                        {parseFloat(inv.water) > 0 && (
                                                            <span>Water: {formatCurrency(inv.water)}</span>
                                                        )}
                                                        {parseFloat(inv.electricity) > 0 && (
                                                            <span>Electricity: {formatCurrency(inv.electricity)}</span>
                                                        )}
                                                        {parseFloat(inv.parking) > 0 && (
                                                            <span>Parking: {formatCurrency(inv.parking)}</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {isPaid && inv.paid_at && (
                                                    <p className="text-xs text-emerald-600 font-medium m-0 mt-2">Paid on {new Date(inv.paid_at).toLocaleDateString()}</p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto mt-2 sm:mt-0 pl-16 sm:pl-0">
                                            {isPaid ? (
                                                <span className="px-3 py-1 text-xs font-bold bg-emerald-100 text-emerald-700 rounded-full">Paid</span>
                                            ) : (
                                                <span className="px-3 py-1 text-xs font-bold bg-amber-100 text-amber-700 rounded-full">Unpaid</span>
                                            )}
                                            
                                            {isPaid && (
                                                <button 
                                                    onClick={() => handleViewReceipt(inv)} 
                                                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-indigo-600 bg-indigo-50 border-0 rounded-lg hover:bg-indigo-100 transition-colors cursor-pointer"
                                                >
                                                    <FontAwesomeIcon icon={faDownload} /> View Receipt
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

            </div>

            {/* Receipt Modal */}
            {showReceipt && receiptData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowReceipt(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="bg-slate-900 text-white p-6 text-center border-b-4 border-indigo-500">
                            <h2 className="text-2xl font-bold tracking-wider italic font-serif mb-1 m-0 uppercase">Apartment AMS</h2>
                            <div className="mt-4 pt-4 border-t border-slate-700/50">
                                <p className="text-sm font-semibold text-slate-300 uppercase tracking-widest m-0">Official Receipt</p>
                                <p className="text-xs font-mono text-indigo-300 m-0 mt-1">{receiptData.rctId}</p>
                            </div>
                        </div>
                        <div className="p-6 space-y-4 font-mono text-sm">
                            <div className="flex justify-between border-b border-slate-200 pb-4">
                                <div><p className="text-slate-500 text-[10px] uppercase m-0">Date</p><p className="font-semibold m-0 mt-0.5">{receiptData.date}</p></div>
                                <div className="text-right"><p className="text-slate-500 text-[10px] uppercase m-0">Status</p><p className="font-bold text-emerald-600 m-0 mt-0.5">{receiptData.status}</p></div>
                            </div>
                            <div className="flex justify-between border-b border-slate-200 pb-4">
                                <div><p className="text-slate-500 text-[10px] uppercase m-0">Received From</p><p className="font-bold text-base m-0 mt-0.5 text-slate-800">{receiptData.tenant}</p><p className="m-0 text-slate-600 text-xs">Unit {receiptData.unit}</p></div>
                                <div className="text-right"><p className="text-slate-500 text-[10px] uppercase m-0">Method</p><p className="font-semibold text-slate-800 m-0 mt-0.5">{receiptData.method}</p></div>
                            </div>
                            <div>
                                <p className="text-slate-500 text-[10px] uppercase m-0 mb-1">Payment Breakdown ({receiptData.period})</p>
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 whitespace-pre-wrap leading-relaxed text-xs text-slate-700">{receiptData.breakdown}</div>
                            </div>
                            <div className="flex justify-between items-center pt-4 border-t-2 border-dashed border-slate-200">
                                <p className="font-bold text-slate-600 m-0 text-base">TOTAL PAID</p>
                                <p className="text-2xl font-bold text-slate-900 m-0">{formatCurrency(receiptData.amount)}</p>
                            </div>
                        </div>
                        <div className="flex gap-2 p-4 bg-slate-50 border-t border-slate-200">
                            <button onClick={() => window.print()} className="flex-1 flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded text-sm font-semibold hover:bg-indigo-700 border-0 cursor-pointer transition-colors"><FontAwesomeIcon icon={faPrint} /> Print Receipt</button>
                            <button onClick={() => setShowReceipt(false)} className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 rounded text-sm font-semibold hover:bg-slate-100 border-solid cursor-pointer transition-colors">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
