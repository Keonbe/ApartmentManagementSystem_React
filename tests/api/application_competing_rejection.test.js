import { describe, it, expect, beforeAll } from 'vitest';
import { api, login, loginAs } from './lib/api.js';
import { one, q } from './lib/db.js';

let admin, lita;

beforeAll(async () => {
  [admin, lita] = await Promise.all([
    loginAs('admin'),
    login('lita.ramos@demo.example', 'tenant123'),
  ]);
});

describe('approval resolves competing applications for the same unit', () => {
  it('keeps applicants pending on approval, blocks a second approval, then rejects and notifies on move-in', async () => {
    // Gloria's pending application is the winner; turn Lita's seeded application
    // into a second pending applicant for the same vacant unit.
    await q("UPDATE rooms SET status = 'vacant', tenant_name = NULL, lease_start = NULL, lease_end = NULL, occupants = 0 WHERE id IN ('E', 'N')");
    await q("UPDATE rent_applications SET status = 'Pending Review', room_name = 'N', move_in_date = NULL, move_in_notified_at = NULL WHERE id = 5");
    await q('UPDATE rent_applications SET terms_agreed_at = NOW() WHERE id = 6');
    await q('UPDATE rent_applications SET terms_agreed_at = NOW() WHERE id = 5');
    await q('UPDATE application_requirements SET is_active = 0');
    const settings = await api('update_system_settings.php', { token: admin, json: {
      application_default_statuses: '["pending","approved"]',
      application_unit_rejection_message: 'Hello {{name}}, Unit {{unit}} has been assigned.',
    } });
    expect(settings.status).toBe(200);
    expect(settings.body.success).toBe(true);

    const res = await api('update_tenant_status.php', { token: admin, json: { id: 6, status: 'Approved' } });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.auto_rejected_applications).toBeUndefined();
    expect((await one('SELECT status FROM rent_applications WHERE id = 5')).status).toBe('Pending Review');

    const secondApproval = await api('update_tenant_status.php', { token: admin, json: { id: 5, status: 'Approved' } });
    expect(secondApproval.body.success).toBe(false);
    expect(secondApproval.body.message).toMatch(/already held by another approved application/);
    expect((await one('SELECT status FROM rent_applications WHERE id = 5')).status).toBe('Pending Review');

    await q("UPDATE invoices SET status = 'paid', amount_paid = total_amount WHERE rent_application_id = 6");
    await q('UPDATE rent_applications SET move_in_date = CURDATE(), move_in_notified_at = NOW() WHERE id = 6');
    const moveIn = await api('update_tenant_status.php', { token: admin, json: { id: 6, status: 'active' } });
    expect(moveIn.body).toMatchObject({ success: true, auto_rejected_applications: 1 });
    expect(await one('SELECT status, rejection_reason FROM rent_applications WHERE id = 5')).toMatchObject({
      status: 'Rejected', rejection_reason: 'Unit assigned to another applicant.',
    });
    const rejectedApplicant = await one('SELECT user_id FROM rent_applications WHERE id = 5');
    expect(await one("SELECT title, message FROM notifications WHERE user_id = ? AND title = 'Application Rejected' ORDER BY id DESC LIMIT 1", [rejectedApplicant.user_id])).toMatchObject({
      title: 'Application Rejected', message: expect.stringContaining('Hello Lita Ramos, Unit N has been assigned.'),
    });

    const resubmitForm = new FormData();
    resubmitForm.append('appId', '5');
    resubmitForm.append('roomName', 'N');
    const resubmitSameUnit = await api('rent_application.php', { token: lita, form: resubmitForm });
    expect(resubmitSameUnit.status).toBe(409);
    expect(resubmitSameUnit.body.message).toMatch(/choose a different available unit/i);
    expect((await one('SELECT status, room_name FROM rent_applications WHERE id = 5')).status).toBe('Rejected');

    const newApplicationSameUnit = new FormData();
    newApplicationSameUnit.append('roomName', 'N');
    const applyAgainToSameUnit = await api('rent_application.php', { token: lita, form: newApplicationSameUnit });
    expect(applyAgainToSameUnit.status).toBe(409);
    expect(applyAgainToSameUnit.body.message).toMatch(/choose a different available unit/i);
  });
});
