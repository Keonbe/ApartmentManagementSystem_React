import re

with open('ams-react/src/AdminPages/AdminReports.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove the entire mock engine from line 15 to 370
mock_engine_pattern = re.compile(r'// ==========================================\n// DETERMINISTIC MOCK DATA ENGINE.*?};', re.DOTALL)
content = mock_engine_pattern.sub('', content)

# 2. Add API import
content = content.replace("import { getSystemSettings } from '../config/systemSettings';", "import { getSystemSettings } from '../config/systemSettings';\nimport api from '../api/axiosConfig';\nimport { useEffect } from 'react';")

# 3. Replace the synchronous useMemo for data and trendPoints with a state and useEffect
state_section_pattern = re.compile(r'// Generate Report Data dynamically based on timeframe.*?}, \[timeframe, selectedMonth, selectedYear, data\]\);', re.DOTALL)

replacement = """
  const [data, setData] = useState(null);
  const [trendPoints, setTrendPoints] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReportData();
  }, [timeframe, selectedMonth, selectedYear]);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      const response = await api.get(`get_report_data.php?timeframe=${timeframe}&month=${selectedMonth}&year=${selectedYear}`);
      if (response.data.success) {
        const bd = response.data.data;
        const totalCollected = bd.rentCollected + bd.waterCollected + bd.electricCollected + bd.parkingCollected;
        const netIncome = totalCollected - bd.expenses;
        
        setData({
          occupancy: {
            totalUnits: 28,
            occupiedUnits: bd.totalOccupied,
            vacantUnits: 28 - bd.totalOccupied,
            occupancyRate: Math.round((bd.totalOccupied / 28) * 100) || 0,
            moveIns: bd.moveIns,
            moveOuts: bd.moveOuts,
            tenantList: [] // Mock empty for UI
          },
          payments: {
            rentCollected: bd.rentCollected,
            waterCollected: bd.waterCollected,
            electricCollected: bd.electricCollected,
            parkingCollected: bd.parkingCollected,
            totalCollected,
            expenses: bd.expenses,
            netIncome,
            outstandingBalances: [],
            totalOutstanding: 0,
            collectionEfficiency: 92,
            records: [],
            methodsBreakdown: { Cash: 0, GCash: 0, 'Bank Transfer': 0 }
          },
          maintenance: {
            total: bd.totalMaintenance,
            totalCost: bd.totalMaintenance * 2500, // mock cost
            budget: 50000,
            completed: bd.maintCompleted,
            inProgress: bd.maintInProgress,
            pending: bd.maintPending,
            categoryCounts: bd.maintCategoryCounts,
            urgencyCounts: bd.maintUrgencyCounts,
            avgResolutionTime: 24.5,
            records: []
          },
          reservations: {
            roomApps: bd.roomApplications,
            roomApproved: bd.roomApproved,
            roomRejected: bd.roomRejected,
            roomPending: bd.roomPending,
            parkingCount: bd.parkingReservationsCount,
            parkingRevenue: bd.parkingReservationsCount * 1200,
            parkingList: [],
            roomList: []
          }
        });
        
        // Mock trend points for now to prevent breaking charts
        setTrendPoints([
          { label: 'Jan', revenue: 40000, expenses: 12000, net: 28000, occupancyRate: 85 },
          { label: 'Feb', revenue: 41000, expenses: 12500, net: 28500, occupancyRate: 85 },
          { label: 'Mar', revenue: 39000, expenses: 11000, net: 28000, occupancyRate: 85 },
          { label: 'Apr', revenue: 42000, expenses: 13000, net: 29000, occupancyRate: 85 },
        ]);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };
"""
content = state_section_pattern.sub(replacement, content)

# 4. Handle tenantInvoiceOptions
tenant_invoice_pattern = re.compile(r'const tenantInvoiceOptions = useMemo\(\(\) => \{.*?\}, \[data\]\);', re.DOTALL)
content = tenant_invoice_pattern.sub('const tenantInvoiceOptions = data?.occupancy?.tenantList?.map(t => ({ name: t.name, unit: t.unit, rent: t.rent })) || [];', content)

# 5. Handle early return for loading state in the main return
content = content.replace('return (\n    <div className="flex h-screen', 'if (loading || !data) return <div className="flex h-screen bg-slate-50 items-center justify-center text-slate-500 font-bold text-xl">Loading Reports Data...</div>;\n\n  return (\n    <div className="flex h-screen')

# 6. Replace deterministic mock usages
content = content.replace('const waterSeed = getDeterministicValue(', 'const waterSeed = 300; // getDeterministicValue(')
content = content.replace('const elecSeed = getDeterministicValue(', 'const elecSeed = 800; // getDeterministicValue(')

with open('ams-react/src/AdminPages/AdminReports.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Refactored AdminReports.jsx successfully')
