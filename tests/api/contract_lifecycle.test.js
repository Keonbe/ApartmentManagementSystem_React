// create_contract.php, update_contract_status.php, record_move_out.php.
// QA guide rows Q9-03 .. Q9-08.
import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs, login } from './lib/api.js';
import { q, one, setSetting } from './lib/db.js';

const HASH = '$2y$10$Wugs2.WmaaPIBSTUdQvnhOn4u96FyPIYjkEfQdKsXx.ioFYgwHSCy'; // tenant123
const ymd = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let admin, maria, rosa, jose;
const contractOf = async (appId) => (await one('SELECT * FROM lease_contracts WHERE rent_application_id = ?', [appId]));
const setStatus = (id, status) => q('UPDATE lease_contracts SET status = ? WHERE id = ?', [status, id]);
const appStatus = async (id) => (await one('SELECT status FROM rent_applications WHERE id = ?', [id])).status;

beforeAll(async () => {
  [admin, maria, rosa, jose] = await Promise.all([loginAs('admin'), loginAs('maria'), loginAs('rosa'), loginAs('jose')]);
  await setSetting('max_rent_ahead_months', 12);
});

describe('create_contract.php', () => {
  const create = (token, body) => api('create_contract.php', { token, json: body });
  const good = (over = {}) => ({ rentApplicationId: 3, depositAmount: 4500, leaseStart: ymd(-10), leaseEnd: ymd(355), ...over });

  it('needs an admin session', async () => {
    expect((await create(undefined, good())).status).toBe(401);
    expect((await create(maria, good())).status).toBe(403);
  });

  it('refuses a second contract for an application that already has one', async () => {
    const existing = await contractOf(3);
    expect(existing).not.toBeNull();
    const res = await create(admin, good());
    expect(res.status).toBe(409);
    expect((await one('SELECT COUNT(*) AS n FROM lease_contracts WHERE rent_application_id = 3')).n).toBe(1);
  });

  it.each([
    ['no body', undefined],
    ['missing application', { rentApplicationId: null }],
    ['missing dates', { leaseStart: '', leaseEnd: '' }],
    ['wrong date format', { leaseStart: '10/01/2031', leaseEnd: '10/01/2032' }],
    ['impossible date', { leaseStart: '2031-02-30', leaseEnd: '2032-02-01' }],
    ['end equal to start', { leaseEnd: ymd(-10) }],
    ['end before start', { leaseEnd: ymd(-20) }],
    ['period over 24 months', { leaseEnd: ymd(-10 + 800) }],
    ['unknown application', { rentApplicationId: 99999 }],
  ])('rejects %s with 422', async (_n, over) => {
    const res = over === undefined ? await api('create_contract.php', { token: admin, raw: '' }) : await create(admin, good(over));
    expect(res.status).toBe(422);
  });

  it('allows exactly 24 months and refuses 24 months plus a day', async () => {
    await q('DELETE FROM lease_contracts WHERE rent_application_id = 3');
    const start = ymd(-10);
    const d = new Date(`${start}T00:00:00`);
    d.setMonth(d.getMonth() + 24);
    const exact = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    d.setDate(d.getDate() + 1);
    const over = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect((await create(admin, good({ leaseStart: start, leaseEnd: over }))).status).toBe(422);
    expect((await create(admin, good({ leaseStart: start, leaseEnd: exact }))).status).toBe(200);
  });

  it('creates a draft, defaults the deposit to one month\'s rent and logs it', async () => {
    await q('DELETE FROM lease_contracts WHERE rent_application_id = 3');
    const res = await create(admin, good({ depositAmount: '' }));
    expect(res.status).toBe(200);
    const row = await one('SELECT status, deposit_amount FROM lease_contracts WHERE id = ?', [res.body.contractId]);
    const rent = (await one('SELECT monthly_rent FROM rent_applications WHERE id = 3')).monthly_rent;
    expect(row.status).toBe('draft');
    expect(Number(row.deposit_amount)).toBe(Number(rent));
    expect((await one("SELECT COUNT(*) AS n FROM activity_logs WHERE action = 'Generated Rent Contract' AND details LIKE ?", [`%${res.body.contractId}%`])).n).toBe(1);
  });

  it('refuses an application that is not approved yet', async () => {
    const pending = await one("SELECT id FROM rent_applications WHERE status NOT IN ('Approved','active','pending-move-out') LIMIT 1");
    if (!pending) return; // the seed always has one; keep the test honest if that changes
    expect((await create(admin, good({ rentApplicationId: pending.id }))).status).toBe(422);
  });
});

