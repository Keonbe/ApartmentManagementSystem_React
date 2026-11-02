// What is still owed on an invoice: the server's `balance` (get_invoices.php,
// total less parts received, 0 once the bill is closed). Rows from an endpoint
// that sends no balance fall back to total less parts. Mirrors
// invoice_balance_cents() in backend/config.php.
export const invoiceOwed = (inv) => {
  if (!inv) return 0;
  const balance = parseFloat(inv.balance);
  if (Number.isFinite(balance)) return Math.max(0, balance);
  const total = parseFloat(inv.total_amount) || 0;
  const paid = parseFloat(inv.amount_paid) || 0;
  return Math.max(0, Math.round((total - paid) * 100) / 100);
};
