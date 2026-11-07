import { faBookOpen } from '@fortawesome/free-solid-svg-icons';
import Disclosure from './Disclosure';

const GROUP_LABELS = {
  house: 'HOUSE RULES',
  minors: 'CHILDREN AND PETS',
  parking: 'PARKING',
};

export default function HouseRulesAccordion({ rules = [], loading = false, error = false, open, onToggle }) {
  const activeRules = rules
    .filter((rule) => rule.is_active === true || Number(rule.is_active) === 1)
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || (Number(a.id) || 0) - (Number(b.id) || 0));
  const groups = activeRules.reduce((result, rule) => {
    const key = rule.scope || rule.category || 'house';
    (result[key] ||= []).push(rule);
    return result;
  }, {});

  return (
    <section aria-label="House rules and policies" className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <Disclosure
        id="house-rules-accordion"
        icon={faBookOpen}
        title="House Rules & Policies"
        summary="Tap to view the apartment guidelines and policies."
        open={open}
        onToggle={onToggle}
      >
        <div className="flex flex-col gap-4">
          {loading ? (
            <div className="space-y-3" aria-label="Loading house rules" aria-busy="true">
              {[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}
            </div>
          ) : error ? (
            <p role="alert" className="m-0 text-sm text-rose-700">House rules could not be loaded.</p>
          ) : activeRules.length === 0 ? (
            <p className="m-0 text-sm text-slate-500">No active rules posted.</p>
          ) : Object.entries(groups).map(([group, items]) => (
            <div key={group} className="flex flex-col gap-3">
              <h4 className="m-0 text-xs font-bold uppercase tracking-wide text-indigo-700">
                {GROUP_LABELS[group] || group}
              </h4>
              {items.map((rule) => (
                <article key={rule.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <h5 className="m-0 text-sm font-semibold text-slate-800">{rule.title}</h5>
                  <p className="m-0 mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-500">{rule.description}</p>
                </article>
              ))}
            </div>
          ))}
        </div>
      </Disclosure>
    </section>
  );
}