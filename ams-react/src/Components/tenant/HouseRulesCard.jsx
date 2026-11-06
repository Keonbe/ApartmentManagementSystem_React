import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBookOpen, faPaw, faBaby, faStairs, faPeopleGroup, faIdCard } from '@fortawesome/free-solid-svg-icons';

// The rules that decide who may live in the room, as a strip right under the
// Household card on My Room. The limits come from household_members.php
// (`data`): the minimum age, the stairs rule for the tenant's floor and the
// occupant cap. The full list opens in HouseRulesModal (`onViewAll`).
export default function HouseRulesCard({ data, onViewAll }) {
  const rules = [
    { icon: faPaw, text: 'No pets in the building.' },
    data?.minAge ? { icon: faBaby, text: `No children under ${data.minAge} may live in the apartment.` } : null,
    data?.childFloorRule ? { icon: faStairs, text: `Children under ${data.childFloorRule.belowAge} cannot live on the ${data.childFloorRule.floorLabel} because of the stairs.` } : null,
    data?.maxOccupants ? { icon: faPeopleGroup, text: `At most ${data.maxOccupants} people per unit, you included.` } : null,
    { icon: faIdCard, text: 'Everyone who lives in the room must be declared, with their age.' },
  ].filter(Boolean);

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
      <ul className="list-none m-0 mt-4 p-0 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        {rules.map((r) => (
          <li key={r.text} className="flex items-start gap-3 text-sm leading-relaxed text-slate-700">
            <FontAwesomeIcon icon={r.icon} className="mt-1 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
            <span>{r.text}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
