import useScopedRules from '../hooks/useScopedRules';
import { useLang } from '../config/i18n';

// Admin-editable rules for one scope ('parking' or 'minors'), optionally with the
// age categories table. Shown before a parking reservation, on the inquiry form,
// and on the rent application. Renders nothing when there is nothing to show.
export default function ScopedRules({ scope, title, withAgeCategories = false, className = '' }) {
  const { lang } = useLang();
  const { rules, ageCategories, minAge } = useScopedRules(scope, withAgeCategories);
  if (!rules.length && !ageCategories.length && !(withAgeCategories && minAge > 0)) return null;

  const pick = (en, fil) => (lang === 'fil' && fil?.trim() ? fil : en);

  return (
    <section className={`rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-left ${className}`}>
      <h3 className="m-0 mb-2 text-sm font-bold text-slate-800">{title}</h3>
      {withAgeCategories && minAge > 0 && (
        <p className="m-0 mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{lang === 'fil' ? `Bawal ang batang wala pang ${minAge} taon at bawal ang alagang hayop.` : `No children under ${minAge} and no pets are allowed.`}</p>
      )}
      {ageCategories.length > 0 && (
        <div className="mb-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-slate-500"><th className="py-1 pr-3 font-semibold">Category</th><th className="py-1 pr-3 font-semibold">Age</th><th className="py-1 font-semibold">Rule</th></tr></thead>
            <tbody>
              {ageCategories.map((c) => (
                <tr key={c.key} className="align-top border-t border-amber-100">
                  <td className="py-1.5 pr-3 font-semibold text-slate-800">{c.label}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap text-slate-600">{c.min_age}&ndash;{c.max_age}</td>
                  <td className="py-1.5 text-slate-600">{pick(c.rule, c.rule_fil)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ul className="m-0 list-none space-y-2 p-0">
        {rules.map((r) => (
          <li key={r.id} className="text-xs leading-relaxed text-slate-600">
            <span className="font-semibold text-slate-800">{pick(r.title, r.title_fil)}.</span>{' '}
            <span className="whitespace-pre-line">{pick(r.description, r.description_fil)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
