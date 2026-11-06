// Every endpoint that takes a calendar date must reject one that does not exist (2026-11-31, a Feb 30)
// instead of letting PHP roll it over to the next month, and must not store or act on free text such as
// "tomorrow". Each case sends an impossible date whose rolled-over twin would be valid, so a missing
// round-trip check shows up as an accepted request. QA manual INP-25 .. INP-28.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs } from './lib/api.js';
import { q, one } from './lib/db.js';
import { addInvoice } from './lib/fixtures.js';

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const daysBetween = (d) => Math.round((new Date(`${d}T00:00:00`) - new Date(iso(new Date()) + 'T00:00:00')) / 864e5);

// An impossible date ("YYYY-MM-31" for a 30-day month, "YYYY-02-30") whose rolled-over twin is the 1st of the
// next month. `from`..`to` is the window (days from today) the twin has to land in; null if none exists soon.
function impossible(from, to) {
  for (let m = 0; m < 30; m++) {
    const first = new Date(); first.setDate(1); first.setMonth(first.getMonth() + m);
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    if (days === 31) continue;
    const bad = `${first.getFullYear()}-${pad(first.getMonth() + 1)}-${days === 30 ? 31 : 30}`;
    const twin = new Date(first.getFullYear(), first.getMonth() + 1, 1);
    const off = daysBetween(iso(twin));
    if (off >= from && off <= to) return bad;
  }
  return null;
}
const pastImpossible = () => {
  for (let m = 1; m < 30; m++) {
    const first = new Date(); first.setDate(1); first.setMonth(first.getMonth() - m);
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    if (days === 31) continue;
    const twin = new Date(first.getFullYear(), first.getMonth() + 1, 1);
    const off = daysBetween(iso(twin));
    if (off <= -1 && off >= -50) return `${first.getFullYear()}-${pad(first.getMonth() + 1)}-${days === 30 ? 31 : 30}`;
  }
  return null;
};
const TEXT_DATES = ['tomorrow', 'next friday', '+1 week', 'now', '2031-1-5', '2031/01/05', '05-01-2031', '20310105', '2031-01-05T10:00', ' '];

let admin, maria, jose;
beforeAll(async () => {
  [admin, maria, jose] = await Promise.all([loginAs('admin'), loginAs('maria'), loginAs('jose')]);
});

const bad = impossible(2, 55);
const badFar = impossible(16, 29);
const badPast = pastImpossible();

describe('the helper found impossible dates to test with', () => {
  it('has a near-future one (skipped checks below would be silent otherwise)', () => {
    expect(bad, 'no month boundary within 55 days').not.toBeNull();
  });
});

