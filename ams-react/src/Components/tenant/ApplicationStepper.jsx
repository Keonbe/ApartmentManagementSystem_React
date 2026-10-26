import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faXmark } from '@fortawesome/free-solid-svg-icons';

// The rent application's steps on Track Application (dark page). `steps` come
// from utils/applicationSteps.js; `bodies` maps a step key to what opens under
// it while it is the current (or stopped) step: the date form, the contract
// upload, the payment. The steps are a real sequence, so they are numbered.
const MARKER = {
  done: 'bg-emerald-400 text-slate-950 border-emerald-400',
  stopped: 'bg-rose-300 text-slate-950 border-rose-300',
  upcoming: 'bg-slate-900 text-slate-300 border-white/25',
};
const CURRENT_MARKER = {
  action: 'bg-amber-300 text-slate-950 border-amber-300 ring-4 ring-amber-300/25',
  waiting: 'bg-indigo-300 text-slate-950 border-indigo-300 ring-4 ring-indigo-300/25',
};
const STATE_TEXT = { done: 'completed', current: 'current step', stopped: 'stopped here', upcoming: 'not started' };

export default function ApplicationStepper({ steps, bodies = {} }) {
  return (
    <ol className="m-0 p-0 list-none">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const current = step.state === 'current';
        const open = current || step.state === 'stopped';
        const markerCls = current ? (CURRENT_MARKER[step.tone] || CURRENT_MARKER.waiting) : MARKER[step.state];
        return (
          <li key={step.key} aria-current={current ? 'step' : undefined} className={`relative flex gap-4 ${last ? '' : 'pb-7'}`}>
            {/* The rail to the next step: solid once this one is done. */}
            {!last && (
              <span aria-hidden="true" className={`absolute left-[17px] top-10 bottom-1 w-0.5 rounded-full ${step.state === 'done' ? 'bg-emerald-400/70' : 'bg-white/15'}`} />
            )}
            <span aria-hidden="true" className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold tabular-nums ${markerCls}`}>
              {step.state === 'done' ? <FontAwesomeIcon icon={faCheck} /> : step.state === 'stopped' ? <FontAwesomeIcon icon={faXmark} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className={`m-0 text-base ${current ? 'font-bold text-white' : step.state === 'upcoming' ? 'font-semibold text-slate-300' : 'font-semibold text-slate-100'}`}>
                  {step.label}
                  <span className="sr-only">, {STATE_TEXT[step.state]}</span>
                </h3>
                {step.date && <span className="text-sm text-slate-300 tabular-nums">{step.date}</span>}
              </div>
              {step.note && <p className="m-0 mt-1 text-sm leading-relaxed text-slate-300">{step.note}</p>}
              {open && bodies[step.key] && <div className="mt-4">{bodies[step.key]}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
