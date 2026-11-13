import { useState, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faExclamationTriangle, faDollarSign, faShieldAlt, faInfoCircle, faCreditCard, faLock,
  faQrcode, faCloudUploadAlt, faTrashAlt, faSpinner, faCheckCircle
} from '@fortawesome/free-solid-svg-icons';
import { SettingsSection, Field, WithUnit, Callout, INPUT, INPUT_MONO, INPUT_NUMBER, CHECKBOX } from './SettingsSection';
import { LIMITS } from '../../utils/validation';
import { blockNonIntegerKeys, numberValue } from '../../Components/form/formHelpers';
import api from '../../api/axiosConfig';
import { publicAssetUrl } from '../../api/fileUrl';
import ImageCropModal from '../../Components/admin/ImageCropModal';
import { QRPH_SLOT_COUNT } from '../../config/systemSettings';


const PAYMENT_MODES = [
  { value: 'both', label: 'Both (Manual & Sandbox)', hint: 'Proof upload, QR Ph, & PayMongo test' },
  { value: 'manual', label: 'Manual only', hint: 'Proof upload / in person' },
  { value: 'sandbox', label: 'Sandbox only', hint: 'PayMongo test mode' },
];

function ChannelRow({ label, sublabel, checked, onChange, disabled = false }) {
  return (
    <label className={`flex items-center justify-between gap-3 p-2 rounded-control transition-colors ${
      disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 cursor-pointer'
    }`}>
      <span>
        <span className="text-label font-medium text-slate-700 block">{label}</span>
        {sublabel && <span className="text-caption text-slate-500">{sublabel}</span>}
      </span>
      <input
        type="checkbox"
        checked={!disabled && !!checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className={`${CHECKBOX} disabled:cursor-not-allowed`}
      />
    </label>
  );
}

function ModeBadge({ active, mode }) {
  return active
    ? <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap bg-emerald-50 text-emerald-700">Active</span>
    : <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap bg-slate-100 text-slate-600">Off in {mode} mode</span>;
}

export default function PaymentsPanel({ settings, updateSetting }) {
  const isSandboxOnly = settings.paymentMode === 'sandbox';
  const isManualOnly = settings.paymentMode === 'manual';
  const isBoth = settings.paymentMode === 'both';

  const [uploadingSlot, setUploadingSlot] = useState(null);
  const [qrUploadError, setQrUploadError] = useState('');
  // The image picked for a slot, waiting in the crop dialog: { slot, file, url }.
  const [cropping, setCropping] = useState(null);
  const slotNums = Array.from({ length: QRPH_SLOT_COUNT }, (_, i) => i + 1);

  // Always QRPH_SLOT_COUNT slots; ones stored above that (the old 5-slot list) are dropped on save.
  const slotsList = useMemo(() => {
    const existing = Array.isArray(settings.qrphSlots) ? settings.qrphSlots : [];
    return Array.from({ length: QRPH_SLOT_COUNT }, (_, i) => i + 1).map((num) => {
      const found = existing.find((s) => Number(s.slot) === num);
      return found || {
        slot: num,
        label: `QR Ph Slot ${num}`,
        image_path: '',
        account_name: '',
        account_number: '',
      };
    });
  }, [settings.qrphSlots]);

  // A slot above the count (from the old 5-slot list) shows as slot 1 until one is picked.
  const storedActive = Number(settings.qrphActiveSlot || 1);
  const activeSlotNum = storedActive >= 1 && storedActive <= QRPH_SLOT_COUNT ? storedActive : 1;

  const handleSlotFieldChange = (slotNum, field, value) => {
    const updated = slotsList.map((s) => (s.slot === slotNum ? { ...s, [field]: value } : s));
    updateSetting('qrphSlots', updated);
  };

  const handleRemoveQr = (slotNum) => {
    const updated = slotsList.map((s) => (s.slot === slotNum ? { ...s, image_path: '' } : s));
    updateSetting('qrphSlots', updated);
  };

  const openCrop = (slotNum, file) => {
    setQrUploadError('');
    setCropping({ slot: slotNum, file, url: URL.createObjectURL(file) });
  };
  const closeCrop = () => {
    if (cropping) URL.revokeObjectURL(cropping.url);
    setCropping(null);
  };

  const handleUploadQr = async (slotNum, file) => {
    setQrUploadError('');
    setUploadingSlot(slotNum);
    const formData = new FormData();
    formData.append('qr_image', file);
    formData.append('slot', slotNum);
    try {
      const res = await api.post('/upload_qr_image.php', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.success) {
        const updated = slotsList.map((s) => (s.slot === slotNum ? { ...s, image_path: res.data.image_path } : s));
        updateSetting('qrphSlots', updated);
      } else {
        setQrUploadError(res.data.message || 'Failed to upload QR code image.');
      }
    } catch (err) {
      setQrUploadError(err?.response?.data?.message || err.message || 'Failed to upload QR code image.');
    } finally {
      setUploadingSlot(null);
      closeCrop();
    }
  };

  return (
    <>
      <SettingsSection
        icon={faExclamationTriangle}
        tone="rose"
        title="Overdue & Eviction Policy"
        description="When an unpaid tenant is listed for eviction review."
      >
        <Field label="Payment Window" htmlFor="setting-paymentWindowDays" icon={faDollarSign} hint="How long a tenant has to pay a move-in invoice or finish an online checkout. After that an unfinished checkout is released and an unpaid move-in application is cancelled automatically.">
          <WithUnit suffix="days">
            <input
              id="setting-paymentWindowDays" name="paymentWindowDays"
              type="number" inputMode="numeric" min="1" max="30" step="1" required
              value={settings.paymentWindowDays}
              onKeyDown={blockNonIntegerKeys}
              onChange={(e) => updateSetting('paymentWindowDays', numberValue(e))}
              className={`${INPUT_NUMBER} w-24`}
            />
          </WithUnit>
        </Field>

        <Field label="Overdue Follow-Up After" htmlFor="setting-overdueThresholdDays" icon={faDollarSign} hint="Tenants past this many days overdue are listed for a payment follow-up on the Contracts page.">
          <WithUnit suffix="days overdue">
            <input
              id="setting-overdueThresholdDays" name="overdueThresholdDays"
              type="number" inputMode="numeric" min="1" max="365" step="1" required
              value={settings.overdueThresholdDays}
              onKeyDown={blockNonIntegerKeys}
              onChange={(e) => updateSetting('overdueThresholdDays', numberValue(e))}
              className={`${INPUT_NUMBER} w-24`}
            />
          </WithUnit>
        </Field>

        <Callout tone="rose" icon={faInfoCircle} title="Eviction Policy (RA 9653)">
          Tenants overdue more than <strong>{settings.overdueThresholdDays} days</strong> are listed for a payment
          follow-up. Unpaid rent becomes a ground for eviction only once it totals three months (RA 9653 Sec. 9);
          those tenants appear in the eviction banner on the Contracts page. Flagging is never automatic, and only a
          court can order a tenant out.
        </Callout>
      </SettingsSection>

      <SettingsSection
        icon={faCreditCard}
        tone="indigo"
        title="Payment Channels & Options"
        description="Enable or disable the payment channels that tenants see during checkout."
      >
        <Field label="Operating Payment Mode" hint="Controls which channel types are surfaced to tenants during checkout.">
          <div className="flex flex-wrap gap-3">
            {PAYMENT_MODES.map((mode) => (
              <label
                key={mode.value}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-card border cursor-pointer transition-colors ${
                  settings.paymentMode === mode.value ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMode"
                  value={mode.value}
                  checked={settings.paymentMode === mode.value}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateSetting('paymentMode', val);
                    if (val === 'sandbox' || val === 'both') updateSetting('paymentSandboxEnabled', true);
                  }}
                  className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span>
                  <span className="text-body font-semibold text-slate-700 block">{mode.label}</span>
                  <span className="text-caption text-slate-600">{mode.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-card border border-slate-200 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-label font-medium text-slate-800">Manual & In-Person</span>
              <ModeBadge active={!isSandboxOnly} mode="Sandbox" />
            </div>
            <div className="space-y-1">
              <ChannelRow
                label="QR Ph (Static QR & Proof Upload)"
                sublabel="Interoperable across GCash, Maya, and banks"
                disabled={isSandboxOnly}
                checked={settings.paymentChQrphManual}
                onChange={(v) => updateSetting('paymentChQrphManual', v)}
              />
              <ChannelRow label="GCash (Receipt Upload)" disabled={isSandboxOnly} checked={settings.paymentChGcashManual} onChange={(v) => updateSetting('paymentChGcashManual', v)} />
              <ChannelRow label="BDO / BPI Bank Transfer (Receipt Upload)" disabled={isSandboxOnly} checked={settings.paymentChBankManual} onChange={(v) => updateSetting('paymentChBankManual', v)} />
              <ChannelRow label="In-Person Payment" sublabel="Scheduled office visit · offered in all modes" checked={settings.paymentChInPerson} onChange={(v) => updateSetting('paymentChInPerson', v)} />
            </div>
          </div>

          <div className="p-4 rounded-card border border-slate-200 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-label font-medium text-slate-800">Sandbox (PayMongo)</span>
              <ModeBadge active={!isManualOnly} mode="Manual" />
            </div>
            <div className="space-y-1">
              <ChannelRow label="GCash Sandbox" disabled={isManualOnly} checked={settings.paymentChGcashSandbox} onChange={(v) => updateSetting('paymentChGcashSandbox', v)} />
              <ChannelRow label="Bank Transfer Sandbox" disabled={isManualOnly} checked={settings.paymentChBankSandbox} onChange={(v) => updateSetting('paymentChBankSandbox', v)} />
              <ChannelRow label="Maya Sandbox" disabled={isManualOnly} checked={settings.paymentChMaya} onChange={(v) => updateSetting('paymentChMaya', v)} />
            </div>
          </div>
        </div>

        <p className="text-caption text-slate-500">
          {isBoth
            ? 'Tenants see both receipt-upload channels (QR Ph, GCash, Bank Transfer) and PayMongo sandbox channels, plus In-Person.'
            : isSandboxOnly
              ? 'Tenants see the PayMongo sandbox channels plus In-Person. Switch the mode above to use manual channels or both.'
              : 'Tenants see the receipt-upload channels (QR Ph, GCash, Bank Transfer) plus In-Person. Switch the mode above to use sandbox channels or both.'}
        </p>

        <Field
          label="Reused Payment Reference"
          htmlFor="setting-duplicateReferencePolicy"
          hint={settings.duplicateReferencePolicy === 'block'
            ? 'A GCash, QR Ph, or bank reference already used on another payment is refused, for tenant proofs and desk recording.'
            : 'A GCash, QR Ph, or bank reference already used on another payment is accepted and flagged on the payment for you to check.'}
        >
          <select
            id="setting-duplicateReferencePolicy" name="duplicateReferencePolicy"
            value={settings.duplicateReferencePolicy === 'block' ? 'block' : 'warn'}
            onChange={(e) => updateSetting('duplicateReferencePolicy', e.target.value)}
            className={`${INPUT} sm:max-w-xs`}
          >
            <option value="warn">Warn admin only</option>
            <option value="block">Block reuse</option>
          </select>
        </Field>
      </SettingsSection>

      <SettingsSection
        icon={faQrcode}
        tone="indigo"
        title={`QR Ph Configuration (${QRPH_SLOT_COUNT} Static QR Slots)`}
        description={`Upload up to ${QRPH_SLOT_COUNT} static QR Ph codes, cropped to the code, and select the active one shown to tenants when they pay.`}
      >
        <Callout tone="indigo" icon={faInfoCircle} title="How QR Ph Works">
          QR Ph is the Philippine national QR standard supported by <strong>GCash, Maya, BDO, BPI, UnionBank, Landbank, RCBC</strong>, and other InstaPay/PESONet institutions.
          You can store up to {QRPH_SLOT_COUNT} QR codes here (e.g., primary GCash, backup bank, business account). The slot marked <strong>Active</strong> will be displayed to tenants when they choose QR Ph.
        </Callout>

        {qrUploadError && (
          <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
            {qrUploadError}
          </div>
        )}

        <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold text-indigo-950 uppercase tracking-wider block">Active QR Code For Checkout</span>
            <span className="text-xs text-indigo-700">Currently showing Slot #{activeSlotNum} to tenants: <strong>{slotsList.find(s => s.slot === activeSlotNum)?.label || `Slot ${activeSlotNum}`}</strong></span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {slotNums.map((num) => {
              const isActive = activeSlotNum === num;
              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => updateSetting('qrphActiveSlot', num)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    isActive
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                  }`}
                >
                  Slot {num} {isActive ? '★ Active' : ''}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {slotsList.map((slot) => {
            const isActive = activeSlotNum === slot.slot;
            return (
              <div
                key={slot.slot}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                  isActive
                    ? 'border-indigo-500 bg-indigo-50/30 ring-2 ring-indigo-500/20 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[11px]">
                        {slot.slot}
                      </span>
                      <span className="text-xs font-bold text-slate-800">Slot {slot.slot}</span>
                    </div>
                    {isActive ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <FontAwesomeIcon icon={faCheckCircle} className="text-[9px]" /> Active
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => updateSetting('qrphActiveSlot', slot.slot)}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer bg-transparent border-0 p-0"
                      >
                        Set as Active
                      </button>
                    )}
                  </div>

                  {/* QR Image Preview Area */}
                  <div className="mt-3 flex flex-col items-center justify-center">
                    {slot.image_path ? (
                      <div className="w-36 h-36 rounded-xl border border-slate-200 bg-white p-2 flex flex-col items-center justify-center shadow-xs">
                        <img
                          src={publicAssetUrl(slot.image_path)}
                          alt={`QR Code Slot ${slot.slot}`}
                          className="w-full h-full object-contain rounded-lg"
                        />
                      </div>
                    ) : (
                      <div className="w-full h-36 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/70 flex flex-col items-center justify-center text-slate-400 p-3 text-center">
                        <FontAwesomeIcon icon={faQrcode} className="text-3xl text-slate-300 mb-1" />
                        <span className="text-xs font-medium text-slate-500">No QR Code Uploaded</span>
                        <span className="text-[10px] text-slate-600">Upload a static QR Ph image</span>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 mt-2 w-full justify-center">
                      <label className="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg cursor-pointer transition-colors border border-indigo-200 inline-flex items-center">
                        {uploadingSlot === slot.slot ? (
                          <span><FontAwesomeIcon icon={faSpinner} spin className="mr-1.5" />Uploading...</span>
                        ) : (
                          <span><FontAwesomeIcon icon={faCloudUploadAlt} className="mr-1.5" />{slot.image_path ? 'Replace QR' : 'Upload QR'}</span>
                        )}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="hidden"
                          disabled={uploadingSlot === slot.slot}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) openCrop(slot.slot, file);
                            e.target.value = '';
                          }}
                        />
                      </label>

                      {slot.image_path && (
                        <button
                          type="button"
                          onClick={() => handleRemoveQr(slot.slot)}
                          className="text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors border border-rose-200"
                        >
                          <FontAwesomeIcon icon={faTrashAlt} className="mr-1" />Remove
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Metadata fields */}
                  <div className="mt-4 space-y-2.5 text-left">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">Slot Label / Description</label>
                      <input
                        type="text" autoComplete="off"
                        placeholder="e.g. GCash Merchant QR"
                        value={slot.label || ''}
                        onChange={(e) => handleSlotFieldChange(slot.slot, 'label', e.target.value)}
                        className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">Account Name (optional)</label>
                      <input
                        type="text" autoComplete="off"
                        placeholder="e.g. Juan Dela Cruz"
                        value={slot.account_name || ''}
                        onChange={(e) => handleSlotFieldChange(slot.slot, 'account_name', e.target.value)}
                        className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">Account / Mobile No. (optional)</label>
                      <input
                        type="text" autoComplete="off"
                        placeholder="e.g. 0917-123-4567"
                        value={slot.account_number || ''}
                        onChange={(e) => handleSlotFieldChange(slot.slot, 'account_number', e.target.value)}
                        className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800 bg-white font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-slate-100 text-[10px] text-slate-600 text-center">
                  {slot.image_path ? 'Ready to display when active' : 'No image uploaded'}
                </div>
              </div>
            );
          })}
        </div>

        {cropping && (
          <ImageCropModal
            key={cropping.url}
            file={cropping.file}
            url={cropping.url}
            title={`Crop the QR code for slot ${cropping.slot}`}
            busy={uploadingSlot === cropping.slot}
            onCancel={closeCrop}
            onConfirm={(file) => handleUploadQr(cropping.slot, file)}
          />
        )}
      </SettingsSection>

      <SettingsSection
        icon={faShieldAlt}
        tone="blue"
        title="PayMongo Gateway"
        description="API keys for online payments. Live mode is locked; everything runs in sandbox."
      >
        <Field label="Environment Mode" hint="Live configuration is locked. All transactions will be processed in Sandbox Mode.">
          <div className="flex items-center gap-6 mt-1 text-body text-slate-700">
            <label className="flex items-center gap-2 opacity-50 cursor-not-allowed" title="Live mode is currently locked by system administrator.">
              <input type="radio" name="paymongoEnv" value="live" checked={false} disabled className="cursor-not-allowed" />
              <span>Live (Production) <FontAwesomeIcon icon={faLock} className="text-[10px] ml-1" /></span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="paymongoEnv" value="sandbox" checked readOnly className="text-indigo-600 focus:ring-indigo-500" />
              <span>Sandbox (Testing)</span>
            </label>
          </div>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Sandbox Secret Key" htmlFor="setting-paymongoSecretKey">
            <input
              id="setting-paymongoSecretKey" name="paymongoSecretKey"
              type="password" autoComplete="new-password" spellCheck={false} maxLength={LIMITS.smtpField}
              value={settings.paymongoSecretKey || ''}
              onChange={(e) => updateSetting('paymongoSecretKey', e.target.value)}
              placeholder="sk_test_..."
              className={INPUT_MONO}
            />
          </Field>
          <Field label="Sandbox Public Key" htmlFor="setting-paymongoPublicKey" hint="Not used yet. Checkout runs on the server with the secret key; kept for a future client-side checkout.">
            <input
              id="setting-paymongoPublicKey" name="paymongoPublicKey"
              type="text" autoComplete="off" spellCheck={false} maxLength={LIMITS.smtpField}
              value={settings.paymongoPublicKey || ''}
              onChange={(e) => updateSetting('paymongoPublicKey', e.target.value)}
              placeholder="pk_test_..."
              className={INPUT_MONO}
            />
          </Field>
          <Field label="Webhook Secret Key" htmlFor="setting-paymongoWebhookSecret" hint="Required for signature verification. Obtain this from the PayMongo Webhooks dashboard.">
            <input
              id="setting-paymongoWebhookSecret" name="paymongoWebhookSecret"
              type="password" autoComplete="new-password" spellCheck={false} maxLength={LIMITS.smtpField}
              value={settings.paymongoWebhookSecret || ''}
              onChange={(e) => updateSetting('paymongoWebhookSecret', e.target.value)}
              placeholder="whsk_..."
              className={INPUT_MONO}
            />
          </Field>
        </div>
      </SettingsSection>
    </>
  );
}