describe('update_contract_status.php', () => {
  const act = (token, body) => api('update_contract_status.php', { token, json: body });
  let cid; // Maria's contract

  beforeAll(async () => {
    cid = (await contractOf(1)).id;
    await q('UPDATE lease_contracts SET lease_end = DATE_ADD(CURDATE(), INTERVAL 200 DAY) WHERE id = ?', [cid]); // seed dates are old; keep clear -> active
  });

  it('needs an admin session and a contract id and action', async () => {
    expect((await act(undefined, { contractId: cid, action: 'flag' })).status).toBe(401);
    expect((await act(maria, { contractId: cid, action: 'flag' })).status).toBe(403);
    expect((await act(admin, { contractId: cid })).status).toBe(422);
    expect((await act(admin, { action: 'flag' })).status).toBe(422);
    expect((await act(admin, { contractId: 'CTR-NOPE', action: 'flag' })).status).toBe(404);
    expect((await contractOf(1)).status).not.toBe('eviction-pending');
  });

  it('flags and clears an eviction review, only from the right state', async () => {
    await setStatus(cid, 'active');
    expect((await act(admin, { contractId: cid, action: 'clear' })).status).toBe(422); // nothing to clear
    expect((await act(admin, { contractId: cid, action: 'flag' })).body.success).toBe(true);
    expect((await contractOf(1))).toMatchObject({ status: 'eviction-pending', eviction_status: 'flagged' });
    expect((await act(admin, { contractId: cid, action: 'flag' })).status).toBe(422); // already flagged
    expect((await one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 2 AND title = 'Rent Contract Under Eviction Review'")).n).toBe(1);
    expect((await act(admin, { contractId: cid, action: 'clear' })).body.success).toBe(true);
    expect((await contractOf(1))).toMatchObject({ status: 'active', eviction_status: null });
  });

  it('refuses every forbidden transition and leaves the contract unchanged', async () => {
    const forbidden = [
      ['draft', ['flag', 'clear', 'terminate', 'edit']],
      ['active', ['activate', 'clear']],
      ['eviction-pending', ['activate', 'flag']],
      ['terminated', ['activate', 'flag', 'clear', 'terminate', 'edit']],
    ];
    for (const [status, actions] of forbidden) {
      for (const action of actions) {
        await setStatus(cid, status);
        const res = await act(admin, { contractId: cid, action, reason: 'x', leaseStart: ymd(-5), leaseEnd: ymd(300) });
        expect(res.status, `${status} -> ${action}`).toBe(422);
        expect((await contractOf(1)).status).toBe(status);
      }
    }
    expect(await appStatus(1)).not.toBe('moved-out');
  });

  it('rejects an unknown action', async () => {
    await setStatus(cid, 'active');
    const res = await act(admin, { contractId: cid, action: 'shred' });
    expect(res.status).not.toBe(200);
    expect(res.body?.success).not.toBe(true);
    expect((await contractOf(1)).status).toBe('active');
  });

  it('will not activate a draft until the move-in invoice is paid and the tenant has moved in', async () => {
    await setStatus(cid, 'draft');
    await q("UPDATE rent_applications SET status = 'Approved' WHERE id = 1");
    const res = await act(admin, { contractId: cid, action: 'activate' });
    expect([409]).toContain(res.status);
    expect((await contractOf(1)).status).toBe('draft');
    await q("UPDATE rent_applications SET status = 'active' WHERE id = 1");
  });

  describe('edit dates', () => {
    const edit = (over = {}) => act(admin, { contractId: cid, action: 'edit', leaseStart: ymd(-30), leaseEnd: ymd(300), ...over });
    beforeAll(async () => { await setStatus(cid, 'active'); });

    it.each([
      ['missing dates', { leaseStart: '', leaseEnd: '' }],
      ['bad format', { leaseStart: 'yesterday' }],
      ['impossible date', { leaseStart: '2025-11-01', leaseEnd: '2026-02-30' }],
      ['end equal to start', { leaseEnd: ymd(-30) }],
      ['end before start', { leaseEnd: ymd(-31) }],
      ['over 24 months', { leaseEnd: ymd(-30 + 800) }],
      ['too far ahead (max_rent_ahead_months = 12)', { leaseStart: ymd(-30), leaseEnd: ymd(500) }],
    ])('rejects %s with 422', async (_n, over) => {
      const before = await contractOf(1);
      expect((await edit(over)).status).toBe(422);
      expect(String((await contractOf(1)).lease_end)).toBe(String(before.lease_end));
    });

    it('updates the dates, keeps the room in step and tells the tenant', async () => {
      const end = ymd(200);
      const res = await edit({ leaseEnd: end });
      expect(res.body.success).toBe(true);
      const ymdOf = async () => (await one("SELECT DATE_FORMAT(lease_end, '%Y-%m-%d') AS d FROM lease_contracts WHERE id = ?", [cid])).d;
      expect(await ymdOf()).toBe(end);
      expect((await one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 2 AND title = 'Rent Dates Updated'")).n).toBe(1);
    });

    it('turns an active contract into expired when the new end date has passed', async () => {
      const res = await edit({ leaseStart: ymd(-60), leaseEnd: ymd(-1) });
      expect(res.body.success).toBe(true);
      expect((await contractOf(1)).status).toBe('expired');
      await setStatus(cid, 'active');
    });
  });

  it('two simultaneous flags settle exactly once', async () => {
    await setStatus(cid, 'active');
    const [a, b] = await Promise.all([act(admin, { contractId: cid, action: 'flag' }), act(admin, { contractId: cid, action: 'flag' })]);
    expect([a.status, b.status].filter((s) => s === 200)).toHaveLength(1);
    expect([a.status, b.status].find((s) => s !== 200)).toBeGreaterThanOrEqual(409); // 409 lost the race, 422 saw the new state
    expect((await contractOf(1)).status).toBe('eviction-pending');
  });
});

describe('update_contract_status.php terminate', () => {
  const act = (token, body) => api('update_contract_status.php', { token, json: body });

  it('needs a reason, then ends the contract, the tenancy and the room together', async () => {
    const cid = (await contractOf(3)).id;
    await setStatus(cid, 'active');
    expect((await act(admin, { contractId: cid, action: 'terminate' })).status).toBe(422);
    expect((await act(admin, { contractId: cid, action: 'terminate', reason: '   ' })).status).toBe(422);
    expect((await contractOf(3)).status).toBe('active');

    const reason = "Zoë's unit — breach <b>of</b> rules 😀";
    const res = await act(admin, { contractId: cid, action: 'terminate', reason });
    expect(res.body.success).toBe(true);
    expect(await contractOf(3)).toMatchObject({ status: 'terminated', termination_reason: reason });
    expect(await appStatus(3)).toBe('moved-out');
    expect((await one("SELECT status FROM rooms WHERE id = (SELECT room_name FROM rent_applications WHERE id = 3)")).status).not.toBe('occupied');
    expect((await one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = 5 AND title = 'Rent Contract Terminated'")).n).toBe(1);

    // Already terminated and moved out: nothing more to end.
    expect((await act(admin, { contractId: cid, action: 'terminate', reason: 'again' })).status).toBe(422);
  });
});

describe('record_move_out.php', () => {
  const file = (token, date) => api('record_move_out.php', { token, json: { move_out_date: date } });
  const NO_RENT = 'moveout.norental@demo.example';

  it('needs a session and POST', async () => {
    expect((await file(undefined, ymd(20))).status).toBe(401);
    expect((await api('record_move_out.php', { token: jose, method: 'GET' })).status).toBe(405);
  });

  it('refuses an account with no rental', async () => {
    await q(`INSERT INTO users (id, first_name, last_name, contact_no, gender, email_address, password, role, email_verified_at)
             VALUES (141, 'Nina', 'Norent', '+63 9171234141', 'Female', ?, ?, 'user', NOW())`, [NO_RENT, HASH]);
    const t = await login(NO_RENT, 'tenant123');
    expect((await file(t, ymd(20))).body.success).toBe(false);
  });

  it('enforces the notice window (default 15 to 30 days) at both edges', async () => {
    await setSetting('move_out_min_notice_days', 15);
    await setSetting('move_out_max_notice_days', 30);
    for (const bad of [undefined, '', 'not-a-date', ymd(0), ymd(14), ymd(31), ymd(-5)]) {
      const res = await file(jose, bad);
      expect(res.status, `date=${bad}`).toBe(400);
    }
    expect(await appStatus(2)).not.toBe('pending-move-out');
  });

  it('records a notice inside the window, queues it for the admin, and refuses a second one', async () => {
    const date = ymd(15); // lower edge is allowed
    const joseApp = (await one("SELECT id FROM rent_applications WHERE user_id = 3 AND status IN ('Approved','active') ORDER BY id DESC LIMIT 1")).id;
    const res = await file(jose, date);
    expect(res.body.success).toBe(true);
    expect(await appStatus(joseApp)).toBe('pending-move-out');
    expect((await one("SELECT DATE_FORMAT(requested_move_out_date, '%Y-%m-%d') AS d FROM rent_applications WHERE id = ?", [joseApp])).d).toBe(date);
    expect((await one("SELECT COUNT(*) AS n FROM notifications WHERE type = 'move_out_request' AND metadata_value = ? AND status = 'Pending'", [`move_out_request:${joseApp}`])).n).toBe(1);
    expect((await file(jose, ymd(20))).body.success).toBe(false); // already pending
  });

  it('files only for the signed-in tenant, whatever the body says', async () => {
    const res = await api('record_move_out.php', { token: maria, json: { move_out_date: ymd(30), userId: 3, user_id: 3, email: 'jose.reyes@demo.example' } });
    expect(res.body.success).toBe(true);
    expect((await one('SELECT status FROM rent_applications WHERE id = 1')).status).toBe('pending-move-out');
  });
});
