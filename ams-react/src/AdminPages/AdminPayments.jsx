import React from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { Search, CheckCircle, Printer, Send } from 'lucide-react';

const paymentHistory = [
  { period: 'Apr 2025', amount: '₱7,450', datePaid: 'Apr 3', status: 'paid' },
  { period: 'Mar 2025', amount: '₱7,320', datePaid: 'Mar 5', status: 'paid' },
  { period: 'Feb 2025', amount: '₱7,200', datePaid: 'Feb 2', status: 'paid' },
  { period: 'Jan 2025', amount: '₱7,100', datePaid: 'Jan 7', status: 'paid' },
  { period: 'Dec 2024', amount: '₱7,450', datePaid: '—', status: 'overdue' },
];

const AdminPayments = () => {
  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <Header title="Payments" />

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto">

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Record Payment Form */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <h3 className="text-base font-semibold text-slate-800 mb-5">
                  Record payment — Pedro Cruz · Unit 2B
                </h3>

                {/* Billing Period */}
                <div className="mb-4">
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                    Billing period
                  </label>
                  <input
                    type="text"
                    value="May 2025"
                    readOnly
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700"
                  />
                </div>

                {/* Amount Fields Grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Rent</label>
                    <input type="text" value="₱6,500" readOnly className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Water</label>
                    <input type="text" value="₱350" readOnly className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Electricity</label>
                    <input type="text" value="₱820" readOnly className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Add-ons</label>
                    <input type="text" placeholder="₱0" readOnly className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-400 placeholder-slate-400" />
                  </div>
                </div>

                {/* Breakdown */}
                <div className="border-t border-slate-100 pt-4 space-y-2">
                  <div className="flex justify-between text-xs text-slate-500 pb-2 border-b border-dashed border-slate-200">
                    <span>Base rent</span>
                    <span>₱6,500</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 pb-2 border-b border-dashed border-slate-200">
                    <span>Water</span>
                    <span>₱350</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 pb-2 border-b border-dashed border-slate-200">
                    <span>Electricity</span>
                    <span>₱820</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-slate-800 pt-2">
                    <span>Total due</span>
                    <span className="text-indigo-600">₱7,670</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 mt-5">
                  <button className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 transition-colors shadow-sm">
                    <CheckCircle size={14} />
                    Mark as paid
                  </button>
                  <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors">
                    <Printer size={14} />
                    Receipt
                  </button>
                  <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors">
                    <Send size={14} />
                    Remind
                  </button>
                </div>
              </div>

              {/* Payment History */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800 mb-4">
                  Payment history — Unit 2B
                </h3>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Period</th>
                        <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                        <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Date paid</th>
                        <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentHistory.map((row, idx) => (
                        <tr key={idx} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-2.5 text-slate-700">{row.period}</td>
                          <td className="px-3 py-2.5 text-slate-700">{row.amount}</td>
                          <td className="px-3 py-2.5 text-slate-700">{row.datePaid}</td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${
                              row.status === 'paid'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {row.status === 'paid' ? 'Paid' : 'Overdue'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminPayments;
