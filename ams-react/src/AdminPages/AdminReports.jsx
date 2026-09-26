import { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faDownload, faFileInvoiceDollar, faChartBar, faChartLine, faBuilding,
  faDollarSign, faExclamationTriangle, faTimes,
  faBolt, faTint, faCheckCircle, faClock, faPrint, faArrowUp, faArrowDown,
  faWrench, faSquareParking, faChevronRight, faClipboardList, faConciergeBell,
  faSlidersH,
  faShieldAlt, faHandshake, faLayerGroup, faReceipt,
  faChartPie, faSave, faSpinner, faArrowLeft
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { MAX_AMOUNT, checkAmount, checkDate, firstError, localDateString } from '../utils/validation';
import ExpensesModal from '../Components/ExpensesModal';
import { expenseCategoryLabel } from '../config/expenseCategories';

const monthsList = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' }
];

const yearsList = [2024, 2025, 2026];

const formatCurrency = (n) => `₱${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const AdminReports = () => {
  const location = useLocation();
  const [timeframe, setTimeframe] = useState('monthly'); // 'monthly' | 'quarterly' | 'yearly'
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1); // Current month
  const [selectedQuarter, setSelectedQuarter] = useState(Math.ceil((new Date().getMonth() + 1) / 3)); // Current quarter
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear()); // Current year
  const [activeModule, setActiveModule] = useState('all'); // 'all', 'income', 'streams', 'occupancy', 'payments', 'maintenance', 'reservations', 'gaps', 'utilities'

  // Opening the page with ?tab=utilities selects that module (adjusted during render,
  // not in an effect, so there is no extra render pass).
  const [seenSearch, setSeenSearch] = useState(null);
  if (location.search !== seenSearch) {
    setSeenSearch(location.search);
    if (new URLSearchParams(location.search).get('tab') === 'utilities') {
      setActiveModule('utilities');
    }
  }

  // Modal Invoice Generation States
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const [issuingInvoice, setIssuingInvoice] = useState(false);
  const [invoiceSuccessMsg, setInvoiceSuccessMsg] = useState('');
  // Audit H8: create_invoice.php is insert-only now, so re-issuing an
  // existing invoice number 409s instead of silently overwriting posted
  // charges. 'adjust' picks an existing invoice and edits only its manual
  // lines via adjust_invoice.php, which recomputes the total from every
  // column so services/maintenance/security_deposit can never be dropped.
  const [invoiceMode, setInvoiceMode] = useState('create'); // 'create' | 'adjust'
  const [adjustableInvoices, setAdjustableInvoices] = useState([]);
  const [adjustInvoicesLoading, setAdjustInvoicesLoading] = useState(false);
  const [selectedAdjustInvoiceId, setSelectedAdjustInvoiceId] = useState('');
  const [invoiceForm, setInvoiceForm] = useState({
    invoiceNumber: '',
    tenant: '',
    unit: '',
    userId: null,
    appId: null,
    email: '',
    phone: '',
    rent: 4000,
    water: 300,
    electric: 800,
    parking: 0,
    lateFee: 0,
    services: 0,
    maintenance: 0,
    securityDeposit: 0,
    billingPeriod: '',
    dueDate: '',
    notes: 'Please settle on or before the due date to avoid late charges.'
  });

  // Statuses adjust_invoice.php still accepts (mirrors backend INVOICE_ADJUSTABLE_STATUSES).
  const ADJUSTABLE_STATUSES = ['pending', 'unpaid', 'overdue', 'scheduled', 'payment-failed'];

  const loadAdjustableInvoices = async () => {
    setAdjustInvoicesLoading(true);
    try {
      const res = await api.get('get_invoices.php');
      if (res.data.success) {
        setAdjustableInvoices((res.data.invoices || []).filter(inv => ADJUSTABLE_STATUSES.includes(inv.status)));
      }
    } catch (err) {
      console.error('Failed to load invoices for adjustment', err);
    } finally {
      setAdjustInvoicesLoading(false);
    }
  };

  const handleAdjustInvoiceSelect = (e) => {
    const id = e.target.value;
    setSelectedAdjustInvoiceId(id);
    const inv = adjustableInvoices.find(i => i.id === id);
    if (!inv) return;
    setInvoiceForm(prev => ({
      ...prev,
      invoiceNumber: inv.id,
      tenant: `${inv.first_name || ''} ${inv.last_name || ''}`.trim() || prev.tenant,
      unit: inv.room_name || prev.unit,
      userId: inv.user_id,
      rent: inv.base_rent || 0,
      water: inv.water || 0,
      electric: inv.electricity || 0,
      parking: inv.parking || 0,
      lateFee: inv.late_fee || 0,
      services: inv.services || 0,
      maintenance: inv.maintenance || 0,
      securityDeposit: inv.security_deposit || 0,
      billingPeriod: inv.billing_period || '',
      dueDate: inv.due_date ? String(inv.due_date).slice(0, 10) : ''
    }));
  };

  const [data, setData] = useState(null);
  const [utilityData, setUtilityData] = useState(null);
  const [trendPoints, setTrendPoints] = useState([]);
  // Loading is derived from the filters the data belongs to; refreshes after a write
  // keep the page (and any open modal) on screen.
  const reportQuery = `timeframe=${timeframe}&month=${selectedMonth}&quarter=${selectedQuarter}&year=${selectedYear}`;
  const [loadedQuery, setLoadedQuery] = useState(null);
  const loading = loadedQuery !== reportQuery;
  const [showExpensesModal, setShowExpensesModal] = useState(false);

  const loadReportData = async (query) => {
    try {
      const response = await api.get(`get_report_data.php?${query}`);
      if (response.data.success) {
        const bd = response.data.data;
        // Gross revenue comes from the server, which counts every paid line item; the old
        // client-side sum left out services and late fees.
        const totalCollected = bd.incomeStatement?.grossRevenue ?? 0;
        const expenses = bd.expenses || 0;
        const netIncome = bd.incomeStatement?.netOperatingIncome ?? (totalCollected - expenses);

        setData({
          occupancy: {
            totalUnits: bd.totalRooms || 0,
            occupiedUnits: bd.totalOccupied || 0,
            vacantUnits: (bd.totalRooms || 0) - (bd.totalOccupied || 0),
            occupancyRate: bd.totalRooms ? Math.round(((bd.totalOccupied || 0) / bd.totalRooms) * 100) : 0,
            moveIns: bd.moveIns || 0,
            moveOuts: bd.moveOuts || 0,
            avgStayDuration: bd.avgStayDuration ?? 0,
            vacantRentPotential: bd.vacantRentPotential ?? 0,
            tenantList: bd.tenantList || []
          },
          payments: {
            rentCollected: bd.rentCollected || 0,
            waterCollected: bd.waterCollected || 0,
            electricCollected: bd.electricCollected || 0,
            parkingCollected: bd.parkingCollected || 0,
            depositCollected: bd.depositCollected || 0,
            servicesCollected: bd.servicesCollected || 0,
            lateFeesCollected: bd.lateFeesCollected || 0,
            totalCollected,
            expenses,
            netIncome,
            outstandingBalances: bd.outstandingBalances || [],
            // `??` rather than `||`: a real 0 must display as 0, not fall through to a made-up 92%.
            totalOutstanding: bd.incomeStatement?.totalOutstanding ?? (bd.outstandingBalances || []).reduce((sum, b) => sum + b.balance, 0),
            collectionEfficiency: bd.incomeStatement?.collectionEfficiency ?? 0,
            records: bd.paymentRecords || [],
            methodsBreakdown: bd.methodsBreakdown || { Cash: 0, GCash: 0, 'Bank Transfer': 0 }
          },
          // The server always sends these. The fallbacks are empty, never invented
          // percentages — a report that can't load should show zeros, not a plausible story.
          incomeStatement: bd.incomeStatement || {
            grossRevenue: 0, rentalRevenue: 0, utilityRevenue: 0, serviceRevenue: 0, depositRevenue: 0, lateFeeRevenue: 0,
            maintenanceExpenses: 0, otherExpenses: 0, expenseBreakdown: [], operatingOverhead: 0, overheadPct: 0, operatingExpenses: 0, netOperatingIncome: 0,
            netMarginPct: 0, collectionEfficiency: 0, totalOutstanding: 0,
            prevGrossRevenue: 0, revenueGrowthPct: 0, prevNetIncome: 0, netGrowthPct: 0
          },
          revenueStreams: bd.revenueStreams || [],
          unitIncome: bd.unitIncome || [],
          diversification: bd.diversification || { coreRentPct: 0, utilitiesPct: 0, ancillaryPct: 0, utilityRecoveryRatio: 0 },
          maintenance: {
            total: bd.totalMaintenance || 0,
            totalCost: (bd.maintenanceRecords || []).reduce((acc, m) => acc + (m.cost || 0), 0),
            budget: bd.maintenanceBudget ?? 0,
            openByPriority: bd.maintOpenByPriority || {},
            completed: bd.maintCompleted || 0,
            inProgress: bd.maintInProgress || 0,
            pending: bd.maintPending || 0,
            categoryCounts: bd.maintCategoryCounts || {},
            urgencyCounts: bd.maintUrgencyCounts || {},
            avgResolutionTime: bd.maintAvgResolutionHours ?? null,
            records: bd.maintenanceRecords || []
          },
          reservations: {
            roomApps: bd.roomApplications || 0,
            roomApproved: bd.roomApproved || 0,
            roomRejected: bd.roomRejected || 0,
            roomPending: bd.roomPending || 0,
            parkingCount: bd.parkingReservationsCount || 0,
            parkingRevenue: bd.parkingCollected || 0,
            parkingList: bd.parkingList || [],
            roomList: bd.roomList || [],
            inquiryConversion: bd.inquiryConversion || null
          }
        });

        setTrendPoints(bd.trendPoints || []);
      }
      
      const utilResponse = await api.get(`get_utilities_report_data.php?${query}`);
      if (utilResponse.data.success) {
        setUtilityData(utilResponse.data.data);
      }
    } catch (e) {
      console.error(e);
    }
    setLoadedQuery(query);
  };

  const fetchReportData = () => loadReportData(reportQuery);

  useEffect(() => {
    const load = async () => { await loadReportData(reportQuery); };
    load();
  }, [reportQuery]);

  // Max value for revenue scaling in chart
  const maxRevenueTrend = useMemo(() => {
    if (!trendPoints || trendPoints.length === 0) return 10000;
    const maxVal = Math.max(...trendPoints.map(p => Math.max(p.revenue || 0, p.expenses || 0, (p.rent || 0) + (p.electric || 0) + (p.water || 0) + (p.parking || 0) + (p.deposit || 0))), 0);
    return maxVal > 0 ? maxVal * 1.15 : 10000;
  }, [trendPoints]);

  const tenantInvoiceOptions = useMemo(() => {
    return data?.occupancy?.tenantList?.map(t => ({
      name: t.name,
      unit: t.unit,
      rent: t.rent || 4000,
      userId: t.userId || t.user_id || null,
      appId: t.appId || t.application_id || null,
      email: t.email || '',
      phone: t.phone || ''
    })) || [];
  }, [data]);

  const openGenerateInvoiceModal = () => {
    const defaultPeriod = `${monthsList.find(m => m.value === selectedMonth)?.label || 'Current Month'} ${selectedYear}`;
    // The 15th of the report month, but never a date already past.
    const monthDue = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-15`;
    const defaultDue = monthDue < localDateString() ? localDateString() : monthDue;
    const defaultInvId = `INV-${selectedYear}${String(selectedMonth).padStart(2, '0')}-${String(Math.floor(1000 + Math.random() * 9000))}`;
    
    const firstTenant = tenantInvoiceOptions[0];
    setInvoiceForm({
      invoiceNumber: defaultInvId,
      tenant: firstTenant?.name || '',
      unit: firstTenant?.unit || '',
      userId: firstTenant?.userId || null,
      appId: firstTenant?.appId || null,
      email: firstTenant?.email || '',
      phone: firstTenant?.phone || '',
      rent: firstTenant?.rent || 4000,
      water: 300,
      electric: 800,
      parking: 0,
      lateFee: 0,
      services: 0,
      maintenance: 0,
      securityDeposit: 0,
      billingPeriod: defaultPeriod,
      dueDate: defaultDue,
      notes: 'Please settle on or before the due date to avoid late charges.'
    });
    setInvoiceMode('create');
    setSelectedAdjustInvoiceId('');
    setShowInvoicePreview(false);
    setInvoiceSuccessMsg('');
    setShowInvoiceModal(true);
  };

  const handleTenantSelect = (e) => {
    const selected = tenantInvoiceOptions.find(t => t.name === e.target.value);
    if (selected) {
      setInvoiceForm(prev => ({
        ...prev,
        tenant: selected.name,
        unit: selected.unit,
        userId: selected.userId,
        appId: selected.appId,
        email: selected.email,
        phone: selected.phone,
        rent: selected.rent || 4000,
      }));
    } else {
      setInvoiceForm(prev => ({
        ...prev,
        tenant: e.target.value,
        unit: '',
        userId: null,
        appId: null,
        email: '',
        phone: ''
      }));
    }
  };

  const handleSaveAndIssueInvoice = async () => {
    // Blank lines count as 0; anything else must be a non-negative amount that
    // fits the decimal(10,2) columns, and the due date a real calendar day.
    const amountFields = [['rent', 'Base rent'], ['water', 'Water'], ['electric', 'Electric'], ['parking', 'Parking'], ['lateFee', 'Late fee']];
    // No due date in the past (create_invoice.php / adjust_invoice.php enforce
    // it too); an adjustment may keep the invoice's own, already lapsed date.
    const originalDue = invoiceMode === 'adjust'
      ? String(adjustableInvoices.find(i => i.id === selectedAdjustInvoiceId)?.due_date || '').slice(0, 10)
      : '';
    const dueUnchanged = invoiceMode === 'adjust' && invoiceForm.dueDate === originalDue;
    const invoiceError = firstError(
      ...amountFields.map(([key, label]) => checkAmount(invoiceForm[key] === '' ? 0 : invoiceForm[key], { label })),
      invoiceForm.dueDate && !dueUnchanged ? checkDate(invoiceForm.dueDate, { min: localDateString(), label: 'Due date' }) : ''
    );
    if (invoiceError) {
      alert(invoiceError);
      return;
    }
    if (invoiceMode === 'adjust') {
      if (!selectedAdjustInvoiceId) {
        alert('Please select an invoice to adjust.');
        return;
      }
      setIssuingInvoice(true);
      setInvoiceSuccessMsg('');
      try {
        const payload = {
          invoiceId: selectedAdjustInvoiceId,
          baseRent: Number(invoiceForm.rent) || 0,
          water: Number(invoiceForm.water) || 0,
          electricity: Number(invoiceForm.electric) || 0,
          parking: Number(invoiceForm.parking) || 0,
          lateFee: Number(invoiceForm.lateFee) || 0,
          dueDate: invoiceForm.dueDate
        };
        const response = await api.post('adjust_invoice.php', payload);
        if (response.data.success) {
          setInvoiceSuccessMsg(`Invoice ${response.data.invoice_id} adjusted — new total ₱${Number(response.data.total_amount).toLocaleString()}.`);
          loadAdjustableInvoices();
          fetchReportData();
        } else {
          alert(response.data.message || 'Failed to adjust invoice.');
        }
      } catch (err) {
        // create_invoice/adjust_invoice return a 4xx body with a specific
        // reason (duplicate id, invalid amount, invoice no longer
        // adjustable, etc.) — surface it instead of a generic alert.
        alert(err.response?.data?.message || 'Error adjusting invoice. Please verify connection and inputs.');
      } finally {
        setIssuingInvoice(false);
      }
      return;
    }

    if (!invoiceForm.tenant || !invoiceForm.unit) {
      alert('Please select a tenant and specify the unit.');
      return;
    }
    setIssuingInvoice(true);
    setInvoiceSuccessMsg('');
    try {
      const payload = {
        userId: invoiceForm.userId,
        tenantName: invoiceForm.tenant,
        unit: invoiceForm.unit,
        baseRent: Number(invoiceForm.rent) || 0,
        water: Number(invoiceForm.water) || 0,
        electricity: Number(invoiceForm.electric) || 0,
        parking: Number(invoiceForm.parking) || 0,
        lateFee: Number(invoiceForm.lateFee) || 0,
        billingPeriod: invoiceForm.billingPeriod,
        dueDate: invoiceForm.dueDate
      };
      const response = await api.post('create_invoice.php', payload);
      if (response.data.success) {
        setInvoiceSuccessMsg(`Invoice ${response.data.invoice_id} successfully saved & issued to ${invoiceForm.tenant}!`);
        fetchReportData();
      } else {
        alert(response.data.message || 'Failed to issue invoice.');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Error issuing invoice. Please verify connection and inputs.');
    } finally {
      setIssuingInvoice(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const exportCSV = (moduleType) => {
    let csvContent = "";
    
    if (moduleType === 'income' || activeModule === 'income') {
      csvContent += "Unit,Room Type,Floor,Base Rent,Water,Electricity,Services,Parking,Deposits,Total Collected,% Gross Contribution,Invoices Count\r\n";
      (data?.unitIncome || []).forEach(u => {
        csvContent += `"${u.unit}","${u.roomType || 'Standard'}",${u.floor || 1},${u.rent || 0},${u.water || 0},${u.electric || 0},${u.services || 0},${u.parking || 0},${u.deposit || 0},${u.total || 0},"${u.pct || 0}%",${u.invoicesCount || 0}\r\n`;
      });
      csvContent += "\r\n--- Income Statement Summary ---\r\n";
      csvContent += `Gross Revenue,${data?.incomeStatement?.grossRevenue || 0}\r\n`;
      csvContent += `Rental Revenue,${data?.incomeStatement?.rentalRevenue || 0}\r\n`;
      csvContent += `Add-On Service Revenue,${data?.incomeStatement?.serviceRevenue || 0}\r\n`;
      csvContent += `Utility Recovery,${data?.incomeStatement?.utilityRevenue || 0}\r\n`;
      csvContent += `Maintenance Expenses,${data?.incomeStatement?.maintenanceExpenses || 0}\r\n`;
      csvContent += `Other Building Expenses,${data?.incomeStatement?.otherExpenses || 0}\r\n`;
      csvContent += `Operating Expenses,${data?.incomeStatement?.operatingExpenses || 0}\r\n`;
      csvContent += `Net Operating Income,${data?.incomeStatement?.netOperatingIncome || 0}\r\n`;
      csvContent += `Net Margin,${data?.incomeStatement?.netMarginPct || 0}%\r\n`;
      csvContent += `Collection Efficiency,${data?.incomeStatement?.collectionEfficiency || 0}%\r\n`;
      csvContent += `Outstanding Arrears,${data?.incomeStatement?.totalOutstanding || 0}\r\n`;
    } else if (moduleType === 'streams' || activeModule === 'streams') {
      csvContent += "Revenue Stream Category,Amount Collected,Percentage Share,Prior Period Amount,Period Growth (%)\r\n";
      (data?.revenueStreams || []).forEach(s => {
        csvContent += `"${s.category}",${s.amount},"${s.pct}%",${s.prevAmount},"${s.growthPct}%"\r\n`;
      });
    } else if (moduleType === 'occupancy' || activeModule === 'occupancy') {
      csvContent += "Unit,Tenant Name,Email,Phone,Rent,Move-In Date,Lease End,Status\r\n";
      (data?.occupancy?.tenantList || []).forEach(t => {
        csvContent += `"${t.unit}","${t.name}","${t.email}","${t.phone}",${t.rent},"${t.moveIn}","${t.leaseEnd}","${t.status}"\r\n`;
      });
    } else if (moduleType === 'payments' || activeModule === 'payments') {
      csvContent += "Receipt ID,Tenant,Unit,Billing Period,Total Amount Paid,Date Paid,Payment Method,Details\r\n";
      (data?.payments?.records || []).forEach(r => {
        csvContent += `"${r.id}","${r.tenant}","${r.unit}","${r.period}",${r.amount},"${r.datePaid}","${r.method}","${r.breakdown}"\r\n`;
      });
    } else if (moduleType === 'maintenance' || activeModule === 'maintenance') {
      csvContent += "Request ID,Unit,Tenant,Category,Urgency,Date Submitted,Status,Description,Cost\r\n";
      (data?.maintenance?.records || []).forEach(m => {
        csvContent += `"${m.id}","${m.unit}","${m.tenant}","${m.category}","${m.urgency}","${m.dateSubmitted}","${m.status}","${m.description}",${m.cost || 0}\r\n`;
      });
    } else if (moduleType === 'utilities' || activeModule === 'utilities') {
      csvContent += "Unit,Water (m3),Electricity (kWh),Total Utility Cost\r\n";
      (utilityData?.topUnits || []).forEach(u => {
        csvContent += `"${u.unit}",${u.waterM3},${u.electricKwh},${u.totalCost}\r\n`;
      });
      csvContent += `\r\n--- Utilities Summary ---\r\n`;
      csvContent += `Total Water,${utilityData?.water?.totalM3} m3\r\n`;
      csvContent += `Avg Water/Unit-Month,${utilityData?.water?.avgM3} m3\r\n`;
      csvContent += `Total Electricity,${utilityData?.electric?.totalKwh} kWh\r\n`;
      csvContent += `Avg Electricity/Unit-Month,${utilityData?.electric?.avgKwh} kWh\r\n`;
      csvContent += `Total Utility Billed,${utilityData?.financials?.totalBilled}\r\n`;
      csvContent += `Total Utility Collected,${utilityData?.financials?.totalCollected}\r\n`;
      csvContent += `Utility Outstanding,${utilityData?.financials?.outstanding}\r\n`;
      csvContent += `Readings Pending Sync,${utilityData?.pendingSync?.count} (${utilityData?.pendingSync?.amount})\r\n`;
      csvContent += `Usage Spikes (>${utilityData?.spikeThresholdPct}%),${utilityData?.spikeCount}\r\n`;
      if (utilityData?.coverage) {
        csvContent += `Occupied Units Not Yet Read,"${utilityData.coverage.missingUnits.join(' ')}"\r\n`;
      }
    } else {
      csvContent += "ID,Type,Name,Unit/Vehicle,Amount,Duration (Months),Date,Status\r\n";
      (data?.reservations?.roomList || []).forEach(r => {
        csvContent += `"${r.id}","Room Application","${r.name}","${r.unit}",${r.rent},${r.duration || 6},"${r.dateSubmitted}","${r.status}"\r\n`;
      });
      (data?.reservations?.parkingList || []).forEach(p => {
        csvContent += `"${p.id}","Parking reservation","${p.tenant}","${p.vehicleModel || 'Vehicle'}",${p.totalCost},${p.duration || 1},"${p.dateSubmitted}","${p.status}"\r\n`;
      });
    }

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const filename = `AMS_Report_${timeframe}_${selectedYear}${timeframe === 'monthly' ? '_' + selectedMonth : timeframe === 'quarterly' ? '_Q' + selectedQuarter : ''}_${activeModule}.csv`;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading || !data) {
    return (
      <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
        <div className="print:hidden">
          <Sidebar />
        </div>
        <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50">
          <div className="print:hidden">
            <Header title="Reports & Analytics" />
          </div>
          <div className="flex-1 flex items-center justify-center bg-slate-50">
            <div className="text-center space-y-4">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-sm font-semibold text-slate-600">Loading reports and financial analytics...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`flex min-h-screen bg-slate-50 font-sans text-slate-900 ${showInvoiceModal ? 'print:h-auto print:overflow-visible print:bg-white' : 'h-screen overflow-hidden print:h-auto print:overflow-visible print:bg-white'}`}>
      {/* Sidebar (Hidden on Print) */}
      <div className="print:hidden">
        <Sidebar />
      </div>

      {/* Main Container */}
      <main className={`flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50 print:bg-white print:overflow-visible print:h-auto ${showInvoiceModal ? 'print:hidden' : ''}`}>
        {/* Header (Hidden on Print) */}
        <div className="print:hidden">
          <Header title="Reports & Analytics" />
        </div>

        {/* Dashboard Workspace */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 print:p-0 print:overflow-visible print:h-auto">
          <div className="max-w-7xl mx-auto space-y-6 print:space-y-4 print:max-w-none print:w-full">
            
            {/* PRINT-ONLY BUSINESS REPORT HEADER */}
            <div className="hidden print:block border-b-2 border-slate-800 pb-4 mb-6 text-center">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 uppercase">Apartment Complex Management System</h1>
              <p className="text-sm text-slate-500 uppercase tracking-widest mt-1">Official Management Performance & Financial Audit Report</p>
              <div className="grid grid-cols-2 mt-4 text-xs text-left text-slate-700 bg-slate-100 p-3 rounded">
                <div>
                  <p><strong>Report Scope:</strong> {timeframe === 'yearly' ? `Yearly Review (${selectedYear})` : timeframe === 'quarterly' ? `Quarterly Review (Q${selectedQuarter} ${selectedYear})` : `Monthly Review (${monthsList.find(m => m.value === selectedMonth)?.label} ${selectedYear})`}</p>
                  <p><strong>Active Module Scope:</strong> {activeModule.toUpperCase()}</p>
                </div>
                <div className="text-right">
                  <p><strong>Date Generated:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  <p><strong>Prepared by:</strong> {(() => {
                    const u = JSON.parse(sessionStorage.getItem('loggedInUser') || localStorage.getItem('loggedInUser') || '{}');
                    return [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Administrator';
                  })()}</p>
                </div>
              </div>
            </div>

            {/* Controls Bar (Hidden on Print) */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 print:hidden">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 m-0">
                    <FontAwesomeIcon icon={faSlidersH} className="text-indigo-600" />
                    Report Scoping & Filters
                  </h2>
                  <p className="text-xs text-slate-500 m-0 mt-1">Select scope and dates to dynamically calculate income statements, revenue streams, and property operations.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Monthly vs Quarterly vs Yearly Scoping Selectors */}
                  <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button
                      onClick={() => setTimeframe('monthly')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all ${timeframe === 'monthly' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                      Monthly
                    </button>
                    <button
                      onClick={() => setTimeframe('quarterly')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all ${timeframe === 'quarterly' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                      Quarterly
                    </button>
                    <button
                      onClick={() => setTimeframe('yearly')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all ${timeframe === 'yearly' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                      Yearly
                    </button>
                  </div>

                  {/* Quarter Selection */}
                  {timeframe === 'quarterly' && (
                    <select
                      value={selectedQuarter}
                      onChange={(e) => setSelectedQuarter(Number(e.target.value))}
                      className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg outline-none bg-white text-slate-700 focus:border-indigo-500"
                    >
                      <option value={1}>Q1 (Jan - Mar)</option>
                      <option value={2}>Q2 (Apr - Jun)</option>
                      <option value={3}>Q3 (Jul - Sep)</option>
                      <option value={4}>Q4 (Oct - Dec)</option>
                    </select>
                  )}

                  {/* Month Selection */}
                  {timeframe === 'monthly' && (
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(Number(e.target.value))}
                      className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg outline-none bg-white text-slate-700 focus:border-indigo-500"
                    >
                      {monthsList.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  )}

                  {/* Year Selection */}
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg outline-none bg-white text-slate-700 focus:border-indigo-500"
                  >
                    {yearsList.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>

                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
                  >
                    <FontAwesomeIcon icon={faPrint} /> Print / PDF
                  </button>

                  <button
                    onClick={() => exportCSV(activeModule)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
                  >
                    <FontAwesomeIcon icon={faDownload} /> Export CSV
                  </button>

                  <button
                    onClick={openGenerateInvoiceModal}
                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-sm border-0 cursor-pointer"
                  >
                    <FontAwesomeIcon icon={faFileInvoiceDollar} /> Generate Invoice
                  </button>
                </div>
              </div>

              {/* Summary Stats Line */}
              <div className="flex items-center justify-end border-t border-slate-100 pt-3">
                <span className="text-[10px] text-slate-400">
                  Gross: {formatCurrency(data.payments.totalCollected)} • {data.payments.records.length} paid invoices • {data.unitIncome?.length || 0} revenue-generating units
                </span>
              </div>
            </div>

            {/* Module Filter Navigation Tabs (Hidden on Print) */}
            <div className="border-b border-slate-200 print:hidden">
              <nav className="flex gap-1 overflow-x-auto pb-1">
                {[
                  { id: 'all', label: 'Overview', icon: faChartBar },
                  { id: 'income', label: 'Income Reports', icon: faReceipt },
                  { id: 'streams', label: 'Revenue Streams', icon: faLayerGroup },
                  { id: 'occupancy', label: 'Occupancy', icon: faBuilding },
                  { id: 'payments', label: 'Payments & Bills', icon: faDollarSign },
                  { id: 'maintenance', label: 'Maintenance', icon: faWrench },
                  { id: 'reservations', label: 'Reservations', icon: faSquareParking },
                  { id: 'utilities', label: 'Utilities Analytics', icon: faTint },
                  { id: 'gaps', label: 'Management Gaps', icon: faShieldAlt }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveModule(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                      activeModule === tab.id
                        ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50 rounded-t-lg'
                        : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                    }`}
                  >
                    <FontAwesomeIcon icon={tab.icon} />
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* ==================================================== */}
            {/* KPI METRIC CARDS GRID (Tailored by Module) */}
            {/* ==================================================== */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${activeModule === 'income' || activeModule === 'streams' ? 'lg:grid-cols-4' : activeModule === 'occupancy' ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4`}>
              
              {/* All / Overview KPI Cards */}
              {activeModule === 'all' && (
                <>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center"><FontAwesomeIcon icon={faDollarSign} /></div>
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Gross Revenue</p>
                        <p className="text-lg font-bold text-slate-800 m-0">{formatCurrency(data.payments.totalCollected)}</p>
                      </div>
                    </div>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 flex items-center gap-1 w-fit">
                      Net Income: {formatCurrency(data.payments.netIncome)}
                    </span>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><FontAwesomeIcon icon={faBuilding} /></div>
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Occupancy Rate</p>
                        <p className="text-lg font-bold text-slate-800 m-0">{data.occupancy.occupancyRate}%</p>
                      </div>
                    </div>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 flex items-center gap-1 w-fit">
                      {data.occupancy.occupiedUnits} / {data.occupancy.totalUnits} Units Renting
                    </span>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><FontAwesomeIcon icon={faWrench} /></div>
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Active Maintenance</p>
                        <p className="text-lg font-bold text-slate-800 m-0">{data.maintenance.pending + data.maintenance.inProgress}</p>
                      </div>
                    </div>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 flex items-center gap-1 w-fit">
                      {data.maintenance.completed} Completed Tickets
                    </span>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center"><FontAwesomeIcon icon={faSquareParking} /></div>
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Reservations Value</p>
                        <p className="text-lg font-bold text-slate-800 m-0">{formatCurrency(data.reservations.parkingRevenue)}</p>
                      </div>
                    </div>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 flex items-center gap-1 w-fit">
                      {data.reservations.parkingCount} Vehicles Registered
                    </span>
                  </div>
                </>
              )}

              {/* 8.2 Income Reports KPI Cards */}
              {activeModule === 'income' && (
                <>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Gross Revenue Collected</p>
                    <p className="text-xl font-bold text-slate-800 m-0 mt-1">{formatCurrency(data.incomeStatement.grossRevenue)}</p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${data.incomeStatement.revenueGrowthPct >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        <FontAwesomeIcon icon={data.incomeStatement.revenueGrowthPct >= 0 ? faArrowUp : faArrowDown} />
                        {Math.abs(data.incomeStatement.revenueGrowthPct)}% vs prior period
                      </span>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Net Operating Income (NOI)</p>
                    <p className="text-xl font-bold text-emerald-600 m-0 mt-1">{formatCurrency(data.incomeStatement.netOperatingIncome)}</p>
                    <span className="text-[9px] text-slate-500 mt-2 block">
                      Operating Margin: <strong>{data.incomeStatement.netMarginPct}%</strong>
                    </span>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Operating Deductions</p>
                    <p className="text-xl font-bold text-red-600 m-0 mt-1">{formatCurrency(data.incomeStatement.operatingExpenses)}</p>
                    <span className="text-[9px] text-slate-500 mt-2 block">
                      Maint: {formatCurrency(data.incomeStatement.maintenanceExpenses)} • Other: {formatCurrency(data.incomeStatement.otherExpenses)} • Ops: {formatCurrency(data.incomeStatement.operatingOverhead)}
                    </span>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Collection Efficiency</p>
                    <p className="text-xl font-bold text-indigo-600 m-0 mt-1">{data.incomeStatement.collectionEfficiency}%</p>
                    <span className="text-[9px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded font-semibold w-fit mt-2 block">
                      Outstanding: {formatCurrency(data.incomeStatement.totalOutstanding)}
                    </span>
                  </div>
                </>
              )}

              {/* 8.3 Revenue Streams KPI Cards */}
              {activeModule === 'streams' && (
                <>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Core Base Rent Share</p>
                    <p className="text-xl font-bold text-indigo-600 m-0 mt-1">{data.diversification.coreRentPct}%</p>
                    <span className="text-[9px] text-slate-500 mt-2 block">{formatCurrency(data.payments.rentCollected)} from unit leases</span>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Utility Recovery Share</p>
                    <p className="text-xl font-bold text-amber-600 m-0 mt-1">{data.diversification.utilitiesPct}%</p>
                    <span className="text-[9px] text-slate-500 mt-2 block">{formatCurrency(data.payments.waterCollected + data.payments.electricCollected)} electricity & water</span>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Ancillary & Parking Share</p>
                    <p className="text-xl font-bold text-pink-600 m-0 mt-1">{data.diversification.ancillaryPct}%</p>
                    <span className="text-[9px] text-slate-500 mt-2 block">{formatCurrency(data.payments.parkingCollected + data.payments.depositCollected)} parking & fees</span>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Active Streams Count</p>
                    <p className="text-xl font-bold text-slate-800 m-0 mt-1">{data.revenueStreams.filter(s => s.amount > 0).length} Categories</p>
                    <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-semibold w-fit mt-2 block">100% Diversified Tracking</span>
                  </div>
                </>
              )}

              {/* Occupancy Module Cards */}
              {activeModule === 'occupancy' && (
                <>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Occupancy Rate</p>
                    <p className="text-xl font-bold text-slate-800 m-0 mt-1">{data.occupancy.occupancyRate}%</p>
                    <span className="text-[9px] text-slate-500 mt-2 block">Rate relative to {data.occupancy.totalUnits} unit building</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Occupied Units</p>
                    <p className="text-xl font-bold text-emerald-600 m-0 mt-1">{data.occupancy.occupiedUnits}</p>
                    <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-semibold w-fit mt-2 block">Active Tenants</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Vacant Units</p>
                    <p className="text-xl font-bold text-slate-600 m-0 mt-1">{data.occupancy.vacantUnits}</p>
                    <span className="text-[9px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-semibold w-fit mt-2 block">Available to Lease</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Move-Ins / Move-Outs</p>
                    <p className="text-xl font-bold text-indigo-600 m-0 mt-1">+{data.occupancy.moveIns} / -{data.occupancy.moveOuts}</p>
                    <span className="text-[9px] text-slate-500 mt-2 block">Contract modifications</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Average Lease Term</p>
                    <p className="text-xl font-bold text-emerald-600 m-0 mt-1">{data.occupancy.avgStayDuration} Mos</p>
                    <span className="text-[9px] text-slate-500 mt-2 block">Contracted months across all tenancies</span>
                  </div>
                </>
              )}

              {/* Payments Module Cards */}
              {activeModule === 'payments' && (
                <>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Gross Collection</p>
                    <p className="text-xl font-bold text-slate-800 m-0 mt-1">{formatCurrency(data.payments.totalCollected)}</p>
                    <span className="text-[9px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded font-semibold w-fit mt-2 block">Rent & Utilities Combined</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Operating Expenses</p>
                    <p className="text-xl font-bold text-red-600 m-0 mt-1">{formatCurrency(data.payments.expenses)}</p>
                    <span className="text-[9px] text-slate-500 mt-2 block">Maintenance & Facilities</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Net Income</p>
                    <p className="text-xl font-bold text-emerald-600 m-0 mt-1">{formatCurrency(data.payments.netIncome)}</p>
                    <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-semibold w-fit mt-2 block">Operating Profit</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Collection Efficiency</p>
                    <p className="text-xl font-bold text-indigo-600 m-0 mt-1">{data.payments.collectionEfficiency}%</p>
                    <span className="text-[9px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded font-semibold w-fit mt-2 block">
                      Outstanding: {formatCurrency(data.payments.totalOutstanding)}
                    </span>
                  </div>
                </>
              )}

              {/* Maintenance Module Cards */}
              {activeModule === 'maintenance' && (
                <>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Total Tickets</p>
                    <p className="text-xl font-bold text-slate-800 m-0 mt-1">{data.maintenance.total}</p>
                    <span className="text-[9px] text-slate-500 mt-2 block">Requests submitted</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Completed Tasks</p>
                    <p className="text-xl font-bold text-emerald-600 m-0 mt-1">{data.maintenance.completed}</p>
                    <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-semibold w-fit mt-2 block">
                      Completion: {Math.round((data.maintenance.completed / (data.maintenance.total || 1)) * 100)}%
                    </span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Pending / In-Progress</p>
                    <p className="text-xl font-bold text-amber-600 m-0 mt-1">{data.maintenance.pending} / {data.maintenance.inProgress}</p>
                    <span className="text-[9px] text-slate-500 mt-2 block">Work orders assigned</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Maintenance Cost</p>
                    <p className="text-xl font-bold text-slate-800 m-0 mt-1">{formatCurrency(data.maintenance.totalCost)}</p>
                    <span className={`text-[9px] mt-2 block font-semibold ${data.maintenance.budget > 0 && data.maintenance.totalCost > data.maintenance.budget ? 'text-red-600' : 'text-slate-500'}`}>
                      of {formatCurrency(data.maintenance.budget)} budget
                      {data.maintenance.avgResolutionTime !== null && ` • Avg resolution ${data.maintenance.avgResolutionTime}h`}
                    </span>
                  </div>
                </>
              )}

              {/* Reservations Module Cards */}
              {activeModule === 'reservations' && (
                <>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Room Rent Applications</p>
                    <p className="text-xl font-bold text-slate-800 m-0 mt-1">{data.reservations.roomApps}</p>
                    <span className="text-[9px] text-slate-500 mt-2 block">Total lease applications</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Room App Statuses</p>
                    <p className="text-sm font-semibold text-indigo-600 m-0 mt-1">
                      {data.reservations.roomApproved} Approved • {data.reservations.roomPending} Pending
                    </p>
                    <span className="text-[9px] text-red-600 mt-2 block">{data.reservations.roomRejected} Rejected Applications</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Parking Slot Reservations</p>
                    <p className="text-xl font-bold text-slate-800 m-0 mt-1">{data.reservations.parkingCount}</p>
                    <span className="text-[9px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded font-semibold w-fit mt-2 block">Active assignments</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Parking Revenue</p>
                    <p className="text-xl font-bold text-emerald-600 m-0 mt-1">{formatCurrency(data.reservations.parkingRevenue)}</p>
                    <span className="text-[9px] text-slate-500 mt-2 block">Collected from vehicle permits</span>
                  </div>
                </>
              )}

              {/* Utilities Module Cards */}
              {activeModule === 'utilities' && utilityData && (
                <>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><FontAwesomeIcon icon={faTint} /></div>
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Water Consumed</p>
                        <p className="text-lg font-bold text-slate-800 m-0">{utilityData.water.totalM3} m³</p>
                      </div>
                    </div>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 flex items-center gap-1 w-fit">
                      Avg: {utilityData.water.avgM3} m³ / unit-month • Billed: {formatCurrency(utilityData.water.totalBilled)}
                    </span>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center"><FontAwesomeIcon icon={faBolt} /></div>
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Electricity Consumed</p>
                        <p className="text-lg font-bold text-slate-800 m-0">{utilityData.electric.totalKwh} kWh</p>
                      </div>
                    </div>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 flex items-center gap-1 w-fit">
                      Avg: {utilityData.electric.avgKwh} kWh / unit-month • Billed: {formatCurrency(utilityData.electric.totalBilled)}
                    </span>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Financial Recovery</p>
                    {utilityData.financials.totalBilled > 0 ? (
                      <>
                        <p className="text-xl font-bold text-slate-800 m-0 mt-1">{utilityData.financials.recoveryRate}%</p>
                        <span className={`text-[9px] font-semibold w-fit mt-2 block px-1.5 py-0.5 rounded ${utilityData.financials.recoveryRate >= 90 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                          Collected {formatCurrency(utilityData.financials.totalCollected)} of {formatCurrency(utilityData.financials.totalBilled)}
                        </span>
                      </>
                    ) : (
                      <>
                        <p className="text-xl font-bold text-slate-400 m-0 mt-1">—</p>
                        <span className="text-[9px] text-slate-500 mt-2 block">No utility charges invoiced this period</span>
                      </>
                    )}
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Units Read</p>
                    <p className="text-xl font-bold text-slate-800 m-0 mt-1">
                      {utilityData.coverage ? `${utilityData.coverage.unitsRead} / ${utilityData.coverage.occupiedUnits}` : utilityData.water.totalUnits}
                    </p>
                    <span className="text-[9px] text-slate-500 mt-2 block">
                      {utilityData.coverage ? 'Occupied units with a reading this month' : 'Units with readings this period'}
                      {utilityData.spikeCount > 0 && <strong className="text-rose-600"> • {utilityData.spikeCount} usage spike{utilityData.spikeCount === 1 ? '' : 's'}</strong>}
                    </span>
                  </div>
                </>
              )}

            </div>

            {/* ==================================================== */}
            {/* 8.2 INCOME REPORTS DEDICATED VIEW */}
            {/* ==================================================== */}
            {(activeModule === 'income' || activeModule === 'all') && (
              <div className="space-y-6">
                
                {/* Income Statement Detailed Financial Box */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden print:border-slate-300 print:shadow-none">
                  <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center print:bg-white">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 m-0">
                        <FontAwesomeIcon icon={faReceipt} className="text-indigo-600" />
                        Comprehensive Income Statement
                      </h3>
                      <p className="text-xs text-slate-500 m-0 mt-0.5">
                        Operating revenue statement for {timeframe === 'yearly' ? selectedYear : timeframe === 'quarterly' ? `Q${selectedQuarter} ${selectedYear}` : `${monthsList.find(m => m.value === selectedMonth)?.label} ${selectedYear}`}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 print:hidden">
                      Net Margin: {data.incomeStatement.netMarginPct}%
                    </span>
                  </div>

                  <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Left: Operating Revenue Streams */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-2 flex justify-between">
                          <span>Operating Inflows (Collections)</span>
                          <span>Amount</span>
                        </h4>
                        <div className="flex justify-between text-xs py-1 text-slate-700">
                          <span className="flex items-center gap-2"><FontAwesomeIcon icon={faBuilding} className="text-indigo-500 w-3.5" /> Base Room Rent Collections</span>
                          <span className="font-semibold">{formatCurrency(data.payments.rentCollected)}</span>
                        </div>
                        <div className="flex justify-between text-xs py-1 text-slate-700">
                          <span className="flex items-center gap-2"><FontAwesomeIcon icon={faBolt} className="text-amber-500 w-3.5" /> Electricity Utility Recovery</span>
                          <span className="font-semibold">{formatCurrency(data.payments.electricCollected)}</span>
                        </div>
                        <div className="flex justify-between text-xs py-1 text-slate-700">
                          <span className="flex items-center gap-2"><FontAwesomeIcon icon={faTint} className="text-blue-500 w-3.5" /> Water Utility Recovery</span>
                          <span className="font-semibold">{formatCurrency(data.payments.waterCollected)}</span>
                        </div>
                        <div className="flex justify-between text-xs py-1 text-slate-700">
                          <span className="flex items-center gap-2"><FontAwesomeIcon icon={faSquareParking} className="text-pink-500 w-3.5" /> Parking Permits & Space</span>
                          <span className="font-semibold">{formatCurrency(data.payments.parkingCollected)}</span>
                        </div>
                        {data.payments.depositCollected > 0 && (
                          <div className="flex justify-between text-xs py-1 text-slate-700">
                            <span className="flex items-center gap-2"><FontAwesomeIcon icon={faShieldAlt} className="text-emerald-500 w-3.5" /> Security Deposits & Fees</span>
                            <span className="font-semibold">{formatCurrency(data.payments.depositCollected)}</span>
                          </div>
                        )}
                        {data.payments.lateFeesCollected > 0 && (
                          <div className="flex justify-between text-xs py-1 text-slate-700">
                            <span className="flex items-center gap-2"><FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500 w-3.5" /> Late Payment Fees</span>
                            <span className="font-semibold">{formatCurrency(data.payments.lateFeesCollected)}</span>
                          </div>
                        )}
                        <div className="border-t border-slate-200 pt-2 flex justify-between text-xs font-bold text-slate-900 bg-indigo-50/60 p-2.5 rounded-lg">
                          <span>Total Gross Revenue Collected</span>
                          <span className="text-indigo-700 font-extrabold">{formatCurrency(data.incomeStatement.grossRevenue)}</span>
                        </div>
                      </div>

                      {/* Right: Operating Deductions & Net Margin */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-2 flex justify-between">
                          <span>Operating Deductions & Overhead</span>
                          <span>Amount</span>
                        </h4>
                        <div className="flex justify-between text-xs py-1 text-slate-700">
                          <span className="flex items-center gap-2"><FontAwesomeIcon icon={faWrench} className="text-red-500 w-3.5" /> Direct Maintenance & Repairs</span>
                          <span className="font-semibold text-red-600">({formatCurrency(data.incomeStatement.maintenanceExpenses)})</span>
                        </div>
                        <div className="flex justify-between items-center text-xs py-1 text-slate-700">
                          <span className="flex items-center gap-2">
                            <FontAwesomeIcon icon={faReceipt} className="text-red-500 w-3.5" /> Other Building Expenses
                            <button
                              type="button"
                              onClick={() => setShowExpensesModal(true)}
                              className="print:hidden text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 cursor-pointer"
                            >
                              Manage
                            </button>
                          </span>
                          <span className="font-semibold text-red-600">({formatCurrency(data.incomeStatement.otherExpenses)})</span>
                        </div>
                        {(data.incomeStatement.expenseBreakdown || []).map((b) => (
                          <div key={b.category} className="flex justify-between text-[11px] pl-6 text-slate-500">
                            <span>{expenseCategoryLabel(b.category)}</span>
                            <span>({formatCurrency(b.amount)})</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-xs py-1 text-slate-700">
                          <span className="flex items-center gap-2"><FontAwesomeIcon icon={faSlidersH} className="text-slate-500 w-3.5" /> Facility & Operations Overhead ({data.incomeStatement.overheadPct ? `${data.incomeStatement.overheadPct}%` : 'not configured'})</span>
                          <span className="font-semibold text-red-600">({formatCurrency(data.incomeStatement.operatingOverhead)})</span>
                        </div>
                        <div className="flex justify-between text-xs py-1 text-slate-700">
                          <span className="flex items-center gap-2"><FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-500 w-3.5" /> Outstanding Arrears / Uncollected</span>
                          <span className="font-semibold text-amber-600">{formatCurrency(data.incomeStatement.totalOutstanding)}</span>
                        </div>
                        <div className="border-t border-slate-200 pt-2 flex justify-between text-xs font-bold text-slate-900 bg-red-50/60 p-2.5 rounded-lg">
                          <span>Total Operating Deductions</span>
                          <span className="text-red-700 font-extrabold">({formatCurrency(data.incomeStatement.operatingExpenses)})</span>
                        </div>

                        {/* Bottom Line Net Operating Income */}
                        <div className="mt-4 p-3 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl flex justify-between items-center">
                          <div>
                            <span className="text-[11px] uppercase tracking-wider font-bold text-emerald-800 block">Net Operating Income (NOI)</span>
                            <span className="text-[10px] text-emerald-600 font-medium">Profit Margin: {data.incomeStatement.netMarginPct}%</span>
                          </div>
                          <span className="text-lg font-black text-emerald-700">{formatCurrency(data.incomeStatement.netOperatingIncome)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Unit-by-Unit Income Performance Table */}
                {activeModule === 'income' && (
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden print:border-slate-300 print:shadow-none">
                    <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center print:bg-white">
                      <div>
                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 m-0">
                          <FontAwesomeIcon icon={faBuilding} className="text-indigo-600" />
                          Unit-by-Unit Income & Revenue Ledger
                        </h3>
                        <p className="text-xs text-slate-500 m-0 mt-0.5">Ranking and revenue decomposition by individual room and unit type</p>
                      </div>
                      <span className="text-xs text-slate-500 font-semibold print:hidden">
                        {data.unitIncome?.length || 0} Units Generating Revenue
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-100/75 border-b border-slate-200">
                          <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            <th className="py-3 px-4 font-extrabold">Unit</th>
                            <th className="py-3 px-4">Type / Floor</th>
                            <th className="py-3 px-4 text-right">Rent</th>
                            <th className="py-3 px-4 text-right">Water</th>
                            <th className="py-3 px-4 text-right">Electricity</th>
                            <th className="py-3 px-4 text-right">Services</th>
                            <th className="py-3 px-4 text-right">Parking / Dep</th>
                            <th className="py-3 px-4 text-right font-extrabold text-indigo-900">Total Income</th>
                            <th className="py-3 px-4 text-center">% Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(data.unitIncome || []).map((u, idx) => (
                            <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                              <td className="py-3 px-4 font-bold text-indigo-600">{u.unit}</td>
                              <td className="py-3 px-4 text-slate-600 font-medium">
                                <div>{u.roomType}</div>
                                <div className="text-[10px] text-slate-400">Floor {u.floor}</div>
                              </td>
                              <td className="py-3 px-4 text-right text-slate-700 font-semibold">{formatCurrency(u.rent)}</td>
                              <td className="py-3 px-4 text-right text-slate-600">{formatCurrency(u.water)}</td>
                              <td className="py-3 px-4 text-right text-slate-600">{formatCurrency(u.electric)}</td>
                              <td className="py-3 px-4 text-right text-slate-600">{formatCurrency(u.services || 0)}</td>
                              <td className="py-3 px-4 text-right text-slate-600">{formatCurrency(u.parking + u.deposit)}</td>
                              <td className="py-3 px-4 text-right font-extrabold text-emerald-600">{formatCurrency(u.total)}</td>
                              <td className="py-3 px-4 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${Math.min(100, u.pct * 4)}%` }}></div>
                                  </div>
                                  <span className="font-bold text-[10px] text-slate-700">{u.pct}%</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {(!data.unitIncome || data.unitIncome.length === 0) && (
                            <tr>
                              <td colSpan="8" className="text-center py-8 text-slate-400">
                                No unit income recorded for this period.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* ==================================================== */}
            {/* 8.3 REVENUE STREAM ANALYSIS DEDICATED VIEW */}
            {/* ==================================================== */}
            {(activeModule === 'streams' || activeModule === 'all') && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  {/* Stream Distribution Progress Bars */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm print:border-slate-300">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 m-0 flex items-center gap-2">
                      <FontAwesomeIcon icon={faChartPie} className="text-indigo-600" />
                      Revenue Stream Share & Contribution
                    </h3>
                    <div className="space-y-4 pt-2">
                      {(data.revenueStreams || []).map((stream, idx) => (
                        <div key={idx} className="space-y-1.5">
                          <div className="flex justify-between text-xs font-semibold">
                            <span className="text-slate-700 flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stream.color }}></span>
                              {stream.category}
                            </span>
                            <span className="text-slate-800 font-bold">
                              {formatCurrency(stream.amount)} <span className="text-slate-400 text-[10px] font-normal">({stream.pct}%)</span>
                            </span>
                          </div>
                          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all duration-500" 
                              style={{ width: `${stream.pct}%`, backgroundColor: stream.color }}
                            ></div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-6 pt-4 border-t border-slate-100 text-center">
                      <div className="p-2 bg-indigo-50/50 rounded-lg border border-indigo-100">
                        <span className="text-[9px] text-slate-400 uppercase font-bold block">Core Leases</span>
                        <span className="text-xs font-bold text-indigo-700">{data.diversification.coreRentPct}%</span>
                      </div>
                      <div className="p-2 bg-amber-50/50 rounded-lg border border-amber-100">
                        <span className="text-[9px] text-slate-400 uppercase font-bold block">Utilities</span>
                        <span className="text-xs font-bold text-amber-700">{data.diversification.utilitiesPct}%</span>
                      </div>
                      <div className="p-2 bg-pink-50/50 rounded-lg border border-pink-100">
                        <span className="text-[9px] text-slate-400 uppercase font-bold block">Ancillary</span>
                        <span className="text-xs font-bold text-pink-700">{data.diversification.ancillaryPct}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Multi-Stream Historical Trend SVG Visual */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm print:border-slate-300">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 m-0 flex items-center gap-2">
                      <FontAwesomeIcon icon={faChartLine} className="text-indigo-600" />
                      Multi-Stream 6-Month Category Trends
                    </h3>

                    {/* SVG Multi-Stream Grouped Bar Chart */}
                    <div className="relative h-48 flex items-end gap-2 pb-5 pt-3">
                      {/* Y-Axis Guidelines */}
                      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none text-[8px] text-slate-400 select-none border-l border-slate-100 pl-1">
                        <div className="border-t border-slate-100 pt-0.5">{formatCurrency(maxRevenueTrend)}</div>
                        <div className="border-t border-slate-100 pt-0.5">{formatCurrency(maxRevenueTrend * 0.5)}</div>
                        <div className="border-t border-slate-200">₱0</div>
                      </div>

                      {/* Stacked Streams Bars */}
                      <div className="flex-grow h-full flex items-end justify-around pl-16 z-10">
                        {trendPoints.map((p, idx) => {
                          const rHeight = ((p.rent || 0) / maxRevenueTrend) * 100;
                          const eHeight = ((p.electric || 0) / maxRevenueTrend) * 100;
                          const wHeight = ((p.water || 0) / maxRevenueTrend) * 100;
                          const pkHeight = ((p.parking || 0) / maxRevenueTrend) * 100;
                          const dpHeight = ((p.deposit || 0) / maxRevenueTrend) * 100;
                          const hasRevenue = (p.revenue || 0) > 0;

                          return (
                            <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                              {/* Tooltip */}
                              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] p-2 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-all z-50 w-32 pointer-events-none">
                                <p className="font-bold text-slate-300 border-b border-slate-600 pb-0.5 mb-1 text-center">{p.label}</p>
                                <div className="flex justify-between"><span className="text-indigo-300">Rent:</span><span>{formatCurrency(p.rent)}</span></div>
                                <div className="flex justify-between"><span className="text-amber-300">Elec:</span><span>{formatCurrency(p.electric)}</span></div>
                                <div className="flex justify-between"><span className="text-blue-300">Water:</span><span>{formatCurrency(p.water)}</span></div>
                                <div className="flex justify-between"><span className="text-pink-300">Park:</span><span>{formatCurrency(p.parking)}</span></div>
                                <div className="flex justify-between"><span className="text-emerald-300">Deposit:</span><span>{formatCurrency(p.deposit)}</span></div>
                                <div className="flex justify-between font-bold border-t border-slate-600 pt-0.5 mt-0.5"><span className="text-slate-200">Total:</span><span>{formatCurrency(p.revenue)}</span></div>
                              </div>

                              {/* Multi-Stream Stacked Column */}
                              <div className="w-5 sm:w-6 flex flex-col-reverse items-center h-full justify-start overflow-hidden rounded-t">
                                {p.rent > 0 && <div className="w-full bg-indigo-500 opacity-90 hover:opacity-100 transition-opacity" style={{ height: `${rHeight}%` }}></div>}
                                {p.electric > 0 && <div className="w-full bg-amber-500 opacity-90 hover:opacity-100 transition-opacity" style={{ height: `${eHeight}%` }}></div>}
                                {p.water > 0 && <div className="w-full bg-blue-500 opacity-90 hover:opacity-100 transition-opacity" style={{ height: `${wHeight}%` }}></div>}
                                {p.parking > 0 && <div className="w-full bg-pink-500 opacity-90 hover:opacity-100 transition-opacity" style={{ height: `${pkHeight}%` }}></div>}
                                {p.deposit > 0 && <div className="w-full bg-emerald-500 opacity-90 hover:opacity-100 transition-opacity" style={{ height: `${dpHeight}%` }}></div>}
                                {!hasRevenue && (
                                  <div className="w-full bg-slate-200 h-0.5 rounded"></div>
                                )}
                              </div>
                              <span className="text-[9px] font-semibold text-slate-500">{p.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 mt-2 text-[9px] text-slate-500 border-t border-slate-50 pt-3">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-indigo-500"></span> Base Rent</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-500"></span> Electricity</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-500"></span> Water</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-pink-500"></span> Parking</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500"></span> Deposits & Fees</span>
                    </div>
                  </div>

                </div>

                {/* Revenue Stream Breakdown Table */}
                {activeModule === 'streams' && (
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden print:border-slate-300 print:shadow-none">
                    <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center print:bg-white">
                      <div>
                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 m-0">
                          <FontAwesomeIcon icon={faLayerGroup} className="text-indigo-600" />
                          Revenue Stream Performance Audit
                        </h3>
                        <p className="text-xs text-slate-500 m-0 mt-0.5">Stream-level performance, prior period comparison, and growth trajectory</p>
                      </div>
                      <span className="text-xs text-slate-500 font-semibold print:hidden">
                        Total Streams: {data.revenueStreams.length}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-100/75 border-b border-slate-200">
                          <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            <th className="py-3 px-4 font-extrabold">Revenue Stream</th>
                            <th className="py-3 px-4 text-right">Current Revenue</th>
                            <th className="py-3 px-4 text-center">% of Total</th>
                            <th className="py-3 px-4 text-right">Prior Period</th>
                            <th className="py-3 px-4 text-center">Period Growth</th>
                            <th className="py-3 px-4 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.revenueStreams.map((s, idx) => (
                            <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                              <td className="py-3 px-4 font-semibold text-slate-800 flex items-center gap-2.5">
                                <div className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px]" style={{ backgroundColor: s.color }}>
                                  <FontAwesomeIcon icon={s.id === 'rent' ? faBuilding : s.id === 'electric' ? faBolt : s.id === 'water' ? faTint : s.id === 'parking' ? faSquareParking : s.id === 'services' ? faConciergeBell : s.id === 'late_fees' ? faExclamationTriangle : faShieldAlt} />
                                </div>
                                {s.category}
                              </td>
                              <td className="py-3 px-4 text-right font-extrabold text-slate-900">{formatCurrency(s.amount)}</td>
                              <td className="py-3 px-4 text-center font-bold text-indigo-600">{s.pct}%</td>
                              <td className="py-3 px-4 text-right text-slate-500">{formatCurrency(s.prevAmount)}</td>
                              <td className="py-3 px-4 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${s.growthPct >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                  <FontAwesomeIcon icon={s.growthPct >= 0 ? faArrowUp : faArrowDown} className="mr-1" />
                                  {Math.abs(s.growthPct)}%
                                </span>
                              </td>
                              <td className="py-3 px-4 text-center">
                                {/* Derived from the figures; every stream used to read "Healthy" whatever it did. */}
                                {(() => {
                                  const [label, cls] = s.amount === 0 && s.prevAmount === 0
                                    ? ['No revenue', 'bg-slate-100 text-slate-500 border-slate-200']
                                    : s.prevAmount === 0
                                      ? ['New', 'bg-indigo-50 text-indigo-700 border-indigo-100']
                                      : s.growthPct <= -10
                                        ? ['Declining', 'bg-red-50 text-red-700 border-red-100']
                                        : s.growthPct >= 10
                                          ? ['Growing', 'bg-emerald-50 text-emerald-700 border-emerald-100']
                                          : ['Stable', 'bg-slate-50 text-slate-700 border-slate-200'];
                                  return (
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wide ${cls}`}>
                                      {label}
                                    </span>
                                  );
                                })()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==================================================== */}
            {/* VISUAL CHARTS SECTION (SVG Custom Rendering for Other Modules) */}
            {/* ==================================================== */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:grid-cols-2">
              
              {/* Chart 1: Revenue vs Expenses (All / Payments) */}
              {(activeModule === 'all' || activeModule === 'payments') && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm print:border-slate-300 print:break-inside-avoid">
                  <h3 className="text-sm font-bold text-slate-800 mb-5 m-0 flex items-center gap-2">
                    <FontAwesomeIcon icon={faChartBar} className="text-indigo-600" />
                    Revenue vs Operating Expenses
                  </h3>
                  
                  {/* Custom SVG Bar Chart */}
                  <div className="relative h-48 flex items-end gap-2 pb-5 pt-3">
                    {/* Y-Axis Guidelines */}
                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none text-[8px] text-slate-400 select-none border-l border-slate-100 pl-1">
                      <div className="border-t border-slate-100 pt-0.5">{formatCurrency(maxRevenueTrend)}</div>
                      <div className="border-t border-slate-100 pt-0.5">{formatCurrency(maxRevenueTrend * 0.75)}</div>
                      <div className="border-t border-slate-100 pt-0.5">{formatCurrency(maxRevenueTrend * 0.5)}</div>
                      <div className="border-t border-slate-100 pt-0.5">{formatCurrency(maxRevenueTrend * 0.25)}</div>
                      <div className="border-t border-slate-200">₱0</div>
                    </div>

                    {/* Bars Container */}
                    <div className="flex-grow h-full flex items-end justify-around pl-16 z-10">
                      {trendPoints.map((p, idx) => (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                          {/* Tooltip */}
                          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] p-2 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-all z-50 w-24 pointer-events-none">
                            <p className="font-bold text-slate-300 border-b border-slate-600 pb-0.5 mb-1 text-center">{p.label}</p>
                            <div className="flex justify-between"><span className="text-slate-400">Rev:</span><span className="font-bold text-emerald-400">{formatCurrency(p.revenue)}</span></div>
                            <div className="flex justify-between"><span className="text-slate-400">Exp:</span><span className="font-bold text-red-400">{formatCurrency(p.expenses)}</span></div>
                          </div>
                          
                          {/* Render Revenue & Expense Double Bars */}
                          <div className="w-full flex gap-1 items-end justify-center h-full">
                            <div 
                              className="w-3 sm:w-4 bg-indigo-500 rounded-t opacity-80 group-hover:opacity-100 transition-all cursor-pointer"
                              style={{ height: `${(p.revenue / maxRevenueTrend) * 100}%` }}
                            ></div>
                            <div 
                              className="w-3 sm:w-4 bg-red-400 rounded-t opacity-75 group-hover:opacity-90 transition-all cursor-pointer"
                              style={{ height: `${(p.expenses / maxRevenueTrend) * 100}%` }}
                            ></div>
                          </div>
                          <span className="text-[9px] font-semibold text-slate-500">{p.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500 border-t border-slate-50 pt-3">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-indigo-500"></span> Total Revenue</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-400"></span> Operating Expenses</span>
                  </div>
                </div>
              )}

              {/* Chart 2: Occupancy Rate Trend Line Chart (Occupancy) */}
              {activeModule === 'occupancy' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm print:border-slate-300 print:break-inside-avoid">
                  <h3 className="text-sm font-bold text-slate-800 mb-5 m-0 flex items-center gap-2">
                    <FontAwesomeIcon icon={faChartLine} className="text-emerald-600" />
                    Occupancy Rate Percentage Trend
                  </h3>

                  {/* SVG Line Chart */}
                  <div className="relative h-48 pb-5 pt-3">
                    <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none">
                      {/* Grid Lines */}
                      <line x1="40" y1="20" x2="480" y2="20" stroke="#f1f5f9" strokeWidth="1" />
                      <line x1="40" y1="65" x2="480" y2="65" stroke="#f1f5f9" strokeWidth="1" />
                      <line x1="40" y1="110" x2="480" y2="110" stroke="#f1f5f9" strokeWidth="1" />
                      <line x1="40" y1="155" x2="480" y2="155" stroke="#f1f5f9" strokeWidth="1" />
                      <line x1="40" y1="175" x2="480" y2="175" stroke="#cbd5e1" strokeWidth="1" />

                      {/* Text Labels Y-axis */}
                      <text x="5" y="24" fill="#94a3b8" fontSize="8" fontWeight="bold">100%</text>
                      <text x="5" y="69" fill="#94a3b8" fontSize="8" fontWeight="bold">75%</text>
                      <text x="5" y="114" fill="#94a3b8" fontSize="8" fontWeight="bold">50%</text>
                      <text x="5" y="159" fill="#94a3b8" fontSize="8" fontWeight="bold">25%</text>
                      <text x="10" y="179" fill="#94a3b8" fontSize="8" fontWeight="bold">0%</text>

                      {/* Dynamic path construction */}
                      {(() => {
                        const width = 440;
                        const height = 155;
                        const step = width / (trendPoints.length - 1 || 1);
                        const points = trendPoints.map((p, i) => {
                          const x = 40 + i * step;
                          // `?? 0`, not `|| 80` — a genuinely empty building (0%
                          // occupied) must render as 0%, not a fake 80% line.
                          // `||` treated the real value 0 as "missing" and
                          // substituted 80 for it.
                          const rate = p.occupancyRate ?? 0;
                          const y = 175 - (rate / 100) * height;
                          return { x, y, label: p.label, rate };
                        });
                        
                        const pathD = points.reduce((acc, p, i) => {
                          return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
                        }, "");

                        return (
                          <>
                            <path 
                              d={`${pathD} L ${points[points.length - 1].x} 175 L 40 175 Z`} 
                              fill="url(#emeraldGrad)" 
                              opacity="0.15" 
                            />
                            <path 
                              d={pathD} 
                              fill="none" 
                              stroke="#059669" 
                              strokeWidth="3" 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                            />
                            <defs>
                              <linearGradient id="emeraldGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" />
                                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                              </linearGradient>
                            </defs>
                            {points.map((p, i) => (
                              <g key={i} className="group cursor-pointer">
                                <circle 
                                  cx={p.x} 
                                  cy={p.y} 
                                  r="5" 
                                  fill="#10b981" 
                                  stroke="#fff" 
                                  strokeWidth="2" 
                                />
                              </g>
                            ))}
                          </>
                        );
                      })()}
                    </svg>
                    
                    {/* X-axis Text labels */}
                    <div className="absolute left-10 right-0 bottom-0 flex justify-between px-1 text-[8px] font-bold text-slate-400">
                      {trendPoints.map((p, i) => <span key={i}>{p.label}</span>)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-500 border-t border-slate-50 pt-3">
                    <span className="w-3.5 h-1 bg-emerald-600 inline-block rounded-full"></span> 
                    Active Lease Occupancy Percentage Trend Line
                  </div>
                </div>
              )}

              {/* Chart 3: Maintenance Status Donut Chart */}
              {activeModule === 'maintenance' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm print:border-slate-300 print:break-inside-avoid">
                  <h3 className="text-sm font-bold text-slate-800 mb-5 m-0 flex items-center gap-2">
                    <FontAwesomeIcon icon={faWrench} className="text-amber-500" />
                    Maintenance Ticket Distribution
                  </h3>

                  <div className="flex flex-col sm:flex-row items-center gap-6 py-4 justify-around">
                    {/* Donut Circle */}
                    <div className="relative w-36 h-36 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="40" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                        {(() => {
                          const total = data.maintenance.total || 1;
                          const compPct = (data.maintenance.completed / total) * 100;
                          const progPct = (data.maintenance.inProgress / total) * 100;
                          const pendPct = (data.maintenance.pending / total) * 100;
                          
                          const circ = 251.3;
                          const compOffset = circ - (compPct / 100) * circ;
                          const progOffset = circ - (progPct / 100) * circ;
                          const pendOffset = circ - (pendPct / 100) * circ;
                          
                          const rot1 = (compPct / 100) * 360;
                          const rot2 = rot1 + (progPct / 100) * 360;
                          
                          return (
                            <>
                              <circle 
                                cx="50" cy="50" r="40" fill="none" 
                                stroke="#10b981" strokeWidth="10" 
                                strokeDasharray={circ} strokeDashoffset={compOffset}
                                strokeLinecap="round"
                              />
                              {progPct > 0 && (
                                <circle 
                                  cx="50" cy="50" r="40" fill="none" 
                                  stroke="#f59e0b" strokeWidth="10" 
                                  strokeDasharray={circ} strokeDashoffset={progOffset}
                                  transform={`rotate(${rot1} 50 50)`}
                                  strokeLinecap="round"
                                />
                              )}
                              {pendPct > 0 && (
                                <circle 
                                  cx="50" cy="50" r="40" fill="none" 
                                  stroke="#ef4444" strokeWidth="10" 
                                  strokeDasharray={circ} strokeDashoffset={pendOffset}
                                  transform={`rotate(${rot2} 50 50)`}
                                  strokeLinecap="round"
                                />
                              )}
                            </>
                          );
                        })()}
                      </svg>
                      <div className="absolute flex flex-col items-center justify-center text-center">
                        <span className="text-2xl font-bold text-slate-800">{data.maintenance.total}</span>
                        <span className="text-[8px] uppercase tracking-wider text-slate-400 font-semibold">Total Tickets</span>
                      </div>
                    </div>

                    {/* Donut Legend */}
                    <div className="space-y-3 text-xs w-full sm:w-auto">
                      <div className="flex items-center justify-between gap-4 p-2 bg-slate-50 rounded border border-slate-100">
                        <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Completed</span>
                        <span className="font-bold text-slate-700">{data.maintenance.completed} ({Math.round((data.maintenance.completed / (data.maintenance.total || 1)) * 100)}%)</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 p-2 bg-slate-50 rounded border border-slate-100">
                        <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> In Progress</span>
                        <span className="font-bold text-slate-700">{data.maintenance.inProgress} ({Math.round((data.maintenance.inProgress / (data.maintenance.total || 1)) * 100)}%)</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 p-2 bg-slate-50 rounded border border-slate-100">
                        <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> Pending</span>
                        <span className="font-bold text-slate-700">{data.maintenance.pending} ({Math.round((data.maintenance.pending / (data.maintenance.total || 1)) * 100)}%)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Maintenance monitoring breakdown (checklist 8.5): open by priority, filed by category */}
              {activeModule === 'maintenance' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm print:border-slate-300 print:break-inside-avoid">
                  <h3 className="text-sm font-bold text-slate-800 mb-5 m-0 flex items-center gap-2">
                    <FontAwesomeIcon icon={faClipboardList} className="text-amber-500" />
                    Priority & Category Breakdown
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider m-0 mb-2">Open now, by priority</p>
                      {['Needs Triage', 'Urgent', 'High', 'Medium', 'Low'].map(p => (
                        <div key={p} className="flex justify-between py-1.5 border-b border-slate-100">
                          <span className={p === 'Urgent' || p === 'High' ? 'text-red-600 font-semibold' : p === 'Needs Triage' ? 'text-amber-700 font-semibold' : 'text-slate-600'}>{p}</span>
                          <span className="font-bold text-slate-800">{data.maintenance.openByPriority[p] || 0}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider m-0 mb-2">Filed this period, by category</p>
                      {Object.keys(data.maintenance.categoryCounts).length === 0 ? (
                        <p className="text-slate-400 m-0">No requests filed in this period.</p>
                      ) : Object.entries(data.maintenance.categoryCounts).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                        <div key={cat} className="flex justify-between py-1.5 border-b border-slate-100">
                          <span className="text-slate-600">{cat}</span>
                          <span className="font-bold text-slate-800">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Chart 4: Reservations Parking Type Count */}
              {activeModule === 'reservations' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm print:border-slate-300 print:break-inside-avoid">
                  <h3 className="text-sm font-bold text-slate-800 mb-5 m-0 flex items-center gap-2">
                    <FontAwesomeIcon icon={faSquareParking} className="text-indigo-600" />
                    Reservations Type Allocation
                  </h3>

                  <div className="flex flex-col sm:flex-row items-center gap-6 py-4 justify-around">
                    <div className="relative w-36 h-36 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="40" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                        {(() => {
                          const total = data.reservations.roomApps + data.reservations.parkingCount || 1;
                          const roomPct = (data.reservations.roomApps / total) * 100;
                          const parkPct = (data.reservations.parkingCount / total) * 100;

                          const circ = 251.3;
                          const roomOffset = circ - (roomPct / 100) * circ;
                          const parkOffset = circ - (parkPct / 100) * circ;

                          return (
                            <>
                              <circle 
                                cx="50" cy="50" r="40" fill="none" 
                                stroke="#6366f1" strokeWidth="10" 
                                strokeDasharray={circ} strokeDashoffset={roomOffset}
                                strokeLinecap="round"
                              />
                              {parkPct > 0 && (
                                <circle 
                                  cx="50" cy="50" r="40" fill="none" 
                                  stroke="#ec4899" strokeWidth="10" 
                                  strokeDasharray={circ} strokeDashoffset={parkOffset}
                                  transform={`rotate(${(roomPct / 100) * 360} 50 50)`}
                                  transform-origin="50 50"
                                  strokeLinecap="round"
                                />
                              )}
                            </>
                          );
                        })()}
                      </svg>
                      <div className="absolute flex flex-col items-center justify-center text-center">
                        <span className="text-xl font-bold text-slate-800">
                          {data.reservations.roomApps + data.reservations.parkingCount}
                        </span>
                        <span className="text-[7px] uppercase tracking-wider text-slate-400 font-semibold">Reservations</span>
                      </div>
                    </div>

                    <div className="space-y-3 text-xs w-full sm:w-auto">
                      <div className="flex items-center justify-between gap-4 p-2 bg-slate-50 rounded border border-slate-100">
                        <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span> Room Applications</span>
                        <span className="font-bold text-slate-700">{data.reservations.roomApps} Application(s)</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 p-2 bg-slate-50 rounded border border-slate-100">
                        <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-pink-500"></span> Parking Slots</span>
                        <span className="font-bold text-slate-700">{data.reservations.parkingCount} Slot(s)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Chart 5: Payments Arrears Overview */}
              {activeModule === 'payments' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm print:border-slate-300 print:break-inside-avoid">
                  <h3 className="text-sm font-bold text-slate-800 mb-5 m-0 flex items-center gap-2">
                    <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500" />
                    Arrears & Overdue Tenant Ledgers
                  </h3>
                  <div className="space-y-3">
                    {data.payments.outstandingBalances.map((b, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-red-50/50 rounded-lg border border-red-100 text-xs">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-[10px]">
                            {b.tenant.charAt(0)}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 m-0">{b.tenant} (Unit {b.unit})</p>
                            <p className="text-[9px] text-red-500 font-bold m-0 mt-0.5">{b.daysOverdue} Days overdue</p>
                          </div>
                        </div>
                        <span className="font-bold text-red-600">{formatCurrency(b.balance)}</span>
                      </div>
                    ))}
                    {data.payments.outstandingBalances.length === 0 && (
                      <div className="text-center py-6 text-slate-400">
                        No outstanding balances recorded for this period.
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* ==================================================== */}
            {/* DETAILED TABLES DATA LISTS SECTION */}
            {/* ==================================================== */}
            
            {/* Occupancy Tenant Table */}
            {(activeModule === 'all' || activeModule === 'occupancy') && (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden print:border-slate-300 print:shadow-none print:break-inside-avoid">
                <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center print:bg-white print:border-slate-200">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 m-0">
                    <FontAwesomeIcon icon={faBuilding} className="text-indigo-600" />
                    Active Lease & Unit Registry Ledger
                  </h3>
                  <span className="text-xs text-slate-500 print:hidden">Showing active/pending move-outs</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100/75 border-b border-slate-200">
                      <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 px-4 font-extrabold">Unit</th>
                        <th className="py-3 px-4">Tenant Name</th>
                        <th className="py-3 px-4">Contact Info</th>
                        <th className="py-3 px-4">Move-In Date</th>
                        <th className="py-3 px-4">Monthly Rent</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.occupancy.tenantList.map((t, idx) => (
                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4 font-bold text-indigo-600">{t.unit}</td>
                          <td className="py-3 px-4 font-semibold text-slate-800">{t.name}</td>
                          <td className="py-3 px-4 text-slate-500">
                            <div>{t.email}</div>
                            <div className="text-[10px]">{t.phone}</div>
                          </td>
                          <td className="py-3 px-4 text-slate-600 font-semibold">{t.moveIn}</td>
                          <td className="py-3 px-4 text-slate-700 font-bold">{formatCurrency(t.rent)}</td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                              t.status === 'active' 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {t.status === 'active' ? 'Renting' : 'Ending'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Payments Ledger Table */}
            {(activeModule === 'all' || activeModule === 'payments') && (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden print:border-slate-300 print:shadow-none print:break-inside-avoid">
                <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center print:bg-white print:border-slate-200">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 m-0">
                    <FontAwesomeIcon icon={faDollarSign} className="text-indigo-600" />
                    Rent & Utility Payments Transaction Ledger
                  </h3>
                  <span className="text-xs text-slate-500 print:hidden">Recent receipts logged</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100/75 border-b border-slate-200">
                      <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 px-4">Receipt ID</th>
                        <th className="py-3 px-4">Tenant Name</th>
                        <th className="py-3 px-4 text-center">Unit</th>
                        <th className="py-3 px-4">Period</th>
                        <th className="py-3 px-4">Amount Paid</th>
                        <th className="py-3 px-4">Method</th>
                        <th className="py-3 px-4">Date Paid</th>
                        <th className="py-3 px-4">Fee Breakdown</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payments.records.slice(0, activeModule === 'all' ? 5 : 20).map((r, idx) => (
                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-700">{r.id}</td>
                          <td className="py-3 px-4 font-semibold text-slate-800">{r.tenant}</td>
                          <td className="py-3 px-4 text-center font-bold text-indigo-600">{r.unit}</td>
                          <td className="py-3 px-4 text-slate-500">{r.period}</td>
                          <td className="py-3 px-4 text-emerald-600 font-extrabold">{formatCurrency(r.amount)}</td>
                          <td className="py-3 px-4 text-slate-600 font-medium">{r.method}</td>
                          <td className="py-3 px-4 text-slate-500 font-semibold">{r.datePaid}</td>
                          <td className="py-3 px-4 text-[10px] text-slate-400 italic max-w-xs truncate" title={r.breakdown}>
                            {r.breakdown}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Maintenance Requests Table */}
            {(activeModule === 'all' || activeModule === 'maintenance') && (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden print:border-slate-300 print:shadow-none print:break-inside-avoid">
                <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center print:bg-white print:border-slate-200">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 m-0">
                    <FontAwesomeIcon icon={faWrench} className="text-indigo-600" />
                    Maintenance Work Orders Audit Log
                  </h3>
                  <span className="text-xs text-slate-500 print:hidden">Tickets filed in scope</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100/75 border-b border-slate-200">
                      <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 px-4">Ticket ID</th>
                        <th className="py-3 px-4 text-center">Unit</th>
                        <th className="py-3 px-4">Tenant</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">Urgency</th>
                        <th className="py-3 px-4">Date Submitted</th>
                        <th className="py-3 px-4">Cost</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.maintenance.records.slice(0, activeModule === 'all' ? 5 : 20).map((m, idx) => (
                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-600">{m.id}</td>
                          <td className="py-3 px-4 text-center font-bold text-indigo-600">{m.unit}</td>
                          <td className="py-3 px-4 font-semibold text-slate-800">{m.tenant}</td>
                          <td className="py-3 px-4 text-slate-600 font-semibold">{m.category}</td>
                          <td className="py-3 px-4">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wide ${
                              m.urgency === 'Urgent' || m.urgency === 'High' ? 'bg-red-50 text-red-700' : m.urgency === 'Needs Triage' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {m.urgency}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-500 font-medium">{m.dateSubmitted}</td>
                          <td className="py-3 px-4 text-slate-700 font-bold">{formatCurrency(m.cost)}</td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${
                              m.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                              m.status === 'In Progress' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                              'bg-red-50 text-red-700 border border-red-100'
                            }`}>
                              {m.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Inquiry conversion (inquiry_reservation_design.md §8) */}
            {(activeModule === 'all' || activeModule === 'reservations') && data.reservations.inquiryConversion && (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 print:border-slate-300 print:break-inside-avoid">
                <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2 m-0 mb-4">
                  <FontAwesomeIcon icon={faHandshake} className="text-indigo-600" />
                  Inquiry Conversion
                  <span className="text-[10px] font-medium text-slate-400">(inquiries received this period)</span>
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Received</p>
                    <p className="text-xl font-bold text-slate-800 m-0 mt-1">{data.reservations.inquiryConversion.received}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Converted</p>
                    <p className="text-xl font-bold text-emerald-600 m-0 mt-1">{data.reservations.inquiryConversion.converted}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Conversion Rate</p>
                    <p className="text-xl font-bold text-indigo-600 m-0 mt-1">{data.reservations.inquiryConversion.conversionRatePct}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Holds Converted / Expired</p>
                    <p className="text-xl font-bold text-slate-800 m-0 mt-1">
                      {data.reservations.inquiryConversion.reservations.Converted} / {data.reservations.inquiryConversion.reservations.Expired}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(data.reservations.inquiryConversion.byStatus).map(([status, count]) => (
                    <span key={status} className="text-[11px] font-semibold bg-slate-50 border border-slate-200 text-slate-600 rounded-full px-2.5 py-1">
                      {status}: {count}
                    </span>
                  ))}
                  <span className="text-[11px] font-semibold bg-slate-50 border border-slate-200 text-slate-600 rounded-full px-2.5 py-1">
                    Holds cancelled: {data.reservations.inquiryConversion.reservations.Cancelled}
                  </span>
                  <span className="text-[11px] font-semibold bg-slate-50 border border-slate-200 text-slate-600 rounded-full px-2.5 py-1">
                    Holds active: {data.reservations.inquiryConversion.reservations.Active}
                  </span>
                </div>
              </div>
            )}

            {/* Reservations Table */}
            {(activeModule === 'all' || activeModule === 'reservations') && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:grid-cols-1">
                {/* Room applications */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden print:border-slate-300 print:shadow-none print:break-inside-avoid">
                  <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center print:bg-white">
                    <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2 m-0">
                      <FontAwesomeIcon icon={faBuilding} className="text-indigo-600" />
                      Rent Lease Booking Requests
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100/75 border-b border-slate-200">
                        <tr className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                          <th className="py-2.5 px-3">App ID</th>
                          <th className="py-2.5 px-3">Applicant</th>
                          <th className="py-2.5 px-3">Room</th>
                          <th className="py-2.5 px-3">Rent</th>
                          <th className="py-2.5 px-3">Submit Date</th>
                          <th className="py-2.5 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.reservations.roomList.slice(0, activeModule === 'all' ? 4 : 15).map((r, idx) => (
                          <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                            <td className="py-2.5 px-3 font-mono text-slate-600">{r.id}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-800">{r.name}</td>
                            <td className="py-2.5 px-3 font-bold text-indigo-600">{r.unit}</td>
                            <td className="py-2.5 px-3 text-slate-700 font-bold">{formatCurrency(r.rent)}</td>
                            <td className="py-2.5 px-3 text-slate-500">{r.dateSubmitted}</td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${
                                ['Approved', 'active', 'pending-move-out', 'moved-out', 'archived'].includes(r.status) ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                r.status === 'Pending Review' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                'bg-red-50 text-red-700 border border-red-100'
                              }`}>
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {data.reservations.roomList.length === 0 && (
                          <tr><td colSpan="6" className="text-center py-6 text-slate-400">No applications found.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Parking permit reservations */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden print:border-slate-300 print:shadow-none print:break-inside-avoid">
                  <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center print:bg-white">
                    <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2 m-0">
                      <FontAwesomeIcon icon={faSquareParking} className="text-indigo-600" />
                      Parking Slot Bookings Registry
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100/75 border-b border-slate-200">
                        <tr className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                          <th className="py-2.5 px-3">Reserve ID</th>
                          <th className="py-2.5 px-3">Tenant Name</th>
                          <th className="py-2.5 px-3">Vehicle Details</th>
                          <th className="py-2.5 px-3">Plate No.</th>
                          <th className="py-2.5 px-3">Cost/Dur</th>
                          <th className="py-2.5 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.reservations.parkingList.slice(0, activeModule === 'all' ? 4 : 15).map((p, idx) => (
                          <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                            <td className="py-2.5 px-3 font-mono text-slate-600">{p.id}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-800">{p.tenant}</td>
                            <td className="py-2.5 px-3 text-slate-600 font-medium">
                              <div>{p.vehicleModel}</div>
                              <div className="text-[9px] text-slate-400 font-semibold">{p.vehicleType}</div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-500">{p.plateNumber}</td>
                            <td className="py-2.5 px-3 text-slate-700">
                              <span className="font-bold">{formatCurrency(p.totalCost)}</span>
                              <span className="text-[9px] text-slate-400 font-semibold block">({p.duration} Months)</span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-pink-50 text-pink-700 border border-pink-100 tracking-wider">
                                {p.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {data.reservations.parkingList.length === 0 && (
                          <tr><td colSpan="6" className="text-center py-6 text-slate-400">No parking permits found.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Utilities Table / Top Rankings */}
            {(activeModule === 'all' || activeModule === 'utilities') && utilityData && (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden print:border-slate-300 print:shadow-none print:break-inside-avoid mb-6">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center print:bg-white">
                  <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2 m-0">
                    <FontAwesomeIcon icon={faTint} className="text-blue-500" />
                    Top Consuming Units Ranking
                  </h3>
                </div>
                <div className="overflow-x-auto p-4">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100/75 border-b border-slate-200">
                      <tr className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-2.5 px-3">Unit</th>
                        <th className="py-2.5 px-3">Water (m³)</th>
                        <th className="py-2.5 px-3">Electricity (kWh)</th>
                        <th className="py-2.5 px-3">Total Utility Cost</th>
                        <th className="py-2.5 px-3 w-1/4">Relative Consumption</th>
                      </tr>
                    </thead>
                    <tbody>
                      {utilityData.topUnits.slice(0, activeModule === 'all' ? 5 : 20).map((u, idx) => (
                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-indigo-600">
                            {u.unit}
                            {u.hasSpike && (
                              <span className="ml-1.5 text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1 py-0.5" title={`Usage rose more than ${utilityData.spikeThresholdPct}% over the previous reading`}>
                                Spike
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-700">{u.waterM3.toFixed(1)}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-700">{u.electricKwh.toFixed(1)}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">{formatCurrency(u.totalCost)}</td>
                          <td className="py-2.5 px-3">
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden flex">
                              <div className="bg-blue-500 h-1.5" style={{ width: `${Math.min((u.waterM3 / (utilityData.water.avgM3 * 2 || 1)) * 100, 100) / 2}%` }}></div>
                              <div className="bg-amber-500 h-1.5" style={{ width: `${Math.min((u.electricKwh / (utilityData.electric.avgKwh * 2 || 1)) * 100, 100) / 2}%` }}></div>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {utilityData.topUnits.length === 0 && (
                        <tr><td colSpan="5" className="text-center py-6 text-slate-400">No utility data found.</td></tr>
                      )}
                    </tbody>
                  </table>
                  {utilityData.coverage && utilityData.coverage.missingUnits.length > 0 && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3 mb-0">
                      <FontAwesomeIcon icon={faExclamationTriangle} className="mr-1.5" />
                      Occupied units with no meter reading for this month: <strong>{utilityData.coverage.missingUnits.join(', ')}</strong>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ==================================================== */}
            {/* MANAGEMENT GAPS DETECTION PANEL */}
            {/* ==================================================== */}
            {activeModule === 'gaps' && (
              <div className="space-y-6">
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-red-50 to-amber-50 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
                      <FontAwesomeIcon icon={faShieldAlt} className="text-lg" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 m-0">Management Gaps Detection</h3>
                      <p className="text-[11px] text-slate-500 m-0 mt-0.5">Automated identification of reporting gaps and management attention areas</p>
                    </div>
                  </div>
                  <div className="p-6 space-y-5">

                    {/* Gap: Payment Collection */}
                    <div className="rounded-xl border border-red-200 overflow-hidden">
                      <div className="bg-red-50 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FontAwesomeIcon icon={faDollarSign} className="text-red-500" />
                          <span className="text-sm font-bold text-red-800">Payment Collection Gaps</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${data.payments.totalOutstanding > 0 ? 'bg-red-200 text-red-900' : 'bg-emerald-100 text-emerald-800'}`}>
                          {data.payments.totalOutstanding > 0 ? `${data.payments.outstandingBalances.length} Overdue` : 'No Issues'}
                        </span>
                      </div>
                      {data.payments.outstandingBalances.length > 0 ? (
                        <div className="p-4 space-y-2">
                          {data.payments.outstandingBalances.map((b, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-red-50/40 rounded-lg p-2 border border-red-100">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-[10px] font-bold">{b.tenant.charAt(0)}</div>
                                <div>
                                  <span className="text-xs font-semibold text-slate-700">{b.tenant}</span>
                                  <span className="text-[10px] text-slate-400 ml-2">Unit {b.unit}</span>
                                </div>
                              </div>
                              <span className="text-xs font-bold text-red-600">{formatCurrency(b.balance)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between bg-red-100 rounded-lg p-2 mt-1 text-xs">
                            <span className="font-bold text-red-800">Total Outstanding</span>
                            <span className="font-bold text-red-900">{formatCurrency(data.payments.totalOutstanding)}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 text-center text-sm text-emerald-600">
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-2" /> All payments collected — no outstanding balances.
                        </div>
                      )}
                    </div>

                    {/* Gap Summary */}
                    <div className="bg-gradient-to-r from-indigo-50 to-slate-50 rounded-xl border border-indigo-100 p-5">
                      <h4 className="text-sm font-bold text-slate-800 m-0 mb-3">Gap Summary & Recommendations</h4>
                      <div className="space-y-2">
                        {data.payments.totalOutstanding > 0 && (
                          <div className="flex items-start gap-2 text-xs">
                            <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500 mt-0.5" />
                            <p className="m-0 text-slate-700"><strong className="text-red-700">Payment Gap:</strong> {data.payments.outstandingBalances.length} tenant(s) with outstanding balances totaling {formatCurrency(data.payments.totalOutstanding)}. Send reminders and follow up.</p>
                          </div>
                        )}
                        {data.maintenance.pending > 0 && (
                          <div className="flex items-start gap-2 text-xs">
                            <FontAwesomeIcon icon={faClock} className="text-amber-500 mt-0.5" />
                            <p className="m-0 text-slate-700"><strong className="text-amber-700">Maintenance Gap:</strong> {data.maintenance.pending} unresolved request(s). Prioritize urgent items and assign personnel.</p>
                          </div>
                        )}
                        {data.occupancy.vacantUnits > 0 && (
                          <div className="flex items-start gap-2 text-xs">
                            <FontAwesomeIcon icon={faBuilding} className="text-amber-500 mt-0.5" />
                            <p className="m-0 text-slate-700"><strong className="text-amber-700">Occupancy Gap:</strong> {data.occupancy.vacantUnits} vacant unit(s) representing {formatCurrency(data.occupancy.vacantRentPotential)}/mo in rent not being collected. Increase marketing efforts.</p>
                          </div>
                        )}
                        {data.payments.totalOutstanding === 0 && data.maintenance.pending === 0 && data.occupancy.vacantUnits === 0 && (
                          <div className="flex items-center gap-2 text-xs text-emerald-700 font-semibold">
                            <FontAwesomeIcon icon={faCheckCircle} className="text-emerald-500" />
                            All management metrics within acceptable ranges. No critical gaps detected.
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            )}

            {/* PRINT ONLY REPORT SIGN-OFF LINES */}
            <div className="hidden print:block mt-16 pt-8 border-t border-slate-200">
              <div className="grid grid-cols-2 gap-12 text-center text-xs">
                <div>
                  <p className="mb-12">Prepared By:</p>
                  <div className="w-48 border-b border-slate-500 mx-auto"></div>
                  <p className="mt-2 text-slate-500">System Dashboard Administrator</p>
                </div>
                <div>
                  <p className="mb-12">Approved By:</p>
                  <div className="w-48 border-b border-slate-500 mx-auto"></div>
                  <p className="mt-2 text-slate-500">Property Operations Finance Manager</p>
                </div>
              </div>
              <p className="text-[8px] text-slate-400 mt-10 text-center uppercase tracking-widest">
                Apartment AMS Performance Index Registry • Strict Confidential Business Document
              </p>
            </div>

          </div>
        </div>
      </main>

      {/* Invoice Generation & Preview Modal */}
      {showExpensesModal && (
      <ExpensesModal
        onClose={() => setShowExpensesModal(false)}
        onChanged={fetchReportData}
        month={timeframe === 'monthly' ? `${selectedYear}-${String(selectedMonth).padStart(2, '0')}` : null}
      />
      )}

      {showInvoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto print:static print:p-0 print:bg-transparent print:block print:overflow-visible" onClick={() => { setShowInvoiceModal(false); setShowInvoicePreview(false); }}>
          <div className={`bg-white rounded-2xl shadow-2xl w-full ${showInvoicePreview ? 'max-w-3xl' : 'max-w-xl'} mx-auto overflow-hidden transition-all duration-200 print:shadow-none print:border-none print:max-w-none print:w-full`} onClick={e => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center print:hidden">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <FontAwesomeIcon icon={faFileInvoiceDollar} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800 m-0">
                    {showInvoicePreview ? 'Official Rental Invoice Preview' : (invoiceMode === 'adjust' ? 'Adjust Existing Invoice' : 'Generate Tenant Invoice')}
                  </h2>
                  <p className="text-[11px] text-slate-500 m-0 mt-0.5">
                    {showInvoicePreview ? 'Review line items, totals, and print or issue to database' : (invoiceMode === 'adjust' ? 'Pick an open invoice and edit its manual charges' : 'Select tenant, set billing period & customize itemized charges')}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => { setShowInvoiceModal(false); setShowInvoicePreview(false); }} 
                className="text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer p-1 rounded-lg hover:bg-slate-200/50 transition-colors"
              >
                <FontAwesomeIcon icon={faTimes} className="text-base" />
              </button>
            </div>

            {/* Notification alert banner */}
            {invoiceSuccessMsg && (
              <div className="mx-6 mt-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-emerald-800 text-xs print:hidden">
                <div className="flex items-center gap-2 font-semibold">
                  <FontAwesomeIcon icon={faCheckCircle} className="text-emerald-600 text-sm" />
                  <span>{invoiceSuccessMsg}</span>
                </div>
                <button onClick={() => setInvoiceSuccessMsg('')} className="text-emerald-600 hover:text-emerald-800 border-0 bg-transparent cursor-pointer text-xs font-bold">✕</button>
              </div>
            )}

            {/* FORM VIEW */}
            {!showInvoicePreview ? (
              <div className="p-6 space-y-4 text-left">
                {/* Mode Toggle: create a fresh invoice, or adjust an existing
                    one's manual lines (audit H8) — create_invoice.php is
                    insert-only, so reusing an id there just 409s. */}
                <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setInvoiceMode('create')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg border-0 cursor-pointer transition-colors ${invoiceMode === 'create' ? 'bg-white text-indigo-700 shadow-sm' : 'bg-transparent text-slate-500'}`}
                  >
                    New Invoice
                  </button>
                  <button
                    type="button"
                    onClick={() => { setInvoiceMode('adjust'); if (adjustableInvoices.length === 0) loadAdjustableInvoices(); }}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg border-0 cursor-pointer transition-colors ${invoiceMode === 'adjust' ? 'bg-white text-indigo-700 shadow-sm' : 'bg-transparent text-slate-500'}`}
                  >
                    Adjust Existing
                  </button>
                </div>

                {invoiceMode === 'adjust' ? (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5">
                      Select Invoice to Adjust <span className="text-indigo-600">*</span>
                    </label>
                    <select
                      value={selectedAdjustInvoiceId}
                      onChange={handleAdjustInvoiceSelect}
                      disabled={adjustInvoicesLoading}
                      className="w-full px-3.5 py-2.5 text-xs font-medium border border-slate-300 rounded-xl outline-none text-slate-800 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                    >
                      <option value="">{adjustInvoicesLoading ? 'Loading invoices…' : '-- Select Open Invoice --'}</option>
                      {adjustableInvoices.map(inv => (
                        <option key={inv.id} value={inv.id}>
                          {inv.id} — {inv.first_name} {inv.last_name} (Unit {inv.room_name}) — {inv.billing_period} — {formatCurrency(inv.total_amount)}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1 mb-0">Only invoices that are still open (not paid, cancelled, or mid-checkout) can be adjusted.</p>
                  </div>
                ) : (
                <>
                {/* Select Tenant */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5">
                    Select Active Tenant <span className="text-indigo-600">*</span>
                  </label>
                  <select
                    value={invoiceForm.tenant}
                    onChange={handleTenantSelect}
                    className="w-full px-3.5 py-2.5 text-xs font-medium border border-slate-300 rounded-xl outline-none text-slate-800 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                  >
                    <option value="">-- Select Registered Tenant --</option>
                    {tenantInvoiceOptions.map((t, idx) => (
                      <option key={idx} value={t.name}>
                        {t.name} — Unit {t.unit} (₱{Number(t.rent).toLocaleString()}/mo)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tenant & Unit Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">Tenant Name</label>
                    <input
                      type="text"
                      value={invoiceForm.tenant}
                      onChange={e => setInvoiceForm(p => ({ ...p, tenant: e.target.value }))}
                      placeholder="e.g. John Doe"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:border-indigo-500 text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">Room / Unit</label>
                    <input
                      type="text"
                      value={invoiceForm.unit}
                      onChange={e => setInvoiceForm(p => ({ ...p, unit: e.target.value }))}
                      placeholder="e.g. 101 or A"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:border-indigo-500 text-slate-800"
                    />
                  </div>
                </div>
                </>
                )}

                {/* Billing Period & Due Date */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">Invoice #</label>
                    <input
                      type="text"
                      value={invoiceForm.invoiceNumber}
                      readOnly
                      disabled={invoiceMode === 'create'}
                      title={invoiceMode === 'create' ? 'Server-generated on save — cannot be chosen here.' : undefined}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none font-mono text-slate-500 bg-slate-100 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">Billing Period</label>
                    <input
                      type="text"
                      value={invoiceForm.billingPeriod}
                      onChange={e => setInvoiceForm(p => ({ ...p, billingPeriod: e.target.value }))}
                      readOnly={invoiceMode === 'adjust'}
                      placeholder="e.g. September 2026"
                      className={`w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none text-slate-800 ${invoiceMode === 'adjust' ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'focus:border-indigo-500'}`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">Due Date</label>
                    <input
                      type="date"
                      min={invoiceMode === 'create' ? localDateString() : undefined}
                      value={invoiceForm.dueDate}
                      onChange={e => setInvoiceForm(p => ({ ...p, dueDate: e.target.value }))}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:border-indigo-500 text-slate-800"
                    />
                  </div>
                </div>

                {/* Itemized Line Items */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faReceipt} className="text-indigo-600" />
                    Itemized Charges Breakdown
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Base Rent (₱)</label>
                      <input 
                        type="number" 
                        value={invoiceForm.rent} 
                        min="0"
                        max={MAX_AMOUNT}
                        step="0.01"
                        onChange={e => setInvoiceForm(p => ({ ...p, rent: e.target.value }))}
                        className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg outline-none bg-white text-slate-800 focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1 flex items-center gap-1">
                        <FontAwesomeIcon icon={faTint} className="text-blue-500" /> Water (₱)
                      </label>
                      <input 
                        type="number" 
                        value={invoiceForm.water} 
                        min="0"
                        max={MAX_AMOUNT}
                        step="0.01"
                        onChange={e => setInvoiceForm(p => ({ ...p, water: e.target.value }))}
                        className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg outline-none bg-white text-slate-800 focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1 flex items-center gap-1">
                        <FontAwesomeIcon icon={faBolt} className="text-amber-500" /> Electric (₱)
                      </label>
                      <input 
                        type="number" 
                        value={invoiceForm.electric} 
                        min="0"
                        max={MAX_AMOUNT}
                        step="0.01"
                        onChange={e => setInvoiceForm(p => ({ ...p, electric: e.target.value }))}
                        className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg outline-none bg-white text-slate-800 focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1 flex items-center gap-1">
                        <FontAwesomeIcon icon={faSquareParking} className="text-pink-500" /> Parking (₱)
                      </label>
                      <input 
                        type="number" 
                        value={invoiceForm.parking} 
                        min="0"
                        max={MAX_AMOUNT}
                        step="0.01"
                        onChange={e => setInvoiceForm(p => ({ ...p, parking: e.target.value }))}
                        className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg outline-none bg-white text-slate-800 focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Late / Arrears (₱)</label>
                      <input 
                        type="number" 
                        value={invoiceForm.lateFee} 
                        min="0"
                        max={MAX_AMOUNT}
                        step="0.01"
                        onChange={e => setInvoiceForm(p => ({ ...p, lateFee: e.target.value }))}
                        className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg outline-none bg-white text-slate-800 focus:border-indigo-500"
                      />
                    </div>
                    <div className="bg-indigo-50/70 border border-indigo-100 rounded-lg p-2 flex flex-col justify-center">
                      <span className="text-[10px] uppercase font-bold text-indigo-700">Calculated Total</span>
                      <span className="text-sm font-extrabold text-indigo-900">
                        {formatCurrency(
                          (Number(invoiceForm.rent) || 0) +
                          (Number(invoiceForm.water) || 0) +
                          (Number(invoiceForm.electric) || 0) +
                          (Number(invoiceForm.parking) || 0) +
                          (Number(invoiceForm.lateFee) || 0) +
                          (invoiceMode === 'adjust' ? (Number(invoiceForm.services) || 0) + (Number(invoiceForm.maintenance) || 0) + (Number(invoiceForm.securityDeposit) || 0) : 0)
                        )}
                      </span>
                    </div>
                  </div>
                  {invoiceMode === 'adjust' && (
                    <p className="text-[10px] text-slate-500 m-0">
                      Already posted on this invoice (not editable here): Services {formatCurrency(invoiceForm.services)} · Maintenance {formatCurrency(invoiceForm.maintenance)} · Security Deposit {formatCurrency(invoiceForm.securityDeposit)}.
                    </p>
                  )}
                </div>

                {/* Memo */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">Payment Instructions / Memo</label>
                  <textarea 
                    rows="2"
                    value={invoiceForm.notes} 
                    onChange={e => setInvoiceForm(p => ({ ...p, notes: e.target.value }))}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:border-indigo-500 text-slate-700 resize-none"
                  ></textarea>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowInvoiceModal(false)}
                    className="flex-1 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setShowInvoicePreview(true)}
                    disabled={invoiceMode === 'adjust' ? !selectedAdjustInvoiceId : (!invoiceForm.tenant || !invoiceForm.unit)}
                    className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-md cursor-pointer border-0"
                  >
                    Preview Official Invoice <FontAwesomeIcon icon={faChevronRight} className="ml-1 text-[10px]" />
                  </button>
                </div>
              </div>
            ) : (
              /* PREVIEW DOCUMENT VIEW */
              <div className="p-6 space-y-6 text-left">
                
                {/* Official Printable Statement Sheet */}
                <div className="printable-invoice bg-white border border-slate-300 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm print:border-none print:shadow-none print:p-0">
                  
                  {/* Top Invoice Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between border-b-2 border-slate-800 pb-5 gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold font-serif text-sm">
                          AMS
                        </div>
                        <div>
                          <h1 className="text-lg font-extrabold text-slate-900 tracking-tight uppercase m-0">APARTMENT MANAGEMENT SYSTEM</h1>
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold m-0">Property Leasing & Financial Administration</p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 mt-2 m-0">Unit 101 Management Office, Metro Manila • Tel: +63 912 345 6789</p>
                    </div>

                    <div className="sm:text-right">
                      <span className="inline-block px-2.5 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-extrabold uppercase tracking-wider mb-1.5">
                        Statement / Invoice
                      </span>
                      <p className="text-xs font-mono font-bold text-slate-800 m-0">{invoiceForm.invoiceNumber}</p>
                      <p className="text-[11px] text-slate-500 m-0 mt-0.5">Date Issued: <strong>{new Date().toISOString().split('T')[0]}</strong></p>
                    </div>
                  </div>

                  {/* Billed To & Account Summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Billed To (Tenant)</span>
                      <p className="font-extrabold text-slate-800 text-sm m-0">{invoiceForm.tenant}</p>
                      <p className="text-slate-600 font-semibold m-0 mt-0.5">Assigned Unit: <span className="text-indigo-600 font-bold">{invoiceForm.unit}</span></p>
                      {invoiceForm.email && <p className="text-slate-500 m-0 mt-0.5">Email: {invoiceForm.email}</p>}
                      {invoiceForm.phone && <p className="text-slate-500 m-0 mt-0.5">Phone: {invoiceForm.phone}</p>}
                    </div>
                    <div className="sm:text-right">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Billing Overview</span>
                      <p className="text-slate-700 m-0">Billing Period: <strong className="text-slate-900">{invoiceForm.billingPeriod}</strong></p>
                      <p className="text-rose-600 font-bold m-0 mt-0.5">Due Date: {invoiceForm.dueDate || 'Upon Receipt'}</p>
                      <p className="text-slate-500 m-0 mt-0.5">Status: <span className="font-bold text-amber-600">Pending Payment</span></p>
                    </div>
                  </div>

                  {/* Itemized Charges Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b-2 border-slate-300 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100">
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">Item Description</th>
                          <th className="py-2.5 px-3">Period / Scope</th>
                          <th className="py-2.5 px-3 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        <tr>
                          <td className="py-2.5 px-3 text-slate-400 font-mono">01</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">Monthly Apartment Base Rent</td>
                          <td className="py-2.5 px-3 text-slate-500">{invoiceForm.billingPeriod}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-800">{formatCurrency(invoiceForm.rent)}</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 px-3 text-slate-400 font-mono">02</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">Water Utility Consumption</td>
                          <td className="py-2.5 px-3 text-slate-500">Submeter Reading</td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-800">{formatCurrency(invoiceForm.water)}</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 px-3 text-slate-400 font-mono">03</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">Electricity Utility Consumption</td>
                          <td className="py-2.5 px-3 text-slate-500">Submeter Reading</td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-800">{formatCurrency(invoiceForm.electric)}</td>
                        </tr>
                        {Number(invoiceForm.parking) > 0 && (
                          <tr>
                            <td className="py-2.5 px-3 text-slate-400 font-mono">04</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-800">Allocated Parking Slot Rental</td>
                            <td className="py-2.5 px-3 text-slate-500">{invoiceForm.billingPeriod}</td>
                            <td className="py-2.5 px-3 text-right font-bold text-slate-800">{formatCurrency(invoiceForm.parking)}</td>
                          </tr>
                        )}
                        {Number(invoiceForm.lateFee) > 0 && (
                          <tr>
                            <td className="py-2.5 px-3 text-slate-400 font-mono">05</td>
                            <td className="py-2.5 px-3 font-semibold text-rose-700">Late Administrative Fee / Prior Arrears</td>
                            <td className="py-2.5 px-3 text-slate-500">Account Overdue</td>
                            <td className="py-2.5 px-3 text-right font-bold text-rose-700">{formatCurrency(invoiceForm.lateFee)}</td>
                          </tr>
                        )}
                        {invoiceMode === 'adjust' && Number(invoiceForm.services) > 0 && (
                          <tr>
                            <td className="py-2.5 px-3 text-slate-400 font-mono">06</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-800">Add-On Services (already posted)</td>
                            <td className="py-2.5 px-3 text-slate-500">{invoiceForm.billingPeriod}</td>
                            <td className="py-2.5 px-3 text-right font-bold text-slate-800">{formatCurrency(invoiceForm.services)}</td>
                          </tr>
                        )}
                        {invoiceMode === 'adjust' && Number(invoiceForm.maintenance) > 0 && (
                          <tr>
                            <td className="py-2.5 px-3 text-slate-400 font-mono">07</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-800">Maintenance Recharge (already posted)</td>
                            <td className="py-2.5 px-3 text-slate-500">{invoiceForm.billingPeriod}</td>
                            <td className="py-2.5 px-3 text-right font-bold text-slate-800">{formatCurrency(invoiceForm.maintenance)}</td>
                          </tr>
                        )}
                        {invoiceMode === 'adjust' && Number(invoiceForm.securityDeposit) > 0 && (
                          <tr>
                            <td className="py-2.5 px-3 text-slate-400 font-mono">08</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-800">Security Deposit (already posted)</td>
                            <td className="py-2.5 px-3 text-slate-500">Move-In</td>
                            <td className="py-2.5 px-3 text-right font-bold text-slate-800">{formatCurrency(invoiceForm.securityDeposit)}</td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-800 bg-slate-50 font-bold text-sm">
                          <td colSpan="3" className="py-3 px-3 text-right uppercase text-slate-700">Total Balance Due:</td>
                          <td className="py-3 px-3 text-right text-indigo-700 font-extrabold text-base">
                            {formatCurrency(
                              (Number(invoiceForm.rent) || 0) +
                              (Number(invoiceForm.water) || 0) +
                              (Number(invoiceForm.electric) || 0) +
                              (Number(invoiceForm.parking) || 0) +
                              (Number(invoiceForm.lateFee) || 0) +
                              (invoiceMode === 'adjust' ? (Number(invoiceForm.services) || 0) + (Number(invoiceForm.maintenance) || 0) + (Number(invoiceForm.securityDeposit) || 0) : 0)
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Payment Instructions & Authorization Footer */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-200 text-xs">
                    <div className="space-y-1 text-slate-600 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                      <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wide m-0 mb-1">Payment Instructions</p>
                      <p className="m-0">• <strong>GCash:</strong> 0912-345-6789 (AMS Leasing)</p>
                      <p className="m-0">• <strong>BDO Bank:</strong> 1234-5678-9012 (Apartment AMS)</p>
                      <p className="m-0">• <strong>Office Cashier:</strong> 8:00 AM – 5:00 PM Mon–Sat</p>
                      <p className="m-0 text-[10px] text-slate-500 pt-1 italic">Please reference <strong>{invoiceForm.invoiceNumber}</strong> upon payment.</p>
                    </div>

                    <div className="flex flex-col justify-end items-end text-right space-y-1">
                      <div className="w-44 border-b border-slate-400 mb-1"></div>
                      <p className="font-bold text-slate-800 text-[11px] m-0">Authorized Property Administrator</p>
                      <p className="text-[10px] text-slate-400 m-0 uppercase tracking-widest">Financial Operations Management</p>
                    </div>
                  </div>

                </div>

                {/* Action Buttons (Print-hidden) */}
                <div className="flex flex-wrap gap-2.5 pt-2 print:hidden">
                  <button 
                    onClick={() => setShowInvoicePreview(false)} 
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <FontAwesomeIcon icon={faArrowLeft} /> Back to Edit
                  </button>

                  <button 
                    onClick={handleSaveAndIssueInvoice}
                    disabled={issuingInvoice}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm cursor-pointer border-0 disabled:opacity-50"
                  >
                    <FontAwesomeIcon icon={issuingInvoice ? faSpinner : faSave} className={issuingInvoice ? 'animate-spin' : ''} />
                    {issuingInvoice ? 'Saving...' : (invoiceMode === 'adjust' ? 'Save Adjustment' : 'Save & Issue to Tenant')}
                  </button>

                  <button 
                    onClick={handlePrint} 
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm cursor-pointer border-0"
                  >
                    <FontAwesomeIcon icon={faPrint} /> Print / Save as PDF
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminReports;