import React, { useState, useMemo } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faDownload, faFileInvoiceDollar, faChartBar, faChartLine, faBuilding,
  faDollarSign, faExclamationTriangle, faTimes, faUser, faCalendarAlt,
  faBolt, faTint, faCheckCircle, faClock, faPrint, faArrowUp, faArrowDown,
  faWrench, faSquareParking, faChevronRight, faUserFriends, faClipboardList,
  faFilePdf, faCalendarCheck, faCheck, faTools, faTools as faCogs, faSlidersH, faInfoCircle
} from '@fortawesome/free-solid-svg-icons';

// ==========================================
// DETERMINISTIC MOCK DATA ENGINE
// ==========================================
const seedRandom = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
};

const getDeterministicValue = (key, year, month, min, max) => {
  const seed = seedRandom(`${key}-${year}-${month}`);
  return min + (seed % (max - min + 1));
};

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

const tenantNames = [
  'Maria Santos', 'Jose Reyes', 'Pedro Cruz', 'Rosa Dela Cruz', 'Ben Flores',
  'Lita Ramos', 'Dante Abad', 'Gloria Tan', 'Ramon Lim', 'Cora Santos',
  'Nilo Ocampo', 'Carlos Mendoza', 'Ana Garcia', 'Miguel Santos', 'Elena Gomez',
  'Carlos Diaz', 'Roberto Tan', 'Lisa Flores', 'Juan Santos', 'Rosa Santos'
];

const units = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];
const vehicleModels = ['Honda Click', 'Yamaha Nmax', 'Toyota Vios', 'Mitsubishi Mirage', 'Suzuki Swift', 'Honda Civic'];
const issueCategories = ['Plumbing', 'Electrical', 'Structural', 'Appliance', 'Pest Control', 'Others'];

const generateReportData = (timeframe, selectedMonth, selectedYear) => {
  const monthsToProcess = timeframe === 'yearly' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [selectedMonth];

  let totalOccupied = 0;
  let moveIns = 0;
  let moveOuts = 0;

  let rentCollected = 0;
  let waterCollected = 0;
  let electricCollected = 0;
  let parkingCollected = 0;
  let expenses = 0;
  let outstandingBalancesList = [];

  let totalMaintenance = 0;
  let maintCompleted = 0;
  let maintInProgress = 0;
  let maintPending = 0;
  let maintCategoryCounts = { Plumbing: 0, Electrical: 0, Structural: 0, Appliance: 0, 'Pest Control': 0, Others: 0 };
  let maintUrgencyCounts = { Emergency: 0, Routine: 0 };
  let maintenanceLogs = [];

  let roomApplications = 0;
  let roomApproved = 0;
  let roomRejected = 0;
  let roomPending = 0;
  let parkingReservationsCount = 0;
  let parkingReservationsList = [];
  let rentApplicationsList = [];

  monthsToProcess.forEach(m => {
    const occupiedCount = getDeterministicValue('occupied_units', selectedYear, m, 9, 13);
    totalOccupied = Math.max(totalOccupied, occupiedCount);
    moveIns += getDeterministicValue('move_ins', selectedYear, m, 0, 3);
    moveOuts += getDeterministicValue('move_outs', selectedYear, m, 0, 2);

    const baseRent = occupiedCount * 6500;
    const addon = getDeterministicValue('rent_addon', selectedYear, m, 1000, 4000);
    rentCollected += baseRent + addon;

    const water = occupiedCount * getDeterministicValue('water_avg', selectedYear, m, 280, 340);
    waterCollected += water;

    const electric = occupiedCount * getDeterministicValue('elec_avg', selectedYear, m, 670, 830);
    electricCollected += electric;

    const parkingUnits = getDeterministicValue('parking_count', selectedYear, m, 3, 6);
    parkingCollected += parkingUnits * 1200;

    expenses += getDeterministicValue('expenses', selectedYear, m, 37000, 47000);

    const maintMonthCount = getDeterministicValue('maint_total', selectedYear, m, 3, 7);
    totalMaintenance += maintMonthCount;

    const compCount = Math.floor(maintMonthCount * getDeterministicValue('maint_comp_pct', selectedYear, m, 60, 80) / 100);
    maintCompleted += compCount;

    const progCount = Math.floor((maintMonthCount - compCount) * 0.6);
    maintInProgress += progCount;
    maintPending += (maintMonthCount - compCount - progCount);

    for (let i = 0; i < maintMonthCount; i++) {
      const catIdx = getDeterministicValue(`maint_cat_${i}`, selectedYear, m, 0, 5);
      const cat = issueCategories[catIdx];
      maintCategoryCounts[cat] = (maintCategoryCounts[cat] || 0) + 1;

      const urgIdx = getDeterministicValue(`maint_urg_${i}`, selectedYear, m, 0, 1);
      const urgency = ['Emergency', 'Routine'][urgIdx];
      maintUrgencyCounts[urgency] = (maintUrgencyCounts[urgency] || 0) + 1;
    }

    roomApplications += getDeterministicValue('room_apps', selectedYear, m, 1, 4);
    roomApproved += getDeterministicValue('room_approved', selectedYear, m, 1, 2);
    roomRejected += getDeterministicValue('room_rejected', selectedYear, m, 0, 1);
    roomPending += getDeterministicValue('room_pending', selectedYear, m, 0, 1);

    parkingReservationsCount += getDeterministicValue('parking_res', selectedYear, m, 1, 3);
  });

  const totalUnits = 15;
  const occupancyRate = (totalOccupied / totalUnits) * 100;
  const totalCollected = rentCollected + waterCollected + electricCollected + parkingCollected;
  const netIncome = totalCollected - expenses;
  const avgResolutionTime = (timeframe === 'yearly' ? 2.4 : getDeterministicValue('avg_res_time', selectedYear, selectedMonth, 15, 35) / 10).toFixed(1);

  const activeTenantList = [];
  const unitOccupancy = {};

  for (let i = 0; i < totalOccupied; i++) {
    const uIdx = getDeterministicValue(`occupied_unit_idx_${i}`, selectedYear, selectedMonth, 0, units.length - 1);
    const unit = units[uIdx];
    if (!unitOccupancy[unit]) {
      const tIdx = getDeterministicValue(`tenant_idx_${i}`, selectedYear, selectedMonth, 0, tenantNames.length - 1);
      const tenantName = tenantNames[tIdx];

      const moveInMonth = getDeterministicValue(`move_in_month_${i}`, selectedYear, selectedMonth, 1, 12);
      const moveInYear = selectedYear - (moveInMonth > selectedMonth ? 1 : 0);
      const duration = getDeterministicValue(`duration_${i}`, selectedYear, selectedMonth, 6, 12);

      unitOccupancy[unit] = {
        unit,
        name: tenantName,
        email: `${tenantName.toLowerCase().replace(' ', '.')}@email.com`,
        phone: `0917-${getDeterministicValue(`phone2_${i}`, selectedYear, selectedMonth, 100, 999)}-${getDeterministicValue(`phone3_${i}`, selectedYear, selectedMonth, 1000, 9999)}`,
        rent: unit.endsWith('C') ? 7500 : 6500,
        moveIn: `${moveInYear}-${String(moveInMonth).padStart(2, '0')}-01`,
        leaseEnd: `${moveInYear + (moveInMonth + duration > 12 ? 1 : 0)}-${String((moveInMonth + duration) % 12 || 12).padStart(2, '0')}-01`,
        status: 'active'
      };
      activeTenantList.push(unitOccupancy[unit]);
    }
  }

  units.forEach(u => {
    if (!unitOccupancy[u]) {
      const isPending = getDeterministicValue(`vacant_status_${u}`, selectedYear, selectedMonth, 0, 12) === 1;
      if (isPending) {
        const tIdx = getDeterministicValue(`tenant_out_${u}`, selectedYear, selectedMonth, 0, tenantNames.length - 1);
        activeTenantList.push({
          unit: u,
          name: tenantNames[tIdx],
          email: `${tenantNames[tIdx].toLowerCase().replace(' ', '.')}@email.com`,
          phone: `0918-222-${getDeterministicValue(`phone_out_${u}`, selectedYear, selectedMonth, 1000, 9999)}`,
          rent: u.endsWith('C') ? 7500 : 6500,
          moveIn: `${selectedYear - 1}-08-15`,
          leaseEnd: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-28`,
          status: 'pending-move-out'
        });
      }
    }
  });

  const outstandingCount = getDeterministicValue('outstanding_count', selectedYear, selectedMonth, 1, 3);
  for (let i = 0; i < outstandingCount; i++) {
    const tIdx = getDeterministicValue(`out_tenant_${i}`, selectedYear, selectedMonth, 0, tenantNames.length - 1);
    const uIdx = getDeterministicValue(`out_unit_${i}`, selectedYear, selectedMonth, 0, units.length - 1);
    const balance = getDeterministicValue(`out_balance_${i}`, selectedYear, selectedMonth, 1, 2) * 6500;
    outstandingBalancesList.push({
      tenant: tenantNames[tIdx],
      unit: units[uIdx],
      balance,
      daysOverdue: getDeterministicValue(`out_days_${i}`, selectedYear, selectedMonth, 4, 18),
      status: 'overdue'
    });
  }

  const paymentRecordsList = [];
  const numTransactions = timeframe === 'yearly' ? 40 : getDeterministicValue('tx_count', selectedYear, selectedMonth, 7, 12);
  for (let i = 0; i < numTransactions; i++) {
    const m = timeframe === 'yearly' ? getDeterministicValue(`tx_m_${i}`, selectedYear, i, 1, 12) : selectedMonth;
    const day = getDeterministicValue(`tx_d_${i}`, selectedYear, m, 2, 28);
    const tIdx = getDeterministicValue(`tx_tenant_${i}`, selectedYear, m, 0, tenantNames.length - 1);
    const uIdx = getDeterministicValue(`tx_unit_${i}`, selectedYear, m, 0, units.length - 1);
    const rentVal = units[uIdx].endsWith('C') ? 7500 : 6500;
    const waterVal = getDeterministicValue(`tx_w_${i}`, selectedYear, m, 250, 350);
    const elecVal = getDeterministicValue(`tx_e_${i}`, selectedYear, m, 620, 840);
    const totalVal = rentVal + waterVal + elecVal;

    const methodIdx = getDeterministicValue(`tx_method_${i}`, selectedYear, m, 0, 2);
    const method = ['Cash', 'GCash', 'Bank Transfer'][methodIdx];

    paymentRecordsList.push({
      id: `RCT-${selectedYear}${String(m).padStart(2, '0')}${String(i + 1000).substring(1)}`,
      tenant: tenantNames[tIdx],
      unit: units[uIdx],
      period: `${monthsList.find(x => x.value === m).label} ${selectedYear}`,
      amount: totalVal,
      datePaid: `${selectedYear}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      breakdown: `Rent: ${rentVal}, Water: ${waterVal}, Elec: ${elecVal}`,
      status: 'paid',
      method
    });
  }
  paymentRecordsList.sort((a, b) => b.datePaid.localeCompare(a.datePaid));

  for (let i = 0; i < totalMaintenance; i++) {
    const m = timeframe === 'yearly' ? getDeterministicValue(`maint_m_${i}`, selectedYear, i, 1, 12) : selectedMonth;
    const day = getDeterministicValue(`maint_d_${i}`, selectedYear, m, 1, 28);
    const tIdx = getDeterministicValue(`maint_tenant_${i}`, selectedYear, m, 0, tenantNames.length - 1);
    const uIdx = getDeterministicValue(`maint_unit_${i}`, selectedYear, m, 0, units.length - 1);
    const catIdx = getDeterministicValue(`maint_cat_${i}`, selectedYear, m, 0, issueCategories.length - 1);
    const urgIdx = getDeterministicValue(`maint_urg_${i}`, selectedYear, m, 0, 1);

    let status = 'Completed';
    const randStatus = getDeterministicValue(`maint_status_${i}`, selectedYear, m, 1, 10);
    if (randStatus === 8) status = 'In Progress';
    else if (randStatus >= 9) status = 'Pending';

    const descriptions = {
      Plumbing: 'Leaky faucet in bathroom sink causing puddles.',
      Electrical: 'Living room light switch sparking when toggled.',
      Structural: 'Front door lock sticking, requires alignment.',
      Appliance: 'Refrigerator freezer is not cooling properly.',
      'Pest Control': 'Ant infestation observed in kitchen cabinet corners.',
      Others: 'Clogged ventilation filter in kitchen hood.'
    };

    maintenanceLogs.push({
      id: `REQ-${selectedYear}${String(m).padStart(2, '0')}${String(i + 100).substring(1)}`,
      unit: units[uIdx],
      tenant: tenantNames[tIdx],
      category: issueCategories[catIdx],
      urgency: ['Emergency', 'Routine'][urgIdx],
      description: descriptions[issueCategories[catIdx]],
      dateSubmitted: `${selectedYear}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      status
    });
  }
  maintenanceLogs.sort((a, b) => b.dateSubmitted.localeCompare(a.dateSubmitted));

  for (let i = 0; i < roomApplications; i++) {
    const m = timeframe === 'yearly' ? getDeterministicValue(`room_app_m_${i}`, selectedYear, i, 1, 12) : selectedMonth;
    const day = getDeterministicValue(`room_app_d_${i}`, selectedYear, m, 1, 28);
    const tIdx = getDeterministicValue(`room_app_tenant_${i}`, selectedYear, m, 0, tenantNames.length - 1);
    const uIdx = getDeterministicValue(`room_app_unit_${i}`, selectedYear, m, 0, units.length - 1);

    let status = 'Approved';
    const rand = getDeterministicValue(`room_app_status_${i}`, selectedYear, m, 1, 10);
    if (rand <= 3) status = 'Pending Review';
    else if (rand === 4) status = 'Rejected';

    rentApplicationsList.push({
      id: `APP-${selectedYear}${String(m).padStart(2, '0')}${String(i + 100).substring(1)}`,
      name: tenantNames[tIdx],
      unit: units[uIdx],
      rent: units[uIdx].endsWith('C') ? 7500 : 6500,
      duration: getDeterministicValue(`room_app_dur_${i}`, selectedYear, m, 6, 12),
      dateSubmitted: `${selectedYear}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      status
    });
  }
  rentApplicationsList.sort((a, b) => b.dateSubmitted.localeCompare(a.dateSubmitted));

  for (let i = 0; i < parkingReservationsCount; i++) {
    const m = timeframe === 'yearly' ? getDeterministicValue(`park_m_${i}`, selectedYear, i, 1, 12) : selectedMonth;
    const day = getDeterministicValue(`park_d_${i}`, selectedYear, m, 1, 28);
    const tIdx = getDeterministicValue(`park_tenant_${i}`, selectedYear, m, 0, tenantNames.length - 1);
    const vIdx = getDeterministicValue(`park_veh_${i}`, selectedYear, m, 0, vehicleModels.length - 1);
    const duration = getDeterministicValue(`park_dur_${i}`, selectedYear, m, 3, 12);

    parkingReservationsList.push({
      id: `PRK-${selectedYear}${String(m).padStart(2, '0')}${String(i + 100).substring(1)}`,
      tenant: tenantNames[tIdx],
      vehicleType: vIdx < 2 ? 'Motorcycle' : 'Car',
      vehicleModel: vehicleModels[vIdx],
      plateNumber: `XYZ-${getDeterministicValue(`park_plate_${i}`, selectedYear, m, 1000, 9999)}`,
      duration,
      totalCost: duration * 1200,
      dateSubmitted: `${selectedYear}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      status: 'Assigned'
    });
  }
  parkingReservationsList.sort((a, b) => b.dateSubmitted.localeCompare(a.dateSubmitted));

  return {
    occupancy: {
      totalUnits,
      occupiedUnits: totalOccupied,
      vacantUnits: totalUnits - totalOccupied,
      occupancyRate: Math.round(occupancyRate),
      moveIns,
      moveOuts,
      tenantList: activeTenantList
    },
    payments: {
      rentCollected,
      waterCollected,
      electricCollected,
      parkingCollected,
      totalCollected,
      expenses,
      netIncome,
      outstandingBalances: outstandingBalancesList,
      totalOutstanding: outstandingBalancesList.reduce((sum, b) => sum + b.balance, 0),
      collectionEfficiency: getDeterministicValue('coll_eff', selectedYear, selectedMonth, 89, 97),
      records: paymentRecordsList
    },
    maintenance: {
      total: totalMaintenance,
      completed: maintCompleted,
      inProgress: maintInProgress,
      pending: maintPending,
      categoryCounts: maintCategoryCounts,
      urgencyCounts: maintUrgencyCounts,
      avgResolutionTime,
      records: maintenanceLogs
    },
    reservations: {
      roomApps: roomApplications,
      roomApproved,
      roomRejected,
      roomPending,
      parkingCount: parkingReservationsCount,
      parkingRevenue: parkingReservationsCount * 1200,
      parkingList: parkingReservationsList,
      roomList: rentApplicationsList
    }
  };
};

const formatCurrency = (n) => `₱${Number(n).toLocaleString()}`;

const AdminReports = () => {
  const [timeframe, setTimeframe] = useState('monthly'); // 'monthly' | 'yearly'
  const [selectedMonth, setSelectedMonth] = useState(5); // May
  const [selectedYear, setSelectedYear] = useState(2025);
  const [activeModule, setActiveModule] = useState('all'); // 'all', 'occupancy', 'payments', 'maintenance', 'reservations'

  // Modal Invoice Generation States
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ tenant: '', unit: '', rent: '', water: '', electric: '', dueDate: '' });
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);

  // Generate Report Data dynamically based on timeframe, month, and year
  const data = useMemo(() => {
    return generateReportData(timeframe, selectedMonth, selectedYear);
  }, [timeframe, selectedMonth, selectedYear]);

  // Generate trend points for charts
  const trendPoints = useMemo(() => {
    if (timeframe === 'yearly') {
      // 12 months trend
      return monthsList.map(m => {
        const d = generateReportData('monthly', m.value, selectedYear);
        return {
          label: m.label.substring(0, 3),
          revenue: d.payments.totalCollected,
          expenses: d.payments.expenses,
          net: d.payments.netIncome,
          occupancyRate: d.occupancy.occupancyRate
        };
      });
    } else {
      // Monthly: split into 4 weeks
      return [1, 2, 3, 4].map(w => {
        const seed = getDeterministicValue(`week_trend_${w}`, selectedYear, selectedMonth, 1, 100);
        const revenue = Math.round(data.payments.totalCollected * (0.2 + (seed % 10) / 100));
        const expenses = Math.round(data.payments.expenses * 0.25);
        const net = revenue - expenses;
        const occupancyRate = data.occupancy.occupancyRate;
        return {
          label: `Wk ${w}`,
          revenue,
          expenses,
          net,
          occupancyRate
        };
      });
    }
  }, [timeframe, selectedMonth, selectedYear, data]);

  // Max value for revenue scaling in chart
  const maxRevenueTrend = useMemo(() => {
    return Math.max(...trendPoints.map(p => Math.max(p.revenue, p.expenses))) * 1.15 || 10000;
  }, [trendPoints]);

  const tenantInvoiceOptions = useMemo(() => {
    return data.occupancy.tenantList.map(t => ({
      name: t.name,
      unit: t.unit,
      rent: t.rent
    }));
  }, [data]);

  const handleTenantSelect = (e) => {
    const selected = tenantInvoiceOptions.find(t => t.name === e.target.value);
    if (selected) {
      const waterSeed = getDeterministicValue('invoice_water', selectedYear, selectedMonth, 280, 350);
      const elecSeed = getDeterministicValue('invoice_elec', selectedYear, selectedMonth, 650, 850);
      setInvoiceForm({
        tenant: selected.name,
        unit: selected.unit,
        rent: selected.rent,
        water: waterSeed,
        electric: elecSeed,
        dueDate: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-15`
      });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const exportCSV = (moduleType) => {
    let csvContent = "data:text/csv;charset=utf-8,";
    if (moduleType === 'occupancy' || activeModule === 'occupancy') {
      csvContent += "Unit,Tenant Name,Email,Phone,Rent,Move-In Date,Lease End,Status\r\n";
      data.occupancy.tenantList.forEach(t => {
        csvContent += `"${t.unit}","${t.name}","${t.email}","${t.phone}",${t.rent},"${t.moveIn}","${t.leaseEnd}","${t.status}"\r\n`;
      });
    } else if (moduleType === 'payments' || activeModule === 'payments') {
      csvContent += "Receipt ID,Tenant,Unit,Billing Period,Total Amount Paid,Date Paid,Payment Method,Details\r\n";
      data.payments.records.forEach(r => {
        csvContent += `"${r.id}","${r.tenant}","${r.unit}","${r.period}",${r.amount},"${r.datePaid}","${r.method}","${r.breakdown}"\r\n`;
      });
    } else if (moduleType === 'maintenance' || activeModule === 'maintenance') {
      csvContent += "Request ID,Unit,Tenant,Category,Urgency,Date Submitted,Status,Description\r\n";
      data.maintenance.records.forEach(r => {
        csvContent += `"${r.id}","${r.unit}","${r.tenant}","${r.category}","${r.urgency}","${r.dateSubmitted}","${r.status}","${r.description}"\r\n`;
      });
    } else {
      csvContent += "ID,Type,Name,Unit/Vehicle,Amount,Duration (Months),Date,Status\r\n";
      data.reservations.roomList.forEach(r => {
        csvContent += `"${r.id}","Room Application","${r.name}","${r.unit}",${r.rent},${r.duration},"${r.dateSubmitted}","${r.status}"\r\n`;
      });
      data.reservations.parkingList.forEach(p => {
        csvContent += `"${p.id}","Parking reservation","${p.tenant}","${p.vehicleModel}",${p.totalCost},${p.duration},"${p.dateSubmitted}","${p.status}"\r\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const filename = `AMS_Report_${timeframe}_${selectedYear}${timeframe === 'monthly' ? '_' + selectedMonth : ''}_${activeModule}.csv`;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Sidebar (Hidden on Print) */}
      <div className="print:hidden">
        <Sidebar />
      </div>

      {/* Main Container */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50 print:bg-white print:overflow-visible">
        {/* Header (Hidden on Print) */}
        <div className="print:hidden">
          <Header title="Reports & Analytics" />
        </div>

        {/* Dashboard Workspace */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 print:p-0 print:overflow-visible">
          <div className="max-w-7xl mx-auto space-y-6 print:space-y-4 print:max-w-none print:w-full">
            
            {/* PRINT-ONLY BUSINESS REPORT HEADER */}
            <div className="hidden print:block border-b-2 border-slate-800 pb-4 mb-6 text-center">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 uppercase">Grand Villas Apartment Complex</h1>
              <p className="text-sm text-slate-500 uppercase tracking-widest mt-1">Management Performance & Performance Review Report</p>
              <div className="grid grid-cols-2 mt-4 text-xs text-left text-slate-700 bg-slate-100 p-3 rounded">
                <div>
                  <p><strong>Report Scope:</strong> {timeframe === 'yearly' ? `Yearly Review (${selectedYear})` : `Monthly Review (${monthsList.find(m => m.value === selectedMonth).label} ${selectedYear})`}</p>
                  <p><strong>Active Module Scope:</strong> {activeModule.toUpperCase()}</p>
                </div>
                <div className="text-right">
                  <p><strong>Date Generated:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  <p><strong>Author:</strong> System Administrator Dashboard</p>
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
                  <p className="text-xs text-slate-500 m-0 mt-1">Select scope and dates to dynamically calculate operations performance reports.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Monthly vs Yearly Scoping Selectors */}
                  <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button
                      onClick={() => setTimeframe('monthly')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all ${timeframe === 'monthly' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                      Monthly
                    </button>
                    <button
                      onClick={() => setTimeframe('yearly')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all ${timeframe === 'yearly' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                      Yearly
                    </button>
                  </div>

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
                    onClick={() => setShowInvoiceModal(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-sm border-0 cursor-pointer"
                  >
                    <FontAwesomeIcon icon={faFileInvoiceDollar} /> Generate Invoice
                  </button>
                </div>
              </div>

              {/* Status Engine Label */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
                  Local Simulation Engine Live
                </span>
                <span className="text-[10px] text-slate-400">
                  Calculated records: {data.occupancy.tenantList.length} tenants • {data.payments.records.length} paid invoices • {data.maintenance.records.length} maintenance tickets
                </span>
              </div>
            </div>

            {/* Module Filter Navigation Tabs (Hidden on Print) */}
            <div className="border-b border-slate-200 print:hidden">
              <nav className="flex gap-1">
                {[
                  { id: 'all', label: 'Overview', icon: faChartBar },
                  { id: 'occupancy', label: 'Occupancy', icon: faBuilding },
                  { id: 'payments', label: 'Payments & Bills', icon: faDollarSign },
                  { id: 'maintenance', label: 'Maintenance', icon: faWrench },
                  { id: 'reservations', label: 'Reservations', icon: faSquareParking }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveModule(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-bold transition-all cursor-pointer ${
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* All / Overview KPI Cards */}
              {activeModule === 'all' && (
                <>
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
                      <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center"><FontAwesomeIcon icon={faDollarSign} /></div>
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Rent Collections</p>
                        <p className="text-lg font-bold text-slate-800 m-0">{formatCurrency(data.payments.totalCollected)}</p>
                      </div>
                    </div>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 flex items-center gap-1 w-fit">
                      Net Income: {formatCurrency(data.payments.netIncome)}
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

              {/* Occupancy Module Cards */}
              {activeModule === 'occupancy' && (
                <>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm print:border-slate-300">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Occupancy Rate</p>
                    <p className="text-xl font-bold text-slate-800 m-0 mt-1">{data.occupancy.occupancyRate}%</p>
                    <span className="text-[9px] text-slate-500 mt-2 block">Rate relative to 15 unit building</span>
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
                    <span className="text-[9px] text-slate-500 mt-2 block">Water/Power/Staffing/Support</span>
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
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide m-0">Avg Resolution Time</p>
                    <p className="text-xl font-bold text-indigo-600 m-0 mt-1">{data.maintenance.avgResolutionTime} Days</p>
                    <span className="text-[9px] text-slate-500 mt-2 block">First response to completion</span>
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

            </div>

            {/* ==================================================== */}
            {/* VISUAL CHARTS SECTION (SVG Custom Rendering) */}
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
                        const height = 155; // 20 to 175
                        const step = width / (trendPoints.length - 1);
                        const points = trendPoints.map((p, i) => {
                          const x = 40 + i * step;
                          const y = 175 - (p.occupancyRate / 100) * height;
                          return { x, y, label: p.label, rate: p.occupancyRate };
                        });
                        
                        const pathD = points.reduce((acc, p, i) => {
                          return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
                        }, "");

                        return (
                          <>
                            {/* Area under curve */}
                            <path 
                              d={`${pathD} L ${points[points.length - 1].x} 175 L 40 175 Z`} 
                              fill="url(#emeraldGrad)" 
                              opacity="0.15" 
                            />
                            {/* Trend Line */}
                            <path 
                              d={pathD} 
                              fill="none" 
                              stroke="#059669" 
                              strokeWidth="3" 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                            />
                            {/* Gradient definitions */}
                            <defs>
                              <linearGradient id="emeraldGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" />
                                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                              </linearGradient>
                            </defs>
                            {/* Intersect Data Nodes */}
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
                                <circle 
                                  cx={p.x} 
                                  cy={p.y} 
                                  r="9" 
                                  fill="#10b981" 
                                  opacity="0"
                                  className="hover:opacity-30 transition-all"
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
                          
                          // Radius = 40, Circumference = 251.3
                          const circ = 251.3;
                          const compOffset = circ - (compPct / 100) * circ;
                          const progOffset = circ - (progPct / 100) * circ;
                          const pendOffset = circ - (pendPct / 100) * circ;
                          
                          // Cumulative rotations
                          const rot1 = (compPct / 100) * 360;
                          const rot2 = rot1 + (progPct / 100) * 360;
                          
                          return (
                            <>
                              {/* Completed segment */}
                              <circle 
                                cx="50" cy="50" r="40" fill="none" 
                                stroke="#10b981" strokeWidth="10" 
                                strokeDasharray={circ} strokeDashoffset={compOffset}
                                strokeLinecap="round"
                              />
                              {/* In progress segment */}
                              {progPct > 0 && (
                                <circle 
                                  cx="50" cy="50" r="40" fill="none" 
                                  stroke="#f59e0b" strokeWidth="10" 
                                  strokeDasharray={circ} strokeDashoffset={progOffset}
                                  transform={`rotate(${rot1} 50 50)`}
                                  strokeLinecap="round"
                                />
                              )}
                              {/* Pending segment */}
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
                      {/* Inner label */}
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
                        <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> Pending Review</span>
                        <span className="font-bold text-slate-700">{data.maintenance.pending} ({Math.round((data.maintenance.pending / (data.maintenance.total || 1)) * 100)}%)</span>
                      </div>
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
                    {/* Donut Circle */}
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

                    {/* Donut Legend */}
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

              {/* Chart 5: Revenue breakdown (Payments / All) */}
              {activeModule === 'all' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm print:border-slate-300 print:break-inside-avoid">
                  <h3 className="text-sm font-bold text-slate-800 mb-5 m-0 flex items-center gap-2">
                    <FontAwesomeIcon icon={faBolt} className="text-amber-500" />
                    Income Distribution Breakdown
                  </h3>
                  
                  <div className="space-y-4 pt-1">
                    {[
                      { label: 'Room Rent', amount: data.payments.rentCollected, pct: (data.payments.rentCollected / data.payments.totalCollected) * 100 || 0, color: 'bg-indigo-500' },
                      { label: 'Electricity Utility', amount: data.payments.electricCollected, pct: (data.payments.electricCollected / data.payments.totalCollected) * 100 || 0, color: 'bg-amber-500' },
                      { label: 'Water Utility', amount: data.payments.waterCollected, pct: (data.payments.waterCollected / data.payments.totalCollected) * 100 || 0, color: 'bg-blue-500' },
                      { label: 'Parking Space', amount: data.payments.parkingCollected, pct: (data.payments.parkingCollected / data.payments.totalCollected) * 100 || 0, color: 'bg-pink-500' }
                    ].map((item, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-600">{item.label}</span>
                          <span className="text-slate-800 font-bold">{formatCurrency(item.amount)} ({Math.round(item.pct)}%)</span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.pct}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeModule === 'occupancy' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm print:border-slate-300 print:break-inside-avoid">
                  <h3 className="text-sm font-bold text-slate-800 mb-4 m-0 flex items-center gap-2">
                    <FontAwesomeIcon icon={faBuilding} className="text-indigo-600" />
                    Unit Occupancy Type Allocations
                  </h3>
                  <div className="flex justify-around items-center h-40">
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full border-4 border-indigo-500 flex items-center justify-center mx-auto mb-2 bg-indigo-50">
                        <span className="text-lg font-bold text-indigo-700">
                          {data.occupancy.tenantList.filter(t => t.unit.endsWith('C')).length}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-600 m-0">1-Bedroom Units (C)</p>
                      <p className="text-[10px] text-slate-400 m-0 mt-0.5">₱7,500/month</p>
                    </div>

                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full border-4 border-emerald-500 flex items-center justify-center mx-auto mb-2 bg-emerald-50">
                        <span className="text-lg font-bold text-emerald-700">
                          {data.occupancy.tenantList.filter(t => !t.unit.endsWith('C') && t.unit !== '—').length}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-600 m-0">Studio Units (A & B)</p>
                      <p className="text-[10px] text-slate-400 m-0 mt-0.5">₱6,500/month</p>
                    </div>
                  </div>
                </div>
              )}

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

              {activeModule === 'maintenance' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm print:border-slate-300 print:break-inside-avoid">
                  <h3 className="text-sm font-bold text-slate-800 mb-4 m-0 flex items-center gap-2">
                    <FontAwesomeIcon icon={faTools} className="text-indigo-600" />
                    Issue Categories Breakdown
                  </h3>
                  <div className="space-y-3">
                    {Object.entries(data.maintenance.categoryCounts).map(([cat, count], idx) => {
                      const total = data.maintenance.total || 1;
                      const pct = Math.round((count / total) * 100);
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold">
                            <span className="text-slate-600">{cat}</span>
                            <span className="text-slate-800 font-bold">{count} ({pct}%)</span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeModule === 'reservations' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm print:border-slate-300 print:break-inside-avoid">
                  <h3 className="text-sm font-bold text-slate-800 mb-4 m-0 flex items-center gap-2">
                    <FontAwesomeIcon icon={faSquareParking} className="text-indigo-600" />
                    Vehicle Type Distribution
                  </h3>
                  <div className="flex justify-around items-center h-40">
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full border-4 border-pink-500 flex items-center justify-center mx-auto mb-2 bg-pink-50 text-pink-600 font-bold text-lg">
                        {data.reservations.parkingList.filter(p => p.vehicleType === 'Car').length}
                      </div>
                      <p className="text-xs font-semibold text-slate-600 m-0">Cars / Sedans</p>
                      <p className="text-[10px] text-slate-400 m-0 mt-0.5">₱1,200/month</p>
                    </div>

                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full border-4 border-purple-500 flex items-center justify-center mx-auto mb-2 bg-purple-50 text-purple-600 font-bold text-lg">
                        {data.reservations.parkingList.filter(p => p.vehicleType === 'Motorcycle').length}
                      </div>
                      <p className="text-xs font-semibold text-slate-600 m-0">Motorcycles</p>
                      <p className="text-[10px] text-slate-400 m-0 mt-0.5">₱1,200/month</p>
                    </div>
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
                        <th className="py-3 px-4">Description</th>
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
                              m.urgency === 'Emergency' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {m.urgency}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-500 font-medium">{m.dateSubmitted}</td>
                          <td className="py-3 px-4 text-slate-500 max-w-xs truncate" title={m.description}>{m.description}</td>
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
                                r.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
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
                  <p className="mt-2 text-slate-500">Property Manager Operations Signature</p>
                </div>
              </div>
              <p className="text-[8px] text-slate-400 mt-10 text-center uppercase tracking-widest">
                Grand Villas AMS Performance Index Registry • Strict Confidential Business Document
              </p>
            </div>

          </div>
        </div>
      </main>

      {/* Invoice Generation Modal (Shared feature context) */}
      {showInvoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => { setShowInvoiceModal(false); setShowInvoicePreview(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-800 m-0">{showInvoicePreview ? 'Invoice Preview' : 'Generate Invoice'}</h2>
              <button onClick={() => { setShowInvoiceModal(false); setShowInvoicePreview(false); }} className="text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-lg" /></button>
            </div>

            {!showInvoicePreview ? (
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Select Tenant *</label>
                  <select value={invoiceForm.tenant} onChange={handleTenantSelect} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500">
                    <option value="">Choose tenant...</option>
                    {tenantInvoiceOptions.map(t => <option key={t.name} value={t.name}>{t.name} — Unit {t.unit}</option>)}
                  </select>
                </div>
                {invoiceForm.tenant && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Rent</label><input type="number" value={invoiceForm.rent} onChange={e => setInvoiceForm(p => ({ ...p, rent: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none" /></div>
                      <div><label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Due Date</label><input type="date" value={invoiceForm.dueDate} onChange={e => setInvoiceForm(p => ({ ...p, dueDate: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1"><FontAwesomeIcon icon={faTint} className="text-blue-400" /> Water</label><input type="number" value={invoiceForm.water} onChange={e => setInvoiceForm(p => ({ ...p, water: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none" /></div>
                      <div><label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1"><FontAwesomeIcon icon={faBolt} className="text-amber-400" /> Electric</label><input type="number" value={invoiceForm.electric} onChange={e => setInvoiceForm(p => ({ ...p, electric: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none" /></div>
                    </div>
                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-sm">
                      <span className="font-bold text-indigo-800">Total: {formatCurrency(Number(invoiceForm.rent) + Number(invoiceForm.water) + Number(invoiceForm.electric))}</span>
                    </div>
                  </>
                )}
                <button onClick={() => setShowInvoicePreview(true)} disabled={!invoiceForm.tenant} className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 border-0 cursor-pointer transition-colors disabled:opacity-50 shadow-sm">
                  Preview Invoice
                </button>
              </div>
            ) : (
              <div className="p-6">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="text-center border-b border-slate-200 pb-4">
                    <h3 className="text-lg font-bold text-slate-800 italic font-serif m-0">GRAND VILLAS AMS</h3>
                    <p className="text-[10px] text-slate-400 m-0 mt-1 uppercase tracking-widest">Monthly Invoice</p>
                  </div>
                  <div className="space-y-2 text-xs text-slate-700">
                    <div className="flex justify-between"><span className="text-slate-400">Tenant:</span><span className="font-semibold">{invoiceForm.tenant}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Unit:</span><span className="font-semibold">{invoiceForm.unit}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Due Date:</span><span className="font-semibold">{invoiceForm.dueDate || 'N/A'}</span></div>
                    <hr className="border-slate-200" />
                    <div className="flex justify-between"><span>Monthly Rent</span><span>{formatCurrency(invoiceForm.rent)}</span></div>
                    <div className="flex justify-between"><span>Water Bill</span><span>{formatCurrency(invoiceForm.water)}</span></div>
                    <div className="flex justify-between"><span>Electricity Bill</span><span>{formatCurrency(invoiceForm.electric)}</span></div>
                    <hr className="border-slate-200" />
                    <div className="flex justify-between font-bold text-sm text-slate-800"><span>Total Due</span><span>{formatCurrency(Number(invoiceForm.rent) + Number(invoiceForm.water) + Number(invoiceForm.electric))}</span></div>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setShowInvoicePreview(false)} className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-100 cursor-pointer transition-colors">Back</button>
                  <button onClick={handlePrint} className="flex-1 flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 border-0 cursor-pointer transition-colors"><FontAwesomeIcon icon={faDownload} /> Print Invoice</button>
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