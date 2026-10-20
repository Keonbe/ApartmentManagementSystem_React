// How a moved-out tenant's security deposit was settled: the outcome, the
// itemized deductions (category, reason, amount) and what was left for rent.
// Admin views only (Units -> Occupancy History, Tenants detail); the data comes
// from get_rooms.php / get_tenants.php, which send it to admins alone.
const peso = (n) => `₱${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function DepositOutcome({ deposit, className = 'mt-2' }) {
  if (!deposit) return null;
  const items = deposit.items || [];
  const damage = Number(deposit.damage || 0);
  const utility = Number(deposit.utility || 0);
  const amount = Number(deposit.amount || 0);
  const applied = String(deposit.status || '').startsWith('Applied');
  const toRent = Math.max(0, amount - damage - utility);

  return (
    <div className={`${className} bg-white rounded-lg px-2.5 py-2 border border-slate-100 text-[11px] text-slate-600`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 m-0">Deposit</p>
        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-slate-200 text-slate-600">{deposit.status || 'Unknown'}</span>
      </div>
      <div className="flex justify-between"><span className="text-slate-400">Deposit amount</span><span className="font-semibold">{peso(amount)}</span></div>
      {items.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {items.map((it, i) => (
            <div key={i} className="flex justify-between gap-2">
              <span className="min-w-0"><span className="font-semibold text-slate-700">{it.label || it.category}</span>{it.reason ? <span className="text-slate-500">: {it.reason}</span> : null}</span>
              <span className="font-semibold text-red-600 shrink-0">−{peso(it.amount)}</span>
            </div>
          ))}
        </div>
      )}
      {(damage > 0 || utility > 0) && (
        <div className="mt-1 pt-1 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-0.5 text-slate-500">
          <span>Damages/other: <strong className="text-slate-700">{peso(damage)}</strong></span>
          <span>Bills/rent owed: <strong className="text-slate-700">{peso(utility)}</strong></span>
        </div>
      )}
      {applied && (
        <div className="mt-1 flex justify-between"><span className="text-slate-400">Applied to rent</span><span className="font-bold text-indigo-600">{peso(toRent)}</span></div>
      )}
      {deposit.refundDate && <p className="m-0 mt-1 text-[10px] text-slate-400">Settled {deposit.refundDate}</p>}
    </div>
  );
}
