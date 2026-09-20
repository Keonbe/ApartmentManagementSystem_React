import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTint, faBolt, faCheckCircle, faClock, faArrowLeft,
  faCalendarAlt, faInfoCircle, faReceipt
} from '@fortawesome/free-solid-svg-icons';
import '../assets/styles/responsive/user/user-utilities.responsive.css';

export default function UserUtilities() {
  const navigate = useNavigate();
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchReadings = async () => {
      try {
        const res = await api.get('/get_utility_readings.php');
        if (res.data.success && Array.isArray(res.data.data)) {
          setReadings(res.data.data);
        } else {
          setReadings([]);
        }
      } catch (err) {
        console.error("Failed to load utility history:", err);
        setError("Unable to load meter readings. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    fetchReadings();
  }, []);

  // Average usage per billing cycle across the tenant's own readings.
  const summary = useMemo(() => {
    if (readings.length === 0) return null;
    const sum = (key) => readings.reduce((acc, r) => acc + (parseFloat(r[key]) || 0), 0);
    return {
      cycles: readings.length,
      avgWater: (sum('water_consumption') / readings.length).toFixed(2),
      avgElectric: (sum('electric_consumption') / readings.length).toFixed(2),
      avgCost: (sum('water_amount') + sum('water_other_fees') + sum('electric_amount') + sum('electric_other_fees')) / readings.length,
    };
  }, [readings]);

  return (
    <div className="user-utilities-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-6 sm:py-10 px-4 md:px-12 box-border flex flex-col items-center text-slate-800">
      <div className="w-full max-w-5xl space-y-6 sm:space-y-8 flex flex-col justify-start text-left">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="h-9 w-9 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                title="Go Back"
              >
                <FontAwesomeIcon icon={faArrowLeft} className="text-sm" />
              </button>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 m-0 tracking-tight" style={{ color: '#3b4276' }}>
                Unit Sub-Meter &amp; Utility Usage
              </h1>
            </div>
            <p className="text-slate-500 text-xs sm:text-sm mt-1.5 m-0">
              Transparent log of monthly water and electricity meter readings for your unit.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => navigate('/my-room')}
              className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs px-3.5 py-2.5 transition-all shadow-sm cursor-pointer"
            >
              <span>My Room</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/pay-bills')}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 transition-all shadow-sm cursor-pointer border-0"
            >
              <FontAwesomeIcon icon={faReceipt} />
              <span>Go to Pay Bills</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        {loading ? (
          <div className="p-12 text-center flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-200 shadow-sm text-slate-400" style={{ textAlign: 'center' }}>
            <FontAwesomeIcon icon={faTint} className="animate-pulse text-3xl mb-3 text-indigo-400" />
            <p className="text-sm font-semibold m-0 text-center" style={{ textAlign: 'center' }}>Loading your unit's meter readings...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center flex flex-col items-center justify-center bg-white rounded-3xl border border-rose-200 shadow-sm text-rose-600" style={{ textAlign: 'center' }}>
            <p className="text-sm font-semibold m-0 text-center" style={{ textAlign: 'center' }}>{error}</p>
          </div>
        ) : readings.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-200 shadow-sm text-slate-400" style={{ textAlign: 'center' }}>
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-2xl mx-auto mb-4">
              <FontAwesomeIcon icon={faInfoCircle} />
            </div>
            <h3 className="text-lg font-bold text-slate-800 m-0 text-center" style={{ textAlign: 'center' }}>No Meter Readings Logged Yet</h3>
            <p className="text-slate-500 text-sm max-w-md mx-auto mt-2 mb-0 text-center leading-relaxed" style={{ textAlign: 'center' }}>
              Your building administrator has not recorded sub-meter readings for your unit yet. When meters are read, your water and electricity consumption breakdown will appear here.
            </p>
          </div>
        ) : (
          <div className="stagger-children space-y-4">
            {summary && (
              <div className="stagger-children grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider m-0">Avg water / cycle</p>
                  <p className="text-xl font-black text-blue-800 m-0 mt-1">{summary.avgWater} m³</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider m-0">Avg electricity / cycle</p>
                  <p className="text-xl font-black text-amber-800 m-0 mt-1">{summary.avgElectric} kWh</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider m-0">Avg utility cost / cycle</p>
                  <p className="text-xl font-black text-slate-900 m-0 mt-1">₱{summary.avgCost.toFixed(2)}</p>
                  <p className="text-[11px] text-slate-400 m-0">Across {summary.cycles} billing {summary.cycles === 1 ? 'cycle' : 'cycles'}</p>
                </div>
              </div>
            )}
            {readings.map(r => {
              // #2: Include other_fees in total (matches what sync sends to invoice)
              const totalAmount = parseFloat(r.water_amount || 0) + parseFloat(r.water_other_fees || 0) + parseFloat(r.electric_amount || 0) + parseFloat(r.electric_other_fees || 0);
              const isInvoiced = r.is_invoiced == 1;

              return (
                <div key={r.id} className="card-interactive bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-5 sm:p-7 space-y-6">
                  
                  {/* Top Bar of Card */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center text-sm">
                        {r.room_name}
                      </div>
                      <div>
                        <h3 className="text-base sm:text-lg font-extrabold text-slate-900 m-0">
                          Billing Cycle: {r.billing_period_label || r.billing_period}
                        </h3>
                        {r.reading_date && (
                          <p className="text-xs text-slate-400 m-0 mt-0.5 flex items-center gap-1.5">
                            <FontAwesomeIcon icon={faCalendarAlt} className="text-[10px]" />
                            Meter reading taken on {new Date(r.reading_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                    </div>

                    <span className={`self-start sm:self-auto inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${
                      isInvoiced 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      <FontAwesomeIcon icon={isInvoiced ? faCheckCircle : faClock} className="text-xs" />
                      <span>{isInvoiced ? (r.invoice_id ? `Billed on ${r.invoice_id}` : 'Billed') : 'Not Yet Billed'}</span>
                    </span>
                  </div>

                  {/* Sub-Meter Breakdown Grids */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6 items-center">
                    
                    {/* Water Meter Block */}
                    <div className="md:col-span-4 p-4 rounded-2xl bg-blue-50/60 border border-blue-100 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faTint} className="text-blue-500" />
                          Water Meter
                        </span>
                        <span className="text-[11px] font-semibold text-blue-600 bg-white px-2 py-0.5 rounded-full border border-blue-200">
                          ₱{r.water_rate_per_unit}/m³
                        </span>
                      </div>

                      <div className="space-y-1 text-xs text-slate-600">
                        <div className="flex justify-between">
                          <span>Previous:</span>
                          <span className="font-semibold text-slate-800">{r.water_prev_reading} m³</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Present:</span>
                          <span className="font-semibold text-slate-800">{r.water_curr_reading} m³</span>
                        </div>
                        <div className="flex justify-between border-t border-blue-200/60 pt-1 font-bold text-blue-900">
                          <span>Consumption:</span>
                          <span>{r.water_consumption} m³</span>
                        </div>
                        <UsageChange pct={r.water_change_pct} />
                      </div>

                      {/* #3: Show other fees line item if present */}
                      {parseFloat(r.water_other_fees || 0) > 0 && (
                        <div className="flex justify-between text-xs text-blue-700 font-semibold">
                          <span>Other Fees:</span>
                          <span>+₱{parseFloat(r.water_other_fees).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="pt-2 border-t border-blue-200/60 flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-medium">Subtotal:</span>
                        <span className="text-sm font-black text-blue-800">
                          ₱{(parseFloat(r.water_amount || 0) + parseFloat(r.water_other_fees || 0)).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Electric Meter Block */}
                    <div className="md:col-span-4 p-4 rounded-2xl bg-amber-50/60 border border-amber-100 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faBolt} className="text-amber-500" />
                          Electricity Meter
                        </span>
                        <span className="text-[11px] font-semibold text-amber-700 bg-white px-2 py-0.5 rounded-full border border-amber-200">
                          ₱{r.electric_rate_per_unit}/kWh
                        </span>
                      </div>

                      <div className="space-y-1 text-xs text-slate-600">
                        <div className="flex justify-between">
                          <span>Previous:</span>
                          <span className="font-semibold text-slate-800">{r.electric_prev_reading} kWh</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Present:</span>
                          <span className="font-semibold text-slate-800">{r.electric_curr_reading} kWh</span>
                        </div>
                        <div className="flex justify-between border-t border-amber-200/60 pt-1 font-bold text-amber-900">
                          <span>Consumption:</span>
                          <span>{r.electric_consumption} kWh</span>
                        </div>
                        <UsageChange pct={r.electric_change_pct} />
                      </div>

                      {/* #3: Show other fees line item if present */}
                      {parseFloat(r.electric_other_fees || 0) > 0 && (
                        <div className="flex justify-between text-xs text-amber-700 font-semibold">
                          <span>Other Fees:</span>
                          <span>+₱{parseFloat(r.electric_other_fees).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="pt-2 border-t border-amber-200/60 flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-medium">Subtotal:</span>
                        <span className="text-sm font-black text-amber-800">
                          ₱{(parseFloat(r.electric_amount || 0) + parseFloat(r.electric_other_fees || 0)).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Total Combined Summary Block */}
                    <div className="md:col-span-4 p-5 rounded-2xl bg-slate-900 text-white flex flex-col justify-between space-y-3">
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                          Total Utility Subtotal
                        </span>
                        <span className="text-2xl lg:text-3xl font-black text-emerald-400 mt-1 block">
                          ₱{totalAmount.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 m-0 leading-tight">
                        {isInvoiced 
                          ? "This amount has been billed. Settle it from Pay Bills."
                          : "Recorded by the administrator and not billed yet."}
                      </p>
                    </div>

                  </div>

                  {/* Notes Footer */}
                  {r.notes && (
                    <div className="pt-2 text-xs text-slate-500 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-100 flex items-center gap-2">
                      <FontAwesomeIcon icon={faInfoCircle} className="text-slate-400 text-xs shrink-0" />
                      <span><strong>Admin Note:</strong> {r.notes}</span>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}

// Change against the tenant's own previous cycle (the server sends null when there is none).
// The 30% cutoff mirrors UTILITY_SPIKE_THRESHOLD_PCT in backend/config.php.
function UsageChange({ pct }) {
  if (pct === null || pct === undefined) return null;
  const high = pct > 30;
  const tone = high ? 'text-rose-600' : pct > 0 ? 'text-amber-700' : 'text-emerald-700';
  return (
    <div className={`text-[11px] font-semibold ${tone}`}>
      {pct > 0 ? '▲' : pct < 0 ? '▼' : '■'} {Math.abs(pct)}% vs previous cycle{high ? ' — unusually high' : ''}
    </div>
  );
}
