import { useState, useEffect, useMemo, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Link } from 'react-router-dom';
import {
  faCloudUploadAlt, faFilePdf, faTimes, faExclamationTriangle, faClock, faCircleCheck, faRotate,
  faBan, faScaleBalanced, faIdCard, faSquareParking, faChevronLeft,
} from '@fortawesome/free-solid-svg-icons';
import SuccessModal from '../Components/SuccessModal';
import useScopedRules from '../hooks/useScopedRules';
import api from '../api/axiosConfig';
import { useLang, dateLocale } from '../config/i18n';
import { LIMITS, checkText } from '../utils/validation';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import InlineAlert from '../Components/InlineAlert';
import useDialog from '../hooks/useDialog';
import { formatFileSize, invalidCls } from '../Components/form/formHelpers';
import { Bone } from '../Components/tenant/Skeleton';
import { VEHICLE_TYPES, NO_PLATE_TYPES, slotIcon, vehicleIcon, vehicleLabel, typesText, peso } from '../utils/parkingVehicles';
import '../assets/styles/responsive/user/parking-reservation.responsive.css';

const INPUT = 'parking-input focus-glow w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base min-h-[48px]';

// Each slot state's look: tile, icon and the word under the number.
const STATE_STYLE = {
  free: { tile: 'border-emerald-200 bg-white hover:border-emerald-400 hover:-translate-y-0.5 hover:shadow-md cursor-pointer', icon: 'bg-emerald-50 text-emerald-700', word: 'text-emerald-700' },
  mine: { tile: 'border-indigo-300 bg-indigo-50', icon: 'bg-indigo-100 text-indigo-700', word: 'text-indigo-700' },
  requested: { tile: 'border-amber-300 bg-amber-50', icon: 'bg-amber-100 text-amber-600', word: 'text-amber-700' },
  taken: { tile: 'border-rose-200 bg-rose-50/60', icon: 'bg-rose-100 text-rose-400', word: 'text-rose-500' },
  maintenance: { tile: 'border-slate-200 bg-slate-50', icon: 'bg-slate-100 text-slate-400', word: 'text-slate-500' },
  other: { tile: 'border-slate-200 bg-white opacity-45', icon: 'bg-slate-50 text-slate-400', word: 'text-slate-400' },
};
const STATE_WORD = { free: 'parking.stateFree', mine: 'parking.stateMine', requested: 'parking.stateRequested', taken: 'parking.stateTaken', maintenance: 'parking.stateMaintenance', other: 'parking.stateNotForVehicle' };

// Plate numbers, conduction stickers or MV file numbers (as parking_reservation.php).
const plateError = (val, required, t) => {
  const raw = String(val || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw) return required ? t('parking.errPlateRequired') : '';
  const ok = [/^\d{3}[A-Z]{3}$/, /^\d{4}[A-Z]{2}$/, /^[A-Z]{2}\d{4}$/, /^[A-Z]{3}\d{3}$/, /^[A-Z]{3}\d{4}$/, /^[A-Z]{2}\d{5}$/, /^\d{10,15}$/].some((re) => re.test(raw));
  return ok ? '' : t('parking.errPlateFormat');
};