describe('tenant forms', () => {
  it('maintenance_request.php refuses an impossible or free-text preferred date', async () => {
    for (const preferredDate of [bad, ...TEXT_DATES].filter(Boolean)) {
      const form = new FormData();
      form.append('issueType', 'Plumbing'); form.append('preferredTime', 'morning'); form.append('description', 'date probe');
      form.append('preferredDate', preferredDate);
      expect((await api('maintenance_request.php', { token: maria, form })).status, preferredDate).toBe(422);
    }
    expect(await one("SELECT id FROM maintenance_requests WHERE description = 'date probe'")).toBeNull();
  });

  it('service_request.php and get_service_availability.php refuse them too', async () => {
    const svc = (await q("INSERT INTO service_catalog (category, name, price, pricing_unit, min_quantity, max_quantity, lead_time_days, is_active) VALUES ('laundry', 'Date probe', 100, 'kg', 1, 10, 0, 1)")).insertId;
    for (const preferredDate of [bad, ...TEXT_DATES].filter(Boolean)) {
      const form = new FormData();
      form.append('serviceId', String(svc)); form.append('preferredDate', preferredDate); form.append('preferredTimeSlot', 'morning'); form.append('quantity', '1');
      expect((await api('service_request.php', { token: maria, form })).status, preferredDate).toBe(422);
      expect((await api('get_service_availability.php', { token: maria, query: { service_id: svc, date: preferredDate } })).status, `avail ${preferredDate}`).toBe(422);
    }
    expect((await one('SELECT COUNT(*) AS n FROM service_requests WHERE service_id = ?', [svc])).n).toBe(0);
  });

  it('cctv_request.php refuses an impossible incident date', async () => {
    const dates = [badPast, ...TEXT_DATES].filter(Boolean);
    const before = (await one('SELECT COUNT(*) AS n FROM cctv_requests WHERE user_id = 2')).n;
    for (const incidentDate of dates) {
      const res = await api('cctv_request.php', { token: maria, json: { incidentDate, incidentTime: '08:00 PM - 12:00 AM', locationDetails: '1st Floor', incidentType: 'theft', reasonRequest: 'Bicycle taken from the hallway.', privacyConsent: true } });
      expect(res.status, incidentDate).toBe(422);
    }
    expect((await one('SELECT COUNT(*) AS n FROM cctv_requests WHERE user_id = 2')).n).toBe(before);
  });

  it('schedule_payment.php and submit_split_payment.php refuse them', async () => {
    await addInvoice('INV-DATE-SCHED', { userId: 2, appId: 1, amount: 1000, status: 'pending' });
    for (const scheduled_date of [bad, ...TEXT_DATES].filter(Boolean)) {
      const res = await api('schedule_payment.php', { token: maria, json: { invoice_id: 'INV-DATE-SCHED', scheduled_date, scheduled_time_slot: 'morning' } });
      expect(res.status, `schedule ${scheduled_date}`).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      const form = new FormData();
      form.append('invoice_id', 'INV-DATE-SCHED'); form.append('scheduled_date', scheduled_date); form.append('scheduled_time_slot', 'morning');
      const split = await api('submit_split_payment.php', { token: maria, form });
      expect(split.body?.success, `split ${scheduled_date}`).not.toBe(true);
      expect(split.status).toBeLessThan(500);
    }
    expect((await one("SELECT status, scheduled_date FROM invoices WHERE id = 'INV-DATE-SCHED'")).scheduled_date).toBeNull();
  });

  it('check_in_visitor.php refuses an impossible arrival time', async () => {
    const stamp = (d) => `${d}T10:00`;
    for (const expectedAt of [bad && stamp(bad), 'tomorrow 10:00', '2031-13-01T10:00'].filter(Boolean)) {
      const res = await api('check_in_visitor.php', { token: maria, json: {
        visitorName: 'Date Probe', contactNumber: '09171234567', purpose: 'probe', idType: 'National ID', idNumber: 'X1',
        expectedAt, expectedCheckOutAt: stamp(iso(addDays(2))),
      } });
      expect(res.status, expectedAt).toBe(422);
    }
    expect(await one("SELECT id FROM visitor_logs WHERE visitor_name = 'Date Probe'")).toBeNull();
  });

  it('record_move_out.php refuses an impossible or free-text move-out date', async () => {
    const dates = [badFar, ...TEXT_DATES].filter(Boolean);
    for (const move_out_date of dates) {
      const res = await api('record_move_out.php', { token: jose, json: { move_out_date } });
      expect(res.status, move_out_date).toBe(400);
    }
    expect((await one("SELECT status FROM rent_applications WHERE user_id = 3 AND status = 'pending-move-out'"))).toBeNull();
  });

  it('submit_inquiry.php refuses an impossible move-in date', async () => {
    let n = 0;
    for (const preferred_move_in of [bad, '2031-02-30', '2031-13-01'].filter(Boolean)) {
      await q('UPDATE inquiries SET ip_address = NULL');
      const res = await api('submit_inquiry.php', { json: { full_name: 'Date Probe', email: `dateprobe${++n}@demo.example`, contact_no: '09171234500', preferred_move_in } });
      expect(res.body.success, preferred_move_in).toBe(false);
    }
  });
});

