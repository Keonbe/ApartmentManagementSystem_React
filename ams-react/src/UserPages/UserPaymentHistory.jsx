import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileInvoiceDollar, faCheckCircle, faDownload, faHistory } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';

export default function UserPaymentHistory() {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);

    const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "{}");

    useEffect(() => {
        fetchInvoices();
    }, []);

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
                            {invoices.map((inv, idx) => (
                                <div key={idx} className="p-6 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                                    <div className="flex items-start gap-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0 ${inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                            <FontAwesomeIcon icon={inv.status === 'Paid' ? faCheckCircle : faFileInvoiceDollar} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-bold tracking-wider text-slate-400">INV-{inv.id}</span>
                                                <span className="text-xs text-slate-300">•</span>
                                                <span className="text-xs font-medium text-slate-500">Billed: {new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                            </div>
                                            <h3 className="text-lg font-bold text-slate-800 m-0">{formatCurrency(inv.amount)}</h3>
                                            {inv.status === 'Paid' && inv.paid_at && (
                                                <p className="text-xs text-emerald-600 font-medium m-0 mt-1">Paid on {new Date(inv.paid_at).toLocaleDateString()}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto mt-2 sm:mt-0 pl-16 sm:pl-0">
                                        {inv.status === 'Paid' ? (
                                            <span className="px-3 py-1 text-xs font-bold bg-emerald-100 text-emerald-700 rounded-full">Paid</span>
                                        ) : (
                                            <span className="px-3 py-1 text-xs font-bold bg-amber-100 text-amber-700 rounded-full">Unpaid</span>
                                        )}
                                        
                                        {inv.receipt_path && (
                                            <a href={`http://localhost:8080/ApartmentManagementSystem_React/backend/${inv.receipt_path}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors no-underline">
                                                <FontAwesomeIcon icon={faDownload} /> Receipt
                                            </a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