// The parking rules, read before agreeing (like the rent application's Terms).
function RulesModal({ rules, onClose, onAccept, t, pick }) {
  const ref = useDialog(true, onClose);
  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="parking-rules-title" onClick={(e) => e.stopPropagation()}
        className="outline-none modal-card-anim sheet-mobile bg-white rounded-[2rem] shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh] animate-scale-in overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center gap-3">
          <h3 id="parking-rules-title" className="m-0 flex items-center gap-2.5 text-xl font-black text-slate-900">
            <FontAwesomeIcon icon={faScaleBalanced} className="text-indigo-500" /> {t('parking.rules')}
          </h3>
          <button type="button" aria-label={t('common.close')} onClick={onClose} className="flex h-11 w-11 items-center justify-center text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-full cursor-pointer transition-colors border-0">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        <ol className="m-0 list-none p-6 overflow-y-auto space-y-4 text-sm text-slate-600 leading-relaxed text-left">
          {rules.length === 0 && <li className="text-slate-500">{t('parking.noRules')}</li>}
          {rules.map((r, i) => (
            <li key={r.id} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-black text-indigo-600">{i + 1}</span>
              <div className="min-w-0">
                <h4 className="font-bold text-slate-900 m-0 mb-0.5">{pick(r.title, r.title_fil)}</h4>
                <p className="m-0 whitespace-pre-line">{pick(r.description, r.description_fil)}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="p-5 border-t border-slate-100 flex justify-end bg-slate-50">
          <button type="button" onClick={onAccept} className="bg-[#10b981] hover:bg-[#059669] text-white font-black px-8 py-3 rounded-xl text-sm transition-colors shadow-md shadow-emerald-600/20 cursor-pointer border-0">
            {t('parking.acceptRules')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ParkingReservation() {
  const { t, lang } = useLang();
  const pick = (en, fil) => (lang === 'fil' && fil?.trim() ? fil : en);
  const [data, setData] = useState(null);       // get_available_parking_slots.php
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('all');   // a vehicle type, or all
  const [slot, setSlot] = useState(null);        // the slot being requested (opens the form)
  const [notice, setNotice] = useState('');
  const [success, setSuccess] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  // The form
  const [vehicleType, setVehicleType] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [transmission, setTransmission] = useState('');
  const [durationMonths, setDurationMonths] = useState('');
  const [file, setFile] = useState(null);
  const [agree, setAgree] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const { rules } = useScopedRules('parking');

  const load = useCallback(async () => {
    try {
      const res = await api.get('get_available_parking_slots.php');
      setData(res.data);
      setLoadError('');
    } catch (err) {
      setLoadError(apiErrorMessage(err, t('parking.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const slots = useMemo(() => data?.slots || [], [data]);
  const mine = data?.my_reservations || [];
  const openOnes = mine.filter((r) => ['Pending', 'Assigned'].includes(r.status));
  const closed = mine.filter((r) => !['Pending', 'Assigned'].includes(r.status)).slice(0, 3);
  const atLimit = data && data.open_count >= data.max_per_tenant;
  const fee = Number(data?.monthly_fee || 0);
  const free = !!data?.free || fee <= 0;
  const typesOnSite = VEHICLE_TYPES.filter((vt) => slots.some((s) => s.vehicle_types.includes(vt.value)));
  const shownState = (s) => (s.state === 'free' && filter !== 'all' && !s.vehicle_types.includes(filter) ? 'other' : s.state);
  const freeCount = slots.filter((s) => shownState(s) === 'free').length;

  // ── The request form ──
  const noPlate = NO_PLATE_TYPES.includes(vehicleType);
  const form = useFieldErrors({
    vehicleType: (v) => (slot?.vehicle_types.includes(v) ? '' : t('parking.errChooseType')),
    vehicleModel: (v) => checkText(v, { label: t('parking.vehicleModel'), min: 2, max: LIMITS.vehicleModel }),
    plateNumber: (v) => plateError(v, !noPlate, t),
    transmission: (v) => (noPlate || ['Automatic', 'Manual'].includes(v) ? '' : t('parking.errTransmission')),
    durationMonths: (v) => (v ? '' : t('parking.errDuration')),
    uploadedFile: (f) => (slot?.requires_registration && !f ? t('parking.errOrcr') : f ? checkFile(f, FILE_RULES.document) : ''),
  }, { idPrefix: 'parking-' });
  const values = { vehicleType, vehicleModel, plateNumber, transmission, durationMonths, uploadedFile: file };

  const isImage = file && file.type.startsWith('image/');
  const previewUrl = useMemo(() => (isImage ? URL.createObjectURL(file) : null), [file, isImage]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const openSlot = (s) => {
    setSlot(s);
    setVehicleType(filter !== 'all' && s.vehicle_types.includes(filter) ? filter : s.vehicle_types.length === 1 ? s.vehicle_types[0] : '');
    setVehicleModel(''); setPlateNumber(''); setTransmission(''); setDurationMonths('');
    setFile(null); setAgree(false); setSubmitError(''); form.setErrors({});
  };
  const closeForm = () => { if (!submitting) setSlot(null); };
  const formRef = useDialog(!!slot && !showRules, closeForm);

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitError('');
    const cleanModel = vehicleModel.trim();
    setVehicleModel(cleanModel);
    const ok = form.validateAll({ ...values, vehicleModel: cleanModel });
    const rulesMissing = rules.length > 0 && !agree;
    if (rulesMissing) form.setFieldError('agree', t('parking.errRules'));
    if (!ok || rulesMissing) return;

    const fd = new FormData();
    fd.append('slotId', String(slot.id));
    fd.append('vehicleType', vehicleType);
    fd.append('vehicleModel', cleanModel);
    fd.append('plateNumber', plateNumber.trim());
    if (!noPlate) fd.append('transmission', transmission);
    fd.append('durationMonths', String(durationMonths));
    if (file) fd.append('uploadedFile', file);

    setSubmitting(true);
    try {
      await api.post('parking_reservation.php', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSlot(null);
      setSuccess(true);
      load();
    } catch (err) {
      if (!form.applyServerErrors(err)) setSubmitError(apiErrorMessage(err, t('parking.submitFailed')));
      load(); // a slot taken meanwhile shows as taken
    } finally {
      setSubmitting(false);
    }
  };

  const cancelRequest = async (r) => {
    setCancelling(true);
    try {
      const fd = new FormData();
      fd.append('action', 'cancel');
      fd.append('id', String(r.id));
      await api.post('parking_reservation.php', fd);
      setNotice(t('parking.cancelled'));
      setConfirmCancel(null);
      load();
    } catch (err) {
      setNotice(apiErrorMessage(err, t('parking.submitFailed')));
    } finally {
      setCancelling(false);
    }
  };

  const dateText = (iso) => new Date(iso).toLocaleDateString(dateLocale(lang), { month: 'short', day: 'numeric', year: 'numeric' });
  const statusWord = (status) => { const key = `parking.status${status}`; const text = t(key); return text === key ? status.toLowerCase() : text; };

  return (
    <div className="parking-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-6 sm:py-10 px-4 md:px-12 box-border flex flex-col items-center">
      <div className="page-enter w-full max-w-6xl lg:max-w-[1400px] space-y-6 text-left">
        <header>
          <Link to="/services" className="group mb-2 -ml-0.5 inline-flex min-h-[44px] items-center gap-1.5 py-1 text-sm font-medium text-slate-500 no-underline transition-colors hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
            <FontAwesomeIcon icon={faChevronLeft} className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
            <span>Back to Services</span>
          </Link>
          <h1 className="parking-heading text-3xl sm:text-4xl font-extrabold m-0 tracking-tight text-brand">{t('parking.heading')}</h1>
          <p className="parking-subtext text-slate-500 text-sm mt-1 m-0">{t('parking.subtext')}</p>
        </header>

        {loadError && (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 flex items-center gap-2">
            <FontAwesomeIcon icon={faExclamationTriangle} /> {loadError}
          </div>
        )}
        <InlineAlert tone="info" onDismiss={() => setNotice('')}>{notice}</InlineAlert>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
          {/* ── The spots ── */}
          <section aria-labelledby="parking-spots-title" className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="parking-spots-title" className="m-0 flex items-center gap-2 text-xl font-extrabold text-slate-900">
                  <FontAwesomeIcon icon={faSquareParking} className="text-indigo-500" /> {t('parking.selectSpot')}
                </h2>
                <p className="m-0 mt-1 text-sm text-slate-500">{t('parking.tapSpot')}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${freeCount > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                {loading ? '…' : freeCount > 0 ? t('parking.nAvailable', { n: freeCount }) : t('parking.full')}
              </span>
            </div>

            {typesOnSite.length > 1 && (
              <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label={t('parking.showFor')}>
                <span className="text-xs font-bold text-slate-500">{t('parking.showFor')}</span>
                {[{ value: 'all', label: t('parking.allVehicles') }, ...typesOnSite].map((vt) => (
                  <button key={vt.value} type="button" onClick={() => setFilter(vt.value)} aria-pressed={filter === vt.value}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors ${filter === vt.value ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                    {vt.icon && <FontAwesomeIcon icon={vt.icon} />} {vt.label}
                  </button>
                ))}
              </div>
            )}

            {atLimit && (
              <p className="m-0 mt-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800">{t('parking.limitReached', { n: data.max_per_tenant })}</p>
            )}

            <div className="mt-5">
              {loading && !data ? (
                <div role="status" className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                  <span className="sr-only">{t('parking.checkingSlots')}</span>
                  {Array.from({ length: 10 }, (_, i) => <Bone key={i} className="h-28 rounded-2xl" />)}
                </div>
              ) : slots.length === 0 ? (
                <p className="m-0 py-10 text-center text-sm text-slate-500">{t('parking.noSlots')}</p>
              ) : (
                <ul /* column counts are !important: .stagger-children collapses grids to one column on phones */ className="stagger-children m-0 grid list-none grid-cols-3! gap-3 p-0 sm:grid-cols-4! md:grid-cols-5!">
                  {slots.map((s) => {
                    const state = shownState(s);
                    const style = STATE_STYLE[state];
                    const canPick = state === 'free' && !atLimit;
                    return (
                      <li key={s.id}>
                        <button type="button" disabled={!canPick} onClick={() => openSlot(s)}
                          aria-label={`${t('parking.slotLabel', { label: s.label })}: ${t(STATE_WORD[state])}. ${t('parking.slotTakes', { types: typesText(s.vehicle_types) })}`}
                          className={`relative flex w-full flex-col items-center gap-1.5 rounded-2xl border-2 px-2 py-3 transition-all disabled:cursor-default ${style.tile}`}>
                          <span className={`flex h-12 w-12 items-center justify-center rounded-xl text-xl ${style.icon}`}>
                            <FontAwesomeIcon icon={slotIcon(s.icon)} aria-hidden="true" />
                          </span>
                          <span className="text-sm font-black text-slate-800">{s.label}</span>
                          <span className={`text-[11px] font-bold leading-tight ${style.word}`}>{t(STATE_WORD[state])}</span>
                          {s.requires_registration && state === 'free' && <FontAwesomeIcon icon={faIdCard} title="OR/CR" className="absolute top-2 right-2.5 text-[11px] text-slate-400" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* ── My reservations ── */}
          <aside aria-labelledby="parking-status-title" className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 lg:sticky lg:top-24">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <h2 id="parking-status-title" className="m-0 text-base font-extrabold text-slate-900">{t('parking.statusTitle')}</h2>
              <button type="button" onClick={() => { setLoading(true); load(); }} aria-label="Refresh"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:text-indigo-600 cursor-pointer">
                <FontAwesomeIcon icon={faRotate} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            {loading && !data ? (
              <div className="mt-4 space-y-3" aria-hidden="true">
                <Bone className="h-20 rounded-2xl" /><Bone className="h-20 rounded-2xl" />
              </div>
            ) : (
              <div className="stagger-children mt-4 space-y-3">
                {openOnes.length === 0 && <p className="m-0 text-sm text-slate-500">{t('parking.noReservations')}</p>}
                {openOnes.map((r) => {
                  const active = r.status === 'Assigned';
                  return (
                    <article key={r.id} className={`rounded-2xl border p-4 ${active ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'}`}>
                      <div className="flex items-start gap-3">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-600'}`}>
                          <FontAwesomeIcon icon={active ? faCircleCheck : faClock} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <p className={`m-0 text-sm font-extrabold ${active ? 'text-emerald-800' : 'text-amber-800'}`}>{active ? t('parking.activeLabel') : t('parking.pendingApproval')}</p>
                            {r.slot_label && <span className="rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] font-black text-slate-600">{t('parking.slotLabel', { label: r.slot_label })}</span>}
                          </div>
                          <p className="m-0 mt-0.5 text-xs text-slate-600">{active ? t('parking.activeText') : t('parking.pendingText')}</p>
                          <p className="m-0 mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                            <FontAwesomeIcon icon={vehicleIcon(r.vehicle_type)} className="text-slate-400" />
                            {r.vehicle_model}{r.plate_number ? ` · ${r.plate_number}` : ''}
                          </p>
                          <p className="m-0 mt-0.5 text-xs text-slate-500">
                            {t('parking.months', { n: r.duration_months })}
                            {r.term_ends_at ? ` · ${t('parking.until', { date: dateText(r.term_ends_at) })}` : ''}
                            {' · '}{r.monthly_fee > 0 ? `${peso(r.monthly_fee)}/mo` : t('parking.free')}
                          </p>
                          {!active && (confirmCancel === r.id ? (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold text-slate-700">{t('parking.cancelConfirm')}</span>
                              <button type="button" disabled={cancelling} onClick={() => cancelRequest(r)} className="rounded-lg border-0 bg-rose-600 px-3 py-1.5 text-xs font-bold text-white cursor-pointer disabled:opacity-60">{t('parking.cancelRequest')}</button>
                              <button type="button" disabled={cancelling} onClick={() => setConfirmCancel(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 cursor-pointer">{t('parking.keepRequest')}</button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => setConfirmCancel(r.id)} className="mt-2 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-bold text-amber-800 cursor-pointer hover:bg-amber-100">
                              {t('parking.cancelRequest')}
                            </button>
                          ))}
                        </div>
                      </div>
                    </article>
                  );
                })}

                {closed.length > 0 && (
                  <div className="pt-1">
                    <p className="m-0 mb-2 text-xs font-bold text-slate-500">{t('parking.earlier')}</p>
                    <ul className="m-0 list-none space-y-1.5 p-0">
                      {closed.map((r) => (
                        <li key={r.id} className="flex items-start gap-2 text-xs text-slate-500">
                          <FontAwesomeIcon icon={faBan} className="mt-0.5 text-slate-400" />
                          <span>{r.vehicle_model}{r.plate_number ? ` (${r.plate_number})` : ''}: <strong className="text-slate-700">{statusWord(r.status)}</strong>{(r.rejection_reason || r.release_reason) ? ` · ${r.rejection_reason || r.release_reason}` : ''}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <dl className="m-0 mt-2 space-y-2 rounded-2xl bg-slate-50 p-4 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">{t('parking.activeCount')}</dt><dd className="m-0 font-black text-slate-800">{openOnes.filter((r) => r.status === 'Assigned').length}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">{t('parking.monthlyTotal')}</dt><dd className="m-0 font-black text-emerald-700">{peso(openOnes.filter((r) => r.status === 'Assigned').reduce((sum, r) => sum + Number(r.monthly_fee || 0), 0))}</dd></div>
                </dl>
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* ── The request form ── */}
      {slot && (
        <div onClick={closeForm} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <form ref={formRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="parking-form-title" onClick={(e) => e.stopPropagation()} onSubmit={submit} noValidate
            className="parking-form-card outline-none modal-card-anim sheet-mobile bg-white rounded-[2rem] shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh] animate-scale-in overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-xl text-emerald-700"><FontAwesomeIcon icon={slotIcon(slot.icon)} /></span>
                <div className="min-w-0">
                  <h3 id="parking-form-title" className="m-0 text-lg font-black text-slate-900">{t('parking.reserveSlot', { label: slot.label })}</h3>
                  <p className="m-0 text-xs text-slate-500">{t('parking.slotTakes', { types: typesText(slot.vehicle_types) })}</p>
                </div>
              </div>
              <button type="button" aria-label={t('common.close')} onClick={closeForm} className="flex h-11 w-11 shrink-0 items-center justify-center text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-full cursor-pointer transition-colors border-0">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
              <fieldset className="mx-0 mt-0 p-0 border-0 min-w-0">
                <legend className="mb-2 p-0 text-sm font-bold text-brand">{t('parking.vehicleType')}</legend>
                <div className="flex flex-wrap gap-2" id="parking-vehicleType" tabIndex={-1}>
                  {slot.vehicle_types.map((v) => (
                    <button key={v} type="button" onClick={() => { setVehicleType(v); form.clearError('vehicleType'); }} aria-pressed={vehicleType === v}
                      className={`inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-bold cursor-pointer transition-colors ${vehicleType === v ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                      <FontAwesomeIcon icon={vehicleIcon(v)} /> {vehicleLabel(v)}
                    </button>
                  ))}
                </div>
                <FieldError id="parking-vehicleType" error={form.errors.vehicleType} className="m-0 mt-1" />
              </fieldset>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="parking-vehicleModel" className="text-sm font-bold text-brand">{t('parking.vehicleModel')}</label>
                  <input type="text" {...form.fieldA11y('vehicleModel')} autoComplete="off" placeholder={t('parking.modelPlaceholder')}
                    value={vehicleModel} maxLength={LIMITS.vehicleModel}
                    onChange={(e) => { setVehicleModel(e.target.value); form.clearError('vehicleModel'); }}
                    className={INPUT + invalidCls(form.errors.vehicleModel)} />
                  <FieldError id="parking-vehicleModel" error={form.errors.vehicleModel} className="m-0" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="parking-plateNumber" className="text-sm font-bold text-brand">
                    {t('parking.plateNo')} {noPlate && <span className="font-normal text-slate-500">({t('parking.plateOptional')})</span>}
                  </label>
                  <input type="text" {...form.fieldA11y('plateNumber')} autoComplete="off" placeholder="123-ABC / NKI-3212"
                    value={plateNumber} maxLength={LIMITS.plate}
                    onChange={(e) => { setPlateNumber(e.target.value.toUpperCase().replace(/[^A-Z0-9 -]/g, '')); form.clearError('plateNumber'); }}
                    onBlur={() => plateNumber && form.validateField('plateNumber', values)}
                    className={`${INPUT} uppercase${invalidCls(form.errors.plateNumber)}`} />
                  <FieldError id="parking-plateNumber" error={form.errors.plateNumber} className="m-0" />
                </div>
                {!noPlate && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="parking-transmission" className="text-sm font-bold text-brand">{t('parking.transmission')}</label>
                    <select {...form.fieldA11y('transmission')} value={transmission}
                      onChange={(e) => { setTransmission(e.target.value); form.clearError('transmission'); }}
                      className={`parking-select ${INPUT} cursor-pointer${invalidCls(form.errors.transmission)}`}>
                      <option value="" disabled>{t('parking.selectTransmission')}</option>
                      <option value="Automatic">{t('parking.automatic')}</option>
                      <option value="Manual">{t('parking.manual')}</option>
                    </select>
                    <FieldError id="parking-transmission" error={form.errors.transmission} className="m-0" />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="parking-durationMonths" className="text-sm font-bold text-brand">{t('parking.duration')}</label>
                  <select {...form.fieldA11y('durationMonths')} value={durationMonths}
                    onChange={(e) => { setDurationMonths(e.target.value); form.clearError('durationMonths'); }}
                    className={`parking-select ${INPUT} cursor-pointer${invalidCls(form.errors.durationMonths)}`}>
                    <option value="" disabled>{t('parking.maxMonthsN', { n: data?.max_duration_months ?? 6 })}</option>
                    {Array.from({ length: data?.max_duration_months ?? 6 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{t('parking.months', { n })}</option>
                    ))}
                  </select>
                  <FieldError id="parking-durationMonths" error={form.errors.durationMonths} className="m-0" />
                </div>
              </div>

              {slot.requires_registration && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="parking-uploadedFile" className="text-sm font-bold text-brand">{t('parking.orcrLabel')}</label>
                  <p className="m-0 text-xs text-slate-500">{t('parking.orcrRequired')}</p>
                  {!file ? (
                    <div className={`relative flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-slate-50 p-4 text-center transition-colors hover:border-indigo-400 ${form.errors.uploadedFile ? 'border-rose-300' : 'border-slate-200'}`}>
                      <input type="file" {...form.fieldA11y('uploadedFile')} accept={acceptFor(FILE_RULES.document)}
                        onChange={(e) => { const f = e.target.files?.[0] || null; const err = f ? checkFile(f, FILE_RULES.document) : ''; form.setFieldError('uploadedFile', err); if (!err) setFile(f); e.target.value = ''; }}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                      <FontAwesomeIcon icon={faCloudUploadAlt} className="text-2xl text-slate-400" />
                      <p className="m-0 text-sm text-slate-600">{t('parking.dropHere')} <span className="font-bold text-indigo-600">{t('parking.browse')}</span></p>
                      <p className="m-0 text-xs text-slate-500">{t('parking.supports')}</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      {isImage ? <img src={previewUrl} alt={t('parking.orcrPreview')} className="h-14 w-14 rounded-lg object-cover" />
                        : <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-white text-2xl text-rose-500"><FontAwesomeIcon icon={faFilePdf} /></span>}
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{file.name} <span className="font-normal text-slate-500">({formatFileSize(file.size)})</span></span>
                      <button type="button" onClick={() => setFile(null)} className="rounded-lg border-0 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600 cursor-pointer hover:bg-rose-100">{t('parking.removeRetake')}</button>
                    </div>
                  )}
                  <FieldError id="parking-uploadedFile" error={form.errors.uploadedFile} className="m-0" />
                </div>
              )}

              {rules.length > 0 && (
                <div>
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input type="checkbox" id="parking-agree" checked={agree}
                      onChange={(e) => { setAgree(e.target.checked); form.clearError('agree'); }}
                      aria-invalid={form.errors.agree ? true : undefined} aria-describedby={form.errors.agree ? 'parking-agree-error' : undefined}
                      className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300 accent-indigo-600" />
                    <span className="text-sm font-semibold text-slate-700 leading-snug">
                      {t('parking.agreePrefix')}{' '}
                      <button type="button" onClick={() => setShowRules(true)} className="inline cursor-pointer border-0 bg-transparent p-0 font-bold text-indigo-600 underline underline-offset-2 hover:text-indigo-800">{t('parking.rulesLink')}</button>
                    </span>
                  </label>
                  <FieldError id="parking-agree" error={form.errors.agree} className="m-0 mt-1 pl-8" />
                </div>
              )}

              <InlineAlert onDismiss={() => setSubmitError('')}>{submitError}</InlineAlert>
            </div>

            <div className="p-5 sm:p-6 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-6">
                {free ? (
                  <p className="m-0 text-sm font-bold text-emerald-700">{t('parking.freeNote')}</p>
                ) : (
                  <>
                    <div><span className="block text-xs font-bold text-slate-500">{t('parking.monthlyCost')}</span><span className="text-lg font-black text-slate-800">{peso(fee)}</span></div>
                    <div><span className="block text-xs font-bold text-slate-500">{t('parking.totalCost')}</span><span className="text-lg font-black text-indigo-600">{peso(fee * Number(durationMonths || 0))}</span></div>
                  </>
                )}
              </div>
              <button type="submit" disabled={submitting}
                className="btn-interactive min-h-[48px] rounded-xl border-0 bg-[#10b981] px-8 py-3 text-base font-bold text-white shadow-md transition-all hover:bg-[#059669] active:scale-[0.97] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? t('common.submitting') : t('parking.sendRequest')}
              </button>
            </div>
          </form>
        </div>
      )}

      {showRules && (
        <RulesModal rules={rules} t={t} pick={pick} onClose={() => setShowRules(false)}
          onAccept={() => { setAgree(true); form.clearError('agree'); setShowRules(false); }} />
      )}

      <SuccessModal isOpen={success} onClose={() => setSuccess(false)} message={t('parking.success')} subtext={t('parking.successBody')} />
    </div>
  );
}
