import { describe, it, expect } from 'vitest';
import { invoiceOwed } from './invoiceBalance';

describe('invoiceOwed', () => {
  it('returns 0 for a missing invoice', () => {
    expect(invoiceOwed(null)).toBe(0);
    expect(invoiceOwed(undefined)).toBe(0);
  });

  it("prefers the server's balance over total less paid", () => {
    expect(invoiceOwed({ balance: '250.50', total_amount: '1000', amount_paid: '0' })).toBe(250.5);
  });

  it('keeps a server balance of 0 (does not fall back to the total)', () => {
    expect(invoiceOwed({ balance: '0.00', total_amount: '1000', amount_paid: '0' })).toBe(0);
    expect(invoiceOwed({ balance: 0, total_amount: '1000', amount_paid: '0' })).toBe(0);
  });

  it('falls back to total less amount paid when no balance is sent', () => {
    expect(invoiceOwed({ total_amount: '12000.00', amount_paid: '5000.00' })).toBe(7000);
  });

  it('is 0 when fully paid and never negative on overpayment', () => {
    expect(invoiceOwed({ total_amount: '10000', amount_paid: '10000' })).toBe(0);
    expect(invoiceOwed({ total_amount: '100', amount_paid: '150' })).toBe(0);
    expect(invoiceOwed({ balance: '-20' })).toBe(0);
  });

  it('treats missing or junk amounts as 0 and rounds to cents', () => {
    expect(invoiceOwed({})).toBe(0);
    expect(invoiceOwed({ total_amount: 'abc', amount_paid: null })).toBe(0);
    expect(invoiceOwed({ total_amount: '0.3', amount_paid: '0.1' })).toBe(0.2);
  });
});
