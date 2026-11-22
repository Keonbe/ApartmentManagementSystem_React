import { describe, it, expect } from 'vitest';
import { applicationSteps } from './applicationSteps';

// The office's check of the signed contract (signed_lease_review) and the steps it opens.
const stateOf = (app) => Object.fromEntries(applicationSteps(app).map((s) => [s.key, s.state]));
const approved = { status: 'Approved', created_at: '2026-11-01 10:00:00', monthly_rent: 4000 };

describe('applicationSteps: the signed contract', () => {
  it('a copy waiting for the check, or accepted, moves the tenant on to the payment', () => {
    for (const review of ['pending', 'accepted', null]) {
      const s = stateOf({ ...approved, signed_lease_path: 'uploads/documents/a.jpg', signed_lease_review: review });
      expect(s.contract).toBe('done');
      expect(s.payment).toBe('current');
    }
  });

  it('a copy sent back reopens the contract step with the reason in the note', () => {
    const app = { ...approved, signed_lease_path: 'uploads/documents/a.jpg', signed_lease_review: 'rejected' };
    expect(stateOf(app)).toMatchObject({ contract: 'current', payment: 'upcoming' });
    const step = applicationSteps(app).find((x) => x.key === 'contract');
    expect(step.note).toMatch(/new copy/);
  });

  it('a payment already started stays open when the copy is sent back', () => {
    const s = stateOf({ ...approved, signed_lease_path: 'uploads/documents/a.jpg', signed_lease_review: 'rejected', pending_amount_paid: 2000 });
    expect(s.payment).toBe('current');
  });
});
