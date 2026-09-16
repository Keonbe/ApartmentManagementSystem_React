import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faPlus, faTrash, faPen, faSpinner } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { EXPENSE_CATEGORY_LABELS, expenseCategoryLabel } from '../config/expenseCategories';

// Building expenses entered by an admin (manage_expenses.php). The report adds
// these to the maintenance costs it already derives, so repairs don't go here.
// The parent renders this only while it is open, so every opening starts fresh.

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = () => ({ id: null, category: 'supplies', amount: '', expenseDate: today(), description: '' });
const peso = (n) => `₱${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function ExpensesModal({ onClose, onChanged, month }) {
  const [expenses, setExpenses] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const url = `manage_expenses.php${month ? `?month=${month}` : ''}`;

  const load = async () => {
    try {
      const res = await api.get(url);
      setExpenses(res.data.expenses || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load expenses.');
    }
  };

  useEffect(() => {
    let active = true;
    api.get(url)
      .then((res) => { if (active) setExpenses(res.data.expenses || []); })
      .catch((err) => { if (active) setError(err.response?.data?.message || 'Could not load expenses.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [url]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, action: form.id ? 'update' : 'create', amount: Number(form.amount) };
      const res = await api.post('manage_expenses.php', payload);
      if (!res.data.success) throw new Error(res.data.message);
      setForm(emptyForm());
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not save the expense.');
    }
    setSaving(false);
  };

  const remove = async (expense) => {
    if (!window.confirm(`Delete this ${peso(expense.amount)} expense?`)) return;
    setError('');
    try {
      await api.post('manage_expenses.php', { action: 'delete', id: expense.id });
      if (form.id === expense.id) setForm(emptyForm());
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete the expense.');
    }
  };

  const total = expenses.reduce((sum, x) => sum + x.amount, 0);
  const inputCls = 'w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 print:hidden">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden text-left">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-lg font-bold m-0 text-slate-800">Building Expenses</h3>
            <p className="text-xs text-slate-500 m-0 mt-0.5">
              {month ? `Entries for ${month}` : 'Latest entries'} · Maintenance repairs are counted automatically and aren't entered here.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer text-base" aria-label="Close">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <form onSubmit={save} className="p-5 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
            Category
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>
              {Object.entries(EXPENSE_CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
            Amount (₱)
            <input type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
            Date
            <input type="date" required max={today()} value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-600 sm:col-span-4">
            Description
            <input type="text" maxLength={255} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} placeholder="e.g. Hallway light bulbs" />
          </label>
          <div className="sm:col-span-4 flex justify-end gap-2">
            {form.id && (
              <button type="button" onClick={() => setForm(emptyForm())} className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 border-0 cursor-pointer">
                Cancel edit
              </button>
            )}
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white border-0 cursor-pointer disabled:opacity-60">
              <FontAwesomeIcon icon={saving ? faSpinner : form.id ? faPen : faPlus} spin={saving} className="mr-1.5" />
              {form.id ? 'Save changes' : 'Add expense'}
            </button>
          </div>
          {error && <p className="sm:col-span-4 text-xs text-red-600 font-semibold m-0">{error}</p>}
        </form>

        <div className="overflow-y-auto flex-grow">
          {loading ? (
            <p className="p-6 text-center text-sm text-slate-400 m-0">Loading…</p>
          ) : expenses.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400 m-0">No expenses recorded for this period.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Category</th>
                  <th className="text-left p-3">Description</th>
                  <th className="text-right p-3">Amount</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {expenses.map((x) => (
                  <tr key={x.id} className="border-t border-slate-100">
                    <td className="p-3 text-slate-600 whitespace-nowrap">{x.expenseDate}</td>
                    <td className="p-3 text-slate-700 font-semibold">{expenseCategoryLabel(x.category)}</td>
                    <td className="p-3 text-slate-500">{x.description || '—'}</td>
                    <td className="p-3 text-right font-bold text-red-600">{peso(x.amount)}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <button type="button" title="Edit" onClick={() => setForm({ id: x.id, category: x.category, amount: String(x.amount), expenseDate: x.expenseDate, description: x.description || '' })} className="bg-transparent border-0 cursor-pointer text-slate-400 hover:text-indigo-600 px-1.5">
                        <FontAwesomeIcon icon={faPen} />
                      </button>
                      <button type="button" title="Delete" onClick={() => remove(x)} className="bg-transparent border-0 cursor-pointer text-slate-400 hover:text-red-600 px-1.5">
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-bold">
                  <td className="p-3" colSpan={3}>Total</td>
                  <td className="p-3 text-right text-red-700">{peso(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
