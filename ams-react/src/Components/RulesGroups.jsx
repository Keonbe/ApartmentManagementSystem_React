import { useLang } from '../config/i18n';

const GROUPS = [
  { scope: 'house', labelKey: 'houseRules.groupHouse' },
  { scope: 'minors', labelKey: 'houseRules.groupMinors' },
  { scope: 'parking', labelKey: 'houseRules.groupParking' },
];

// Rule cards grouped by scope (house / children and pets / parking); empty groups are skipped.
// `compact` is the smaller type used in the inquiry sidebar.
export default function RulesGroups({ rules, compact = false }) {
  const { lang, t } = useLang();
  const pick = (en, fil) => (lang === 'fil' && fil?.trim() ? fil : en);
  return GROUPS.map(({ scope, labelKey }) => {
    const items = rules.filter((r) => (r.scope || 'house') === scope);
    if (!items.length) return null;
    return (
      <div key={scope} className={compact ? 'space-y-2.5' : 'space-y-3'}>
        <h4 className="m-0 text-[11px] font-bold uppercase tracking-wide text-indigo-700">{t(labelKey)}</h4>
        {items.map((rule) => (
          <article key={rule.id} className={compact ? 'rounded-xl border border-slate-100 bg-slate-50/80 p-3' : 'rounded-xl border border-slate-200 bg-slate-50/70 p-4'}>
            <h3 className={`m-0 font-semibold text-slate-800 ${compact ? 'text-xs' : 'text-sm'}`}>{pick(rule.title, rule.title_fil)}</h3>
            <p className={`m-0 mt-1 whitespace-pre-line leading-relaxed text-slate-600 ${compact ? 'text-[11px]' : 'text-xs'}`}>{pick(rule.description, rule.description_fil)}</p>
          </article>
        ))}
      </div>
    );
  });
}
