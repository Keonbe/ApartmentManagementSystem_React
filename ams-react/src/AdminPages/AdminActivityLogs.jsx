import React, { useState, useMemo } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHistory, faSearch, faFilter, faDollarSign, faWrench, faUserPlus,
  faFileContract, faCogs, faVideo, faBullhorn, faChevronLeft, faChevronRight,
  faTimes, faInfoCircle, faArrowLeft, faTrash, faDownload
} from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';

const initialLogs = [
  { id: 'LOG-001', category: 'payment', action: 'Payment Received', details: '₱12,500 from Unit H (Miguel Santos) for May 2025 Rent & Utilities', time: '10 mins ago', date: '2026-07-13 18:56', operator: 'System' },
  { id: 'LOG-002', category: 'maintenance', action: 'Maintenance Updated', details: 'REQ-003 kitchen drain clogging marked as In Progress. Assigned to Mang Totoy.', time: '1 hour ago', date: '2026-07-13 18:06', operator: 'Admin (admin@apartment.com)' },
  { id: 'LOG-003', category: 'tenant', action: 'New Tenant Onboarded', details: 'Miguel Santos added to Unit H, registered vehicle Honda Click (Plate: XYZ-8812)', time: '2 hours ago', date: '2026-07-13 17:06', operator: 'Admin (admin@apartment.com)' },
  { id: 'LOG-004', category: 'document', action: 'Contract Generated', details: 'Lease Agreement generated for Gloria Tan (Unit J). Term: 12 months.', time: 'Yesterday', date: '2026-07-12 14:30', operator: 'Admin (admin@apartment.com)' },
  { id: 'LOG-005', category: 'system', action: 'System Login', details: 'Administrator logged in from IP 192.168.1.105', time: 'Yesterday', date: '2026-07-12 09:15', operator: 'Admin (admin@apartment.com)' },
  { id: 'LOG-006', category: 'parking', action: 'Parking Slot Assigned', details: 'Slot P-15 successfully reserved for Unit F (Rosa Dela Cruz) vehicle Toyota Vios', time: '2 days ago', date: '2026-07-11 11:20', operator: 'System' },
  { id: 'LOG-007', category: 'cctv', action: 'CCTV Request Approved', details: 'Request CCTV-002 for corridor footage near elevator 2 on July 10', time: '2 days ago', date: '2026-07-11 10:15', operator: 'Admin (admin@apartment.com)' },
  { id: 'LOG-008', category: 'payment', action: 'Rent Application Approved', details: 'Application for Unit H (Miguel Santos) approved and lease contract initialized', time: '3 days ago', date: '2026-07-10 15:45', operator: 'Admin (admin@apartment.com)' },
  { id: 'LOG-009', category: 'maintenance', action: 'New Maintenance Request', details: 'Tenant Maria Santos (Unit A) reported bedroom light switch sparking', time: '3 days ago', date: '2026-07-10 12:30', operator: 'Tenant (maria.santos@email.com)' },
  { id: 'LOG-010', category: 'system', action: 'Database Backup', details: 'Automated database backup completed successfully. Status: OK', time: '4 days ago', date: '2026-07-09 00:00', operator: 'System Service' },
  { id: 'LOG-011', category: 'payment', action: 'Invoice Generated', details: 'Monthly utility invoices generated for all occupied units (13 total invoices)', time: '5 days ago', date: '2026-07-08 08:00', operator: 'System Service' },
  { id: 'LOG-012', category: 'document', action: 'Contract Signed', details: 'Tenant Pedro Cruz uploaded signed lease agreement for Unit E', time: '5 days ago', date: '2026-07-08 16:30', operator: 'Tenant (pedro.cruz@email.com)' },
  { id: 'LOG-013', category: 'announcement', action: 'Announcement Posted', details: 'Notice: Scheduled water maintenance on July 15, 2026 from 1 PM to 5 PM', time: '6 days ago', date: '2026-07-07 10:00', operator: 'Admin (admin@apartment.com)' },
  { id: 'LOG-014', category: 'cctv', action: 'New CCTV Request', details: 'CCTV-003 requested by Carlos Diaz (Unit D) for parking lot footage', time: '1 week ago', date: '2026-07-06 14:15', operator: 'Tenant (carlos.diaz@email.com)' }
];

