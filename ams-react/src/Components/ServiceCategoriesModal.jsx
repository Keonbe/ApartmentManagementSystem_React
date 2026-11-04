import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faTrash } from '@fortawesome/free-solid-svg-icons';
import Modal from './admin/Modal';
import InlineAlert from './InlineAlert';
import { btn } from './admin/ui/styles';
import api from '../api/axiosConfig';
import { apiErrorMessage } from '../utils/apiError';

const inputCls = 'w-full min-h-[40px] px-3 py-2 text-sm border border-slate-200 rounded-control outline-none text-slate-800 bg-white focus:border-indigo-500';

// Add, rename and remove the categories services are grouped under. The three starters
// can be renamed but not removed; a category that still has services cannot be removed.
export default function ServiceCategoriesModal({ categories, onClose, onChanged }) {
  const [drafts, setDrafts] = useState(() => Object.fromEntries(categories.map(c => [c.id, { label: c.label, labelFil: c.labelFil || '' }])));
  const [newLabel, setNewLabel] = useState('');
  const [newLabelFil, setNewLabelFil] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const call = async (body, done) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await api.post('manage_service_categories.php', body);
      if (!res.data?.success) {
        setError(res.data?.message || 'Could not save the category.');
        return;
      }
      setNotice(res.data.message || 'Saved.');
      done?.();
      await onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save the category.'));
    } finally {
      setBusy(false);
    }
  };

  const setDraft = (id, field, value) => setDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  return (
    <Modal title="Service categories" busy={busy} onClose={onClose} overlayClassName="flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md"
      className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-card bg-white shadow-dialog">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h3 className="m-0 text-title font-semibold text-slate-800">Service categories</h3>
          <p className="m-0 mt-1 text-label text-slate-500">Group the catalog the way tenants think about it. Names show in English and Filipino.</p>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} disabled={busy} className="cursor-pointer border-0 bg-transparent p-2 text-slate-400 hover:text-slate-700"><FontAwesomeIcon icon={faTimes} /></button>
      </div>

      <div className="space-y-4 p-6">
        <InlineAlert onDismiss={() => setError('')}>{error}</InlineAlert>
        <InlineAlert tone="info" onDismiss={() => setNotice('')}>{notice}</InlineAlert>

        <ul className="m-0 list-none space-y-3 p-0">
          {categories.map(c => {
            const d = drafts[c.id] || { label: c.label, labelFil: c.labelFil || '' };
            const changed = d.label.trim() !== c.label || d.labelFil.trim() !== (c.labelFil || '');
            const removeBlocked = c.builtin ? 'Built in' : c.itemCount > 0 ? `${c.itemCount} service(s) use it` : '';
            return (
              <li key={c.id} className="grid grid-cols-1 items-center gap-2 rounded-card border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_auto]">
                <input aria-label={`${c.label} name`} value={d.label} maxLength={60} onChange={e => setDraft(c.id, 'label', e.target.value)} className={inputCls} />
                <input aria-label={`${c.label} Filipino name`} value={d.labelFil} maxLength={60} placeholder="Filipino name" onChange={e => setDraft(c.id, 'labelFil', e.target.value)} className={inputCls} />
                <div className="flex items-center justify-end gap-2">
                  <button type="button" disabled={busy || !changed || !d.label.trim()} onClick={() => call({ action: 'update', id: c.id, label: d.label.trim(), labelFil: d.labelFil.trim() })} className={btn('primary', 'sm')}>Save</button>
                  <button type="button" disabled={busy || !!removeBlocked} title={removeBlocked || 'Remove category'} aria-label={`Remove ${c.label}`} onClick={() => call({ action: 'delete', id: c.id })}
                    className="cursor-pointer rounded-control border-0 bg-transparent p-2 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
                {removeBlocked && <p className="m-0 text-caption text-slate-500 sm:col-span-3">{c.itemCount} service(s){c.builtin ? ' · built in, can be renamed' : ' still use this category'}</p>}
              </li>
            );
          })}
        </ul>

        <form
          className="grid grid-cols-1 items-end gap-2 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => { e.preventDefault(); if (newLabel.trim()) call({ action: 'create', label: newLabel.trim(), labelFil: newLabelFil.trim() }, () => { setNewLabel(''); setNewLabelFil(''); }); }}
        >
          <div>
            <label htmlFor="newcat-label" className="mb-1 block text-label font-medium text-slate-600">New category</label>
            <input id="newcat-label" value={newLabel} maxLength={60} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Pest control" className={inputCls} />
          </div>
          <div>
            <label htmlFor="newcat-fil" className="mb-1 block text-label font-medium text-slate-600">Filipino name (optional)</label>
            <input id="newcat-fil" value={newLabelFil} maxLength={60} onChange={e => setNewLabelFil(e.target.value)} className={inputCls} />
          </div>
          <button type="submit" disabled={busy || !newLabel.trim()} className={btn('primary', 'md')}>Add</button>
        </form>
      </div>
    </Modal>
  );
}
