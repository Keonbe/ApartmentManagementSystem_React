import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrashCan, faSun, faCloudSun, faMoon } from '@fortawesome/free-solid-svg-icons';
import { useLang, dateLocale } from '../../config/i18n';
import { EVERY_DAY, GARBAGE_WEEKDAYS, collectionsOn, sortGarbageRows, mondayIndex } from '../../config/myRoomPage';

// My Room → Garbage collection: this week (Monday to Sunday) with the
// collection days filled in, today outlined, a sun / cloud-sun / moon for the
// time of day, and the full list under it. The schedule is the one the admin
// posts in Other Settings → My Room. Also the admin's live preview there.

// Tailwind only keeps classes it sees written out, so each tone is in full.
const PERIOD = {
  morning: { icon: faSun, chip: 'bg-amber-50 text-amber-800 border-amber-200' },
  afternoon: { icon: faCloudSun, chip: 'bg-orange-50 text-orange-800 border-orange-200' },
  evening: { icon: faMoon, chip: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
};

export default function GarbageScheduleCard({ rows, today = new Date() }) {
  const { t } = useLang();
  if (!rows?.length) return null;

  const locale = dateLocale();
  const shortDay = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const longDay = new Intl.DateTimeFormat(locale, { weekday: 'long' });
  const todayIdx = mondayIndex(today);
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - todayIdx);
  const week = GARBAGE_WEEKDAYS.map((_, i) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    return { i, date, items: collectionsOn(rows, i) };
  });
  const periodLabel = (p) => (p ? t(`garbage.period.${p}`) : '');
  const dayLabel = (day) => (day === EVERY_DAY ? t('garbage.everyDay') : longDay.format(week[GARBAGE_WEEKDAYS.indexOf(day)].date));

  // The first collection from today on (wrapping into next week).
  const nextIdx = [0, 1, 2, 3, 4, 5, 6].map((k) => (todayIdx + k) % 7).find((i) => week[i].items.length > 0);
  const next = nextIdx === undefined ? null : week[nextIdx];
  const nextText = next && [
    next.i === todayIdx ? t('garbage.today') : next.i === (todayIdx + 1) % 7 ? t('garbage.tomorrow') : longDay.format(next.date),
    periodLabel(next.items[0].period),
    next.items[0].what,
  ].filter(Boolean).join(' · ');

  return (
    <section aria-labelledby="garbage-heading" className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span aria-hidden="true" className="w-10 h-10 shrink-0 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
            <FontAwesomeIcon icon={faTrashCan} />
          </span>
          <div className="min-w-0">
            <h2 id="garbage-heading" className="m-0 text-xl font-bold text-slate-900">{t('garbage.title')}</h2>
            <p className="m-0 mt-1 text-sm text-slate-600">{t('garbage.subtext')}</p>
          </div>
        </div>
        {nextText && (
          <p className="m-0 w-full sm:w-auto rounded-xl sm:rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800">
            <span className="font-semibold">{t('garbage.next')}:</span> {nextText}
          </p>
        )}
      </div>

      <ol className="m-0 mt-4 p-0 list-none grid grid-cols-7 gap-1.5 sm:gap-3">
        {week.map(({ i, date, items }) => {
          const collect = items.length > 0;
          const isToday = i === todayIdx;
          const periods = [...new Set(items.map((r) => r.period).filter(Boolean))];
          return (
            <li
              key={i}
              aria-current={isToday ? 'date' : undefined}
              className={`min-w-0 flex flex-col items-center gap-0.5 sm:gap-1 rounded-xl border py-2 sm:py-3 transition-colors ${collect
                ? 'ut-native bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/25'
                : 'bg-slate-50 border-slate-200 text-slate-500'} ${isToday ? 'outline-2 outline-offset-2 outline-amber-400' : ''}`}
            >
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wide">{shortDay.format(date)}</span>
              <span className={`text-base sm:text-2xl font-extrabold tabular-nums ${collect ? 'text-white' : 'text-slate-700'}`}>{date.getDate()}</span>
              <span aria-hidden="true" className="flex h-4 items-center gap-0.5 text-[10px] sm:text-xs">
                {periods.map((p) => <FontAwesomeIcon key={p} icon={PERIOD[p].icon} />)}
              </span>
              <span className="sr-only">
                {isToday ? `${t('garbage.today')}. ` : ''}
                {collect ? `${t('garbage.collectionDay')}: ${items.map((r) => [r.what, periodLabel(r.period)].filter(Boolean).join(', ')).join('; ')}` : t('garbage.noCollection')}
              </span>
            </li>
          );
        })}
      </ol>

      <ul className="m-0 mt-4 p-0 list-none divide-y divide-slate-200 border-t border-slate-200">
        {sortGarbageRows(rows).map((r, k) => {
          const onToday = r.day === EVERY_DAY || GARBAGE_WEEKDAYS.indexOf(r.day) === todayIdx;
          const period = PERIOD[r.period];
          return (
            <li key={k} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
              <span className="w-28 shrink-0 text-sm font-bold text-slate-900">{dayLabel(r.day)}</span>
              <span className="flex-1 min-w-[8rem] text-sm text-slate-700">{r.what}</span>
              {onToday && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">{t('garbage.today')}</span>
              )}
              {period && (
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${period.chip}`}>
                  <FontAwesomeIcon icon={period.icon} aria-hidden="true" /> {periodLabel(r.period)}
                </span>
              )}
              {r.time && <span className="text-sm text-slate-600 tabular-nums">{r.time}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