const categoryConfig = {
  payment: { label: 'Payment', icon: faDollarSign, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  maintenance: { label: 'Maintenance', icon: faWrench, color: 'bg-amber-100 text-amber-700 border-amber-200' },
  tenant: { label: 'Tenant', icon: faUserPlus, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  document: { label: 'Document', icon: faFileContract, color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  system: { label: 'System', icon: faCogs, color: 'bg-slate-100 text-slate-700 border-slate-200' },
  parking: { label: 'Parking', icon: faCogs, color: 'bg-purple-100 text-purple-700 border-purple-200' },
  cctv: { label: 'CCTV', icon: faVideo, color: 'bg-rose-100 text-rose-700 border-rose-200' },
  announcement: { label: 'Announcement', icon: faBullhorn, color: 'bg-sky-100 text-sky-700 border-sky-200' }
};

export default function AdminActivityLogs() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState(initialLogs);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedLog, setSelectedLog] = useState(null);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Filters setup
  const filters = [
    { key: 'all', label: 'All Logs' },
    { key: 'payment', label: 'Payments' },
    { key: 'maintenance', label: 'Maintenance' },
    { key: 'tenant', label: 'Tenants' },
    { key: 'document', label: 'Contracts' },
    { key: 'parking', label: 'Parking' },
    { key: 'cctv', label: 'CCTV' },
    { key: 'system', label: 'System' }
  ];

  // Filtering & Searching logic
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesFilter = activeFilter === 'all' || log.category === activeFilter;
      const matchesSearch = 
        log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.operator.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [logs, activeFilter, searchQuery]);

  // Paginated Logs
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredLogs, currentPage]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleExport = () => {
    alert("Exporting activity logs as CSV... (Mock export completed successfully)");
  };

  const handleClearLogs = () => {
    if (window.confirm("Are you sure you want to clear all activity logs? This action is permanent.")) {
      setLogs([]);
      setCurrentPage(1);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="System Activity Logs" />

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            
            {/* Navigation Header Action */}
            <div className="flex items-center justify-between">
              <button 
                onClick={() => navigate('/admin-dashboard')}
                className="flex items-center gap-2 text-xs font-bold text-[#3b4276] bg-white border border-slate-200 rounded-xl px-4 py-2.5 hover:bg-slate-50 active:scale-[0.98] transition-all cursor-pointer shadow-sm"
              >
                <FontAwesomeIcon icon={faArrowLeft} /> Back to Dashboard
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExport}
                  disabled={logs.length === 0}
                  className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl px-4 py-2.5 hover:bg-slate-50 active:scale-[0.98] transition-all cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FontAwesomeIcon icon={faDownload} /> Export CSV
                </button>
                <button
                  onClick={handleClearLogs}
                  disabled={logs.length === 0}
                  className="flex items-center gap-2 text-xs font-bold text-rose-600 bg-white border border-slate-200 rounded-xl px-4 py-2.5 hover:bg-rose-50 active:scale-[0.98] transition-all cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FontAwesomeIcon icon={faTrash} /> Clear Logs
                </button>
              </div>
            </div>

            {/* Filter and Search Bar Card */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
                
                {/* Search Bar */}
                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 shadow-inner focus-within:border-indigo-500 focus-within:bg-white transition-all flex-grow max-w-md">
                  <FontAwesomeIcon icon={faSearch} className="text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search logs by action, details, ID, or user..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="bg-transparent border-none outline-none text-sm text-slate-800 placeholder-slate-400 w-full"
                  />
                </div>

                {/* Log Statistics */}
                <div className="text-xs text-slate-500 font-medium">
                  Showing {filteredLogs.length} logs of {logs.length} total entries
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex gap-2 p-1 bg-slate-100 rounded-xl overflow-x-auto select-none no-scrollbar">
                {filters.map((filter) => (
                  <button
                    key={filter.key}
                    onClick={() => {
                      setActiveFilter(filter.key);
                      setCurrentPage(1);
                    }}
                    className={`px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer border-0 ${
                      activeFilter === filter.key
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 bg-transparent'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Logs List/Table Card */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
                      <th className="px-6 py-4">Log ID</th>
                      <th className="px-6 py-4">Category</th>
                      <th className="px-6 py-4">Timestamp</th>
                      <th className="px-6 py-4">Action</th>
                      <th className="px-6 py-4">Details</th>
                      <th className="px-6 py-4">Operator</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {paginatedLogs.map((log) => {
                      const cfg = categoryConfig[log.category] || categoryConfig.system;
                      return (
                        <tr 
                          key={log.id} 
                          onClick={() => setSelectedLog(log)}
                          className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                        >
                          <td className="px-6 py-4 font-mono text-xs text-indigo-600 font-semibold">{log.id}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border ${cfg.color}`}>
                              <FontAwesomeIcon icon={cfg.icon} className="text-[9px]" />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">{log.date}</td>
                          <td className="px-6 py-4 font-semibold text-slate-800">{log.action}</td>
                          <td className="px-6 py-4 text-xs text-slate-600 max-w-xs truncate">{log.details}</td>
                          <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">{log.operator}</td>
                        </tr>
                      );
                    })}
                    {filteredLogs.length === 0 && (
                      <tr>
                        <td colSpan="6" className="text-center py-12 text-slate-400">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <FontAwesomeIcon icon={faInfoCircle} className="text-2xl text-slate-300" />
                            <p className="m-0 text-sm font-semibold">No activity logs found</p>
                            <p className="m-0 text-xs text-slate-400">Try adjusting your filters or search query.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              {filteredLogs.length > 0 && (
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    Page {currentPage} of {totalPages}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all flex items-center justify-center cursor-pointer text-slate-600 text-xs"
                    >
                      <FontAwesomeIcon icon={faChevronLeft} />
                    </button>
                    {[...Array(totalPages)].map((_, i) => (
                      <button
                        key={i + 1}
                        onClick={() => handlePageChange(i + 1)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                          currentPage === i + 1
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all flex items-center justify-center cursor-pointer text-slate-600 text-xs"
                    >
                      <FontAwesomeIcon icon={faChevronRight} />
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </main>

      {/* Log Details Modal */}
      {selectedLog && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setSelectedLog(null)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
                  {selectedLog.id}
                </span>
                <span className="text-xs text-slate-400 font-medium">Log Details</span>
              </div>
              <button 
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer p-1"
              >
                <FontAwesomeIcon icon={faTimes} className="text-lg" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Category</span>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border mt-1 ${categoryConfig[selectedLog.category]?.color || categoryConfig.system.color}`}>
                    <FontAwesomeIcon icon={categoryConfig[selectedLog.category]?.icon || faCogs} />
                    {categoryConfig[selectedLog.category]?.label || 'System'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Timestamp</span>
                  <span className="text-sm font-semibold text-slate-700 block mt-1">{selectedLog.date} ({selectedLog.time})</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Action Event</span>
                <span className="text-base font-bold text-slate-800 block mt-1">{selectedLog.action}</span>
              </div>

              <div className="bg-slate-50 border border-slate-150 rounded-xl p-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Details & Message</span>
                <p className="m-0 text-sm text-slate-700 leading-relaxed font-mono whitespace-pre-wrap">{selectedLog.details}</p>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Triggered By / Operator</span>
                <span className="text-sm font-semibold text-slate-700 block mt-1">{selectedLog.operator}</span>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setSelectedLog(null)}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 active:scale-[0.98] border-0 cursor-pointer shadow-sm transition-all"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
