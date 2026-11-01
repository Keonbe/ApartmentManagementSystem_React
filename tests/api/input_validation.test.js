// Per-field validation (config.php validation_fail): a refused request answers
// 422 with every bad field in `errors`, keyed by the form's field names, and
// `message`/`field` naming the first. Nothing is written.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { one, setting } from './lib/db.js';

let admin, maria;
beforeAll(async () => {
  [admin, maria] = await Promise.all([loginAs('admin'), loginAs('maria')]);
});

const expectFields = (res, fields) => {
  expect(res.status).toBe(422);
  expect(res.body.success).toBe(false);
  expect(Object.keys(res.body.errors).sort()).toEqual([...fields].sort());
  expect(res.body.field).toBe(Object.keys(res.body.errors)[0]);
  expect(res.body.message).toBe(res.body.errors[res.body.field]);
};

describe('payments', () => {
  it('pay_bill.php lists every missing field', async () => {
    const res = await api('pay_bill.php', { token: maria, json: { paymentReference: 'x'.repeat(101) } });
    expectFields(res, ['invoiceId', 'paymentMethod', 'paymentReference']);
  });

  it('schedule_payment.php: bad date and slot together', async () => {
    const res = await api('schedule_payment.php', { token: maria, json: { invoice_id: 'INV-X', scheduled_date: '2026-02-30', scheduled_time_slot: 'night' } });
    expectFields(res, ['scheduled_date', 'scheduled_time_slot']);
  });

  it('upload_payment_proof.php: no file, bad bank and bad amount, before anything is saved', async () => {
    const form = new FormData();
    form.append('invoice_id', 'INV-X');
    form.append('payment_method', 'Bank Transfer');
    form.append('bank_name', 'Not A Bank');
    form.append('amount', '-5');
    const res = await api('upload_payment_proof.php', { token: maria, form });
    expectFields(res, ['bank_name', 'proof', 'amount']);
  });

  it('reject_payment_proof.php: reason over 255 characters', async () => {
    const res = await api('reject_payment_proof.php', { token: admin, json: { invoiceId: 'INV-X', reason: 'r'.repeat(256) } });
    expectFields(res, ['reason']);
  });

  it('record_payment_admin.php: no invoice and no amount', async () => {
    const res = await api('record_payment_admin.php', { token: admin, json: { paymentMethod: 'cash' } });
    expectFields(res, ['invoiceId', 'amountPaid']);
  });
});

describe('applications and visitors', () => {
  it('schedule_move_in.php: past date and an over-long message', async () => {
    const form = new FormData();
    form.append('id', '5');
    form.append('move_in_date', '2020-01-01');
    form.append('message', 'm'.repeat(1001));
    const res = await api('schedule_move_in.php', { token: admin, form });
    expectFields(res, ['move_in_date', 'message']);
  });

  it('cancel_application.php: no id and no reason', async () => {
    const res = await api('cancel_application.php', { token: maria, json: {} });
    expectFields(res, ['id', 'reason']);
  });

  it('check_in_visitor.php (admin walk-in): several bad fields at once, no row written', async () => {
    const before = (await one('SELECT COUNT(*) AS c FROM visitor_logs')).c;
    const res = await api('check_in_visitor.php', {
      token: admin,
      json: { visitorName: '', contactNumber: '12345', purpose: '', idType: 'Library Card', idNumber: '', unit: 'ZZ', visitAt: '', expectedCheckOutAt: '' },
    });
    expectFields(res, ['visitorName', 'contactNumber', 'purpose', 'idType', 'idNumber', 'unit', 'visitTime', 'checkOutTime']);
    expect((await one('SELECT COUNT(*) AS c FROM visitor_logs')).c).toBe(before);
  });

  it('update_visitor_status.php: unknown action and bad id', async () => {
    const res = await api('update_visitor_status.php', { token: admin, json: { id: 'abc', action: 'teleport' } });
    expectFields(res, ['id', 'action']);
  });
});

describe('utilities and settings', () => {
  it('save_utility_reading.php: shared fields reported together', async () => {
    const res = await api('save_utility_reading.php', { token: admin, json: { room_name: '', billing_period: '2026-13', reading_date: 'yesterday', entry_mode: 'guess' } });
    expectFields(res, ['room_name', 'billing_period', 'reading_date', 'entry_mode']);
  });

  it('manage_utility_types.php: name, mode and rate together', async () => {
    const res = await api('manage_utility_types.php', { token: admin, json: { name: '', billing_mode: 'yearly', default_rate: 'free' } });
    expectFields(res, ['name', 'billing_mode', 'default_rate']);
  });

  it('update_system_settings.php: every refused key is listed, none saved', async () => {
    const before = await setting('payment_window_days');
    const res = await api('update_system_settings.php', {
      token: admin,
      json: { payment_window_days: '99', max_parking_slots: '0', visitor_overstay_hours: '500' },
    });
    expectFields(res, ['paymentWindowDays', 'maxParkingSlots', 'visitorOverstayHours']);
    expect(await setting('payment_window_days')).toBe(before);
  });

  it('monitor_followups.php POST: bad kind and id', async () => {
    const res = await api('monitor_followups.php', { token: admin, json: { kind: 'rent', id: 0 } });
    expectFields(res, ['kind', 'id']);
  });
});
