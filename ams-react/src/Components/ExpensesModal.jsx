import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faPlus, faTrash, faPen, faSpinner } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { EXPENSE_CATEGORY_LABELS, expenseCategoryLabel } from '../config/expenseCategories';
import { LIMITS, addYears, checkAmount, checkDate, checkText, localDateString } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from './form/FieldError';
import CharCount from './form/CharCount';
import { blockNonNumericKeys, invalidCls } from './form/formHelpers';
import Modal from './admin/Modal';
import { TH, THEAD, btn } from './admin/ui/styles';

// Building expenses entered by an admin (manage_expenses.php). The report adds
// these to the maintenance costs it already derives, so repairs don't go here.
// The parent renders this only while it is open, so every opening starts fresh.

// Local date: toISOString() gave the UTC day (yesterday before 08:00 in Manila).
const today = () => localDateString();
const EXPENSE_MAX = 10000000; // manage_expenses.php's cap
const emptyForm = () => ({ id: null, category: 'supplies', amount: '', expenseDate: today(), description: '' });

// Keys match manage_expenses.php's body.
const VALIDATORS = {
  category: (v) => (Object.hasOwn(EXPENSE_CATEGORY_LABELS, v) ? '' : 'Choose a category.'),
  amount: (v) => checkAmount(v, { label: 'Amount', min: 0.01, max: EXPENSE_MAX, allowZero: false }),
  expenseDate: (v) => checkDate(v, { label: 'Date', min: addYears(-10), max: today() }),
  description: (v) => checkText(v, { label: 'Description', max: LIMITS.expenseDescription, required: false }),
};
const peso = (n) => `₱${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function ExpensesModal({ onClose, onChanged, month }) {
  const [expenses, setExpenses] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fields = useFieldErrors(VALIDATORS, { idPrefix: 'expense-' });

  const setField = (key, value) => {
    setForm({ ...form, [key]: value });
    fields.clearError(key);
  };
  const blurField = (key) => {
    const v = key === 'description' ? form.description.trim() : form[key];
    if (v !== form[key]) setForm({ ...form, [key]: v });
    fields.validateField(key, { ...form, [key]: v });
  };
  const resetForm = (next = emptyForm()) => {
    setForm(next);
    fields.setErrors({});
  };

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
    if (saving) return;
    setError('');
    const clean = { ...form, description: form.description.trim() };
    setForm(clean);
    if (!fields.validateAll(clean)) return;
    setSaving(true);
    try {
      const payload = { ...clean, action: clean.id ? 'update' : 'create', amount: Number(clean.amount) };
      const res = await api.post('manage_expenses.php', payload);
      if (!res.data.success) {
        if (!fields.applyServerErrors(res)) setError(res.data.message || 'Could not save the expense.');
      } else {
        resetForm();
        await load();
        onChanged?.();
      }
    } catch (err) {
      if (!fields.applyServerErrors(err)) setError(apiErrorMessage(err, 'Could not save the expense.'));
    }
    setSaving(false);
  };

  const remove = async (expense) => {
    if (!window.confirm(`Delete this ${peso(expense.amount)} expense?`)) return;
    setError('');
    try {
      await api.post('manage_expenses.php', { action: 'delete', id: expense.id });
      if (form.id === expense.id) resetForm();
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete the expense.');
    }
  };

  const total = expenses.reduce((sum, x) => sum + x.amount, 0);
  const inputCls = 'focus-glow w-full px-3 py-2 rounded-control bg-slate-50 border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <Modal title="Building Expenses" onClose={onClose} overlayClassName="bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden" className="bg-white rounded-card shadow-dialog w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden text-left">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-title font-bold m-0 text-slate-800">Building Expenses</h3>
            <p className="text-label text-slate-500 m-0 mt-0.5">
              {month ? `Entries for ${month}` : 'Latest entries'} · Maintenance repairs are counted automatically and aren't entered here.
            </p>
          </div>
          <button onClick={onClose} className="btn-interactive text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer text-title" aria-label="Close">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <form onSubmit={save} className="p-5 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-4 gap-3 items-start" noValidate>
          <label className="flex flex-col gap-1 text-label font-bold text-slate-600">
            Category
            <select {...fields.fieldA11y('category')} value={form.category} onChange={(e) => setField('category', e.target.value)} className={inputCls + invalidCls(fields.errors.category)}>
              {Object.entries(EXPENSE_CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <FieldError id="expense-category" error={fields.errors.category} className="font-normal" />
          </label>
          <label className="flex flex-col gap-1 text-label font-bold text-slate-600">
            Amount (₱)
            <input type="number" {...fields.fieldA11y('amount')} inputMode="decimal" min="0.01" max={EXPENSE_MAX} step="0.01" required value={form.amount}
              onKeyDown={blockNonNumericKeys}
              onChange={(e) => setField('amount', e.target.value)}
              onBlur={() => blurField('amount')}
              className={inputCls + invalidCls(fields.errors.amount)} />
            <FieldError id="expense-amount" error={fields.errors.amount} className="font-normal" />
          </label>
          <label className="flex flex-col gap-1 text-label font-bold text-slate-600">
            Date
            <input type="date" {...fields.fieldA11y('expenseDate')} required min={addYears(-10)} max={today()} value={form.expenseDate}
              onChange={(e) => setField('expenseDate', e.target.value)}
              onBlur={() => blurField('expenseDate')}
              className={inputCls + invalidCls(fields.errors.expenseDate)} />
            <FieldError id="expense-expenseDate" error={fields.errors.expenseDate} className="font-normal" />
          </label>
          <label className="flex flex-col gap-1 text-label font-bold text-slate-600 sm:col-span-4">
            Description
            <input type="text" {...fields.fieldA11y('description')} autoComplete="off" maxLength={LIMITS.expenseDescription} value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              onBlur={() => blurField('description')}
              className={inputCls + invalidCls(fields.errors.description)} placeholder="e.g. Hallway light bulbs" />
            <FieldError id="expense-description" error={fields.errors.description} className="font-normal" />
            <CharCount value={form.description} max={LIMITS.expenseDescription} className="font-normal" />
          </label>
          <div className="sm:col-span-4 flex justify-end gap-2">
            {form.id && (
              <button type="button" onClick={() => resetForm()} className="btn-interactive px-4 py-2 rounded-control text-label font-bold bg-slate-100 text-slate-600 border-0 cursor-pointer">
                Cancel edit
              </button>
            )}
            <button type="submit" disabled={saving} className={btn('primary', 'sm', 'btn-interactive')}>
              <FontAwesomeIcon icon={saving ? faSpinner : form.id ? faPen : faPlus} spin={saving} className="mr-1.5" />
              {form.id ? 'Save changes' : 'Add expense'}
            </button>
          </div>
          {error && <p role="alert" className="sm:col-span-4 text-label text-red-600 font-semibold m-0">{error}</p>}
        </form>

        <div className="overflow-y-auto flex-grow">
          {loading ? (
            <p className="p-6 text-center text-body text-slate-400 m-0">Loading…</p>
          ) : expenses.length === 0 ? (
            <p className="p-6 text-center text-body text-slate-400 m-0">No expenses recorded for this period.</p>
          ) : (
            <table className="w-full text-label">
              <thead className={THEAD}>
                <tr>
                  <th className={`${TH} text-left`}>Date</th>
                  <th className={`${TH} text-left`}>Category</th>
                  <th className={`${TH} text-left`}>Description</th>
                  <th className={`${TH} text-right`}>Amount</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody className="stagger-children">
                {expenses.map((x) => (
                  <tr key={x.id} className="border-t border-slate-100">
                    <td className="p-3 text-slate-600 whitespace-nowrap">{x.expenseDate}</td>
                    <td className="p-3 text-slate-700 font-semibold">{expenseCategoryLabel(x.category)}</td>
                    <td className="p-3 text-slate-500">{x.description || '—'}</td>
                    <td className="p-3 text-right font-bold text-red-600">{peso(x.amount)}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <button type="button" title="Edit" onClick={() => resetForm({ id: x.id, category: x.category, amount: String(x.amount), expenseDate: x.expenseDate, description: x.description || '' })} className="btn-interactive bg-transparent border-0 cursor-pointer text-slate-400 hover:text-indigo-600 px-1.5">
                        <FontAwesomeIcon icon={faPen} />
                      </button>
                      <button type="button" title="Delete" onClick={() => remove(x)} className="btn-interactive bg-transparent border-0 cursor-pointer text-slate-400 hover:text-red-600 px-1.5">
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
      </Modal>
  );
}
