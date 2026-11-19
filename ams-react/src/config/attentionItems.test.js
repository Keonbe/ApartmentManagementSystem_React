import { describe, it, expect } from 'vitest';
import { ATTENTION_GROUPS, attentionLine, navAttention } from './attentionItems';

describe('navAttention', () => {
  it('adds up the red and amber lines per page, with their wording', () => {
    const badges = navAttention({
      applications_to_review: 2, move_in_due: 1,
      proofs_to_verify: 3, overdue_tenants: 1, overdue_invoices: 2,
      maintenance_urgent: 1, maintenance_triage: 0,
    });
    expect(badges['/admin-applications']).toEqual({
      count: 3, lines: ['2 applications to review', '1 approved tenant not moved in yet'],
    });
    expect(badges['/admin-payments'].count).toBe(4);
    expect(badges['/admin-payments'].lines).toContain('1 tenant overdue (2 bills)');
    expect(badges['/admin-maintenance']).toEqual({ count: 1, lines: ['1 urgent maintenance request'] });
  });

  it('leaves out lines for information only, zeros and pages with nothing', () => {
    const badges = navAttention({ cash_visits: 4, readings_to_invoice: 2, contracts_draft: 1, contracts_ending: 3, new_inquiries: 0 });
    expect(badges).toEqual({});
  });

  it('copes with no answer yet and with missing or non-numeric counts', () => {
    expect(navAttention(null)).toEqual({});
    expect(navAttention({ refunds_to_review: '2', parking_requests: undefined, incomplete: true })).toEqual({
      '/admin-refunds': { count: 2, lines: ['2 refund requests to review'] },
    });
  });

  it('points every line at a page path', () => {
    for (const g of ATTENTION_GROUPS) {
      for (const item of g.items) {
        expect(item.to.startsWith('/admin-')).toBe(true);
        expect(typeof attentionLine(item, { [item.key]: 1, overdue_invoices: 1 })).toBe('string');
      }
    }
  });
});