describe('admin forms', () => {
  it('set_unit_maintenance.php refuses an impossible completion date', async () => {
    await q("INSERT INTO rooms (id, type, floor, monthly_rent, status, occupants) VALUES ('DATE1', 'Studio', '9F', 3000, 'vacant', 0)");
    for (const completionDate of [bad, '2031-02-30', '2031-13-01'].filter(Boolean)) {
      expect((await api('set_unit_maintenance.php', { token: admin, json: { unitId: 'DATE1', completionDate } })).status, completionDate).toBe(422);
    }
    expect((await one("SELECT maintenance_flag, available_date FROM rooms WHERE id = 'DATE1'"))).toEqual({ maintenance_flag: 0, available_date: null });
  });

  it('adjust_invoice.php refuses an impossible due date', async () => {
    await addInvoice('INV-DATE-ADJ', { userId: 2, appId: 1, amount: 1000, status: 'pending' });
    const before = (await one("SELECT due_date FROM invoices WHERE id = 'INV-DATE-ADJ'")).due_date;
    for (const dueDate of [bad, '2031-02-30', 'tomorrow'].filter(Boolean)) {
      const res = await api('adjust_invoice.php', { token: admin, json: { invoiceId: 'INV-DATE-ADJ', dueDate, reason: 'probe' } });
      expect(res.status, dueDate).toBe(422);
    }
    expect((await one("SELECT due_date FROM invoices WHERE id = 'INV-DATE-ADJ'")).due_date).toEqual(before);
  });

  it('update_maintenance_status.php and update_service_status.php refuse an impossible visit date', async () => {
    const mid = (await q("INSERT INTO maintenance_requests (user_id, issue_category, urgency, preferred_date, preferred_time, description, status, room_name) VALUES (2, 'Plumbing', 'Medium', CURDATE(), 'morning', 'visit probe', 'Pending', 'A')")).insertId;
    for (const scheduledDate of [bad, 'tomorrow'].filter(Boolean)) {
      expect((await api('update_maintenance_status.php', { token: admin, json: { id: mid, scheduledDate, scheduledWindow: 'morning' } })).status, scheduledDate).toBe(422);
    }
    expect((await one('SELECT scheduled_date FROM maintenance_requests WHERE id = ?', [mid])).scheduled_date).toBeNull();
  });

  it('create_announcement.php refuses an impossible send time', async () => {
    const res = await api('create_announcement.php', { token: admin, json: { title: 'Date probe', content: 'x', sendTo: 'All Tenants', scheduledAt: bad ? `${bad}T09:00` : '2031-02-30T09:00', action: 'schedule' } });
    expect(res.body?.success).not.toBe(true);
    expect(res.status).toBeLessThan(500);
    expect(await one("SELECT id FROM announcements WHERE title = 'Date probe' AND status = 'scheduled'")).toBeNull();
  });

  it('update_inquiry_status.php does not store a free-text viewing date', async () => {
    const id = (await q("INSERT INTO inquiries (full_name, email, contact_no, status) VALUES ('Viewing Probe', 'viewing.probe@demo.example', '+639171234500', 'New')")).insertId;
    for (const viewing_date of ['tomorrow at noon', '2031-02-30 10:00:00']) {
      const res = await api('update_inquiry_status.php', { token: admin, json: { id, status: 'Scheduled', viewing_date } });
      expect(res.status).toBeLessThan(500);
      const stored = await one('SELECT status, viewing_date FROM inquiries WHERE id = ?', [id]);
      expect(res.body.success === true && stored.viewing_date !== null, `viewing_date=${viewing_date} stored as ${stored.viewing_date}`).toBe(false);
    }
  });

  it('update_tenant_status.php refuses an impossible requested move-out date', async () => {
    const dates = [badFar, 'tomorrow'].filter(Boolean);
    for (const requested_move_out_date of dates) {
      const res = await api('update_tenant_status.php', { token: admin, json: { id: 4, status: 'pending-move-out', requested_move_out_date } });
      expect(res.body?.success, requested_move_out_date).not.toBe(true);
      expect(res.status).toBeLessThan(500);
    }
  });
});
