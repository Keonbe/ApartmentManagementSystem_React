import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import api from '../../api/axiosConfig';
import Modal from '../../Components/admin/Modal';
import { TH, THEAD, btn } from '../../Components/admin/ui/styles';
import { SkeletonRows } from '../../Components/admin/ui/Skeleton';
import askConfirm from '../../utils/askConfirm';

const EMPTY_RULE = { title: '', title_fil: '', description: '', description_fil: '', is_highlight: 0, is_active: 1 };

// scope: 'house' (general rules), 'parking' or 'minors' (children and pets). Each scope is its own list.
const SCOPE_COPY = {
  house: { title: 'House Rules Management', blurb: 'Customize the policies shown to prospective residents.' },
  parking: { title: 'Parking Rules', blurb: 'Shown to a tenant before they submit a parking reservation, and to applicants.' },
  minors: { title: 'Children and Pets Rules', blurb: 'Shown on the inquiry form, the rent application and the contract.' },
};

export default function HouseRulesPanel({ scope = 'house' }) {
  const copy = SCOPE_COPY[scope] || SCOPE_COPY.house;
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('house_rules.php', { params: { scope } });
      if (!data.success) throw new Error(data.message || 'Could not load house rules.');
      setRules(data.rules || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not load house rules.');
    } finally { setLoading(false); }
  }, [scope]);

  useEffect(() => {
    const timer = window.setTimeout(loadRules, 0);
    return () => window.clearTimeout(timer);
  }, [loadRules]);

  const saveRule = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const isEdit = Boolean(editing.id);
      const payload = {
        ...editing,
        scope,
        category: editing.category?.trim() || 'General',
        is_highlight: Number(editing.is_highlight) || 0,
        is_active: editing.is_active === undefined ? 1 : Number(editing.is_active),
        sort_order: isEdit
          ? Number(editing.sort_order) || 0
          : rules.reduce((maxOrder, rule) => Math.max(maxOrder, Number(rule.sort_order) || 0), -1) + 1,
      };
      const { data } = isEdit ? await api.put('house_rules.php', payload) : await api.post('house_rules.php', payload);
      if (!data.success) throw new Error(data.message || 'Could not save rule.');
      setEditing(null);
      await loadRules();
    } catch (err) { setError(err.response?.data?.message || err.message || 'Could not save rule.'); }
    finally { setSaving(false); }
  };

  const moveRule = async (index, offset) => {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= rules.length) return;

    const previousRules = rules;
    const reordered = [...rules];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    const orderedRules = reordered.map((rule, sortIndex) => ({ ...rule, sort_order: sortIndex }));
    setRules(orderedRules);
    setError('');

    try {
      const { data } = await api.put('house_rules.php', {
        action: 'reorder',
        rules: orderedRules.map(({ id }, sortIndex) => ({ id, sort_order: sortIndex })),
      });
      if (!data.success) throw new Error(data.message || 'Could not reorder rules.');
    } catch (err) {
      setRules(previousRules);
      setError(err.response?.data?.message || err.message || 'Could not reorder rules.');
    }
  };

  const removeRule = async (rule) => {
    if (!(await askConfirm(`Remove “${rule.title}” from the house rules? It will be kept as inactive.`))) return;
    try {
      const { data } = await api.delete('house_rules.php', { data: { id: rule.id } });
      if (!data.success) throw new Error(data.message || 'Could not remove rule.');
      setRules((previousRules) => previousRules.filter((currentRule) => currentRule.id !== rule.id));
      setError('');
      setNotice('Rule deleted successfully.');
    } catch (err) {
      setNotice('');
      setError(err.response?.data?.message || err.message || 'Could not remove rule.');
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-slate-200 bg-white p-5">
        <div><h3 className="m-0 text-title font-bold text-slate-800">{copy.title}</h3><p className="m-0 mt-1 text-body text-slate-500">{copy.blurb}</p></div>
        <button type="button" onClick={() => setEditing({ ...EMPTY_RULE })} className={btn('primary', 'md')}><Plus className="h-4 w-4" /> Add Rule</button>
      </div>
      {notice && <p role="status" className="m-0 rounded-card bg-emerald-50 p-3 text-body text-emerald-700">{notice}</p>}
      {error && <p role="alert" className="m-0 rounded-card bg-red-50 p-3 text-body text-red-700">{error}</p>}
      <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
        <table className="w-full min-w-[600px] text-left text-body"><thead className={THEAD}><tr>{['Title & Description', 'Actions'].map((name) => <th key={name} className={TH}>{name}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{loading ? <SkeletonRows cols={2} rows={4} label="Loading rules…" /> : rules.length === 0 ? <tr><td colSpan="2" className="px-4 py-10 text-center text-slate-500">No house rules have been added.</td></tr> : rules.map((rule, index) => <tr key={rule.id}><td className="max-w-md px-4 py-4"><div className="font-bold text-slate-800">{rule.title}</div><p className="m-0 mt-1 line-clamp-2 text-label leading-relaxed text-slate-500">{rule.description}</p></td><td className="px-4 py-4"><div className="flex gap-2"><button type="button" onClick={() => moveRule(index, -1)} disabled={index === 0 || loading} aria-label={`Move ${rule.title} up`} title="Move up" className={btn('secondary', 'md')}><ArrowUp className="h-4 w-4" /></button><button type="button" onClick={() => moveRule(index, 1)} disabled={index === rules.length - 1 || loading} aria-label={`Move ${rule.title} down`} title="Move down" className={btn('secondary', 'md')}><ArrowDown className="h-4 w-4" /></button><button type="button" onClick={() => setEditing({ ...rule })} aria-label={`Edit ${rule.title}`} className={btn('secondary', 'md')}><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => removeRule(rule)} aria-label={`Delete ${rule.title}`} className="rounded-control border border-red-100 bg-white p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div></td></tr>)}</tbody>
        </table>
      </div>
      {editing && <Modal title={editing.id ? 'Edit Rule' : 'Add Rule'} onClose={() => setEditing(null)} busy={saving} dirty={Object.keys(EMPTY_RULE).some((k) => String(editing[k] ?? '') !== String((editing.id ? rules.find((r) => r.id === editing.id) : EMPTY_RULE)?.[k] ?? ''))} as="form" onSubmit={saveRule} overlayClassName="flex items-center justify-center bg-slate-950/55 p-4" className="w-full max-w-xl space-y-4 rounded-card bg-white p-6 shadow-dialog"><div><h3 className="m-0 text-title font-bold text-slate-800">{editing.id ? 'Edit Rule' : 'Add Rule'}</h3><p className="m-0 mt-1 text-body text-slate-500">This policy will be visible to prospective residents when active.</p></div>
        <label className="block text-body font-semibold text-slate-700">Title (English)<input required maxLength="255" value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} className="mt-1 w-full rounded-control border border-slate-300 px-3 py-2 font-normal" /></label>
        <label className="block text-body font-semibold text-slate-700">Description (English)<textarea required rows="4" value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} className="mt-1 w-full resize-y rounded-control border border-slate-300 px-3 py-2 font-normal" /></label>
        <label className="block text-body font-semibold text-slate-700">Title (Filipino) <span className="font-normal text-slate-500">(Optional)</span><input maxLength="255" value={editing.title_fil || ''} onChange={(event) => setEditing({ ...editing, title_fil: event.target.value })} className="mt-1 w-full rounded-control border border-slate-300 px-3 py-2 font-normal" /></label>
        <label className="block text-body font-semibold text-slate-700">Description (Filipino) <span className="font-normal text-slate-500">(Optional)</span><textarea rows="4" value={editing.description_fil || ''} onChange={(event) => setEditing({ ...editing, description_fil: event.target.value })} className="mt-1 w-full resize-y rounded-control border border-slate-300 px-3 py-2 font-normal" /></label>
        <div className="flex justify-end gap-2 pt-2"><button type="button" disabled={saving} onClick={() => setEditing(null)} className={btn('secondary', 'md')}>Cancel</button><button type="submit" disabled={saving} className={btn('primary', 'md')}>{saving ? 'Saving…' : 'Save Rule'}</button></div>
      </Modal>}
    </section>
  );
}