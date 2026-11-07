import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBookOpen, faClock, faBanSmoking, faCar, faUsers, faPaw, faHouse } from '@fortawesome/free-solid-svg-icons';
import { Bone, SkeletonGroup } from './Skeleton';

const iconForRule = (rule) => {
  const text = `${rule.category || ''} ${rule.title || ''}`.toLowerCase();
  if (/quiet|noise|hour/.test(text)) return faClock;
  if (/smok|vape/.test(text)) return faBanSmoking;
  if (/park|vehicle/.test(text)) return faCar;
  if (/child|pet|minor/.test(text)) return faPaw;
  if (/guest|visitor|occupant|resident/.test(text)) return faUsers;
  return faHouse;
};

export default function HouseRulesCard({ rules = [], loading = false, error = false, onViewAll }) {
  const activeRules = rules
    .filter((rule) => rule.is_active === true || Number(rule.is_active) === 1)
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || (Number(a.id) || 0) - (Number(b.id) || 0));

  return (
    <aside aria-labelledby="house-rules-card-heading" className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 text-left">
      <div className="flex items-center justify-between gap-3">
        <h2 id="house-rules-card-heading" className="m-0 flex items-center gap-3 text-base font-bold text-slate-900">
          <span aria-hidden="true" className="w-9 h-9 shrink-0 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
            <FontAwesomeIcon icon={faBookOpen} />
          </span>
          House rules
        </h2>
        <button
          type="button"
          onClick={onViewAll}
          className="inline-flex items-center justify-center min-h-[40px] px-4 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-sm font-bold text-slate-900 cursor-pointer transition-colors shrink-0"
        >
          View all rules
        </button>
      </div>
      {loading ? (
        <SkeletonGroup label="Loading house rules" className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1].map((item) => <Bone key={item} className="h-10" />)}
        </SkeletonGroup>
      ) : error ? (
        <p role="alert" className="mb-0 mt-4 text-sm text-rose-700">House rules could not be loaded.</p>
      ) : activeRules.length === 0 ? (
        <p className="mb-0 mt-4 text-sm text-slate-500">No active house rules posted.</p>
      ) : (
        <ul className="list-none m-0 mt-4 p-0 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {activeRules.slice(0, 2).map((rule) => (
            <li key={rule.id} className="flex items-start gap-3 text-sm leading-relaxed text-slate-700">
              <FontAwesomeIcon icon={iconForRule(rule)} className="mt-1 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
              <span>{rule.title}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
