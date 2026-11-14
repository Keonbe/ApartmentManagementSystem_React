// Invoice fixtures for the webhook and payment tests. Due in 5 days, so the
// overdue sweep (which clears abandoned checkouts) leaves them alone.
import { q, one } from './db.js';

export async function addInvoice(id, { userId = 2, appId = 1, amount = 1500, status = 'processing', sessionId = null, intentId = null } = {}) {
  await q(
    `INSERT INTO invoices (id, user_id, rent_application_id, services, total_amount, billing_period, status, due_date,
                           checkout_session_id, checkout_payment_intent_id, processing_since)
     VALUES (?, ?, ?, ?, ?, 'Test bill', ?, CURDATE() + INTERVAL 5 DAY, ?, ?, ${status === 'processing' ? 'NOW()' : 'NULL'})`,
    [id, userId, appId, amount, amount, status, sessionId, intentId],
  );
}

export const invoice = (id) => one(
  'SELECT status, checkout_session_id, checkout_payment_intent_id, processing_since, paid_at, payment_method FROM invoices WHERE id = ?', [id],
);

// Notifications with this title that name the invoice.
export const notificationCount = async (userId, title, invoiceId) =>
  (await one('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND title = ? AND message LIKE ?', [userId, title, `%${invoiceId}%`])).c;

// A valid emergency contact for rent_application.php forms (required on every
// application). A different number from the demo tenants' own.
export const EMERGENCY_FIELDS = { emergencyName: 'Lorna Navarro', emergencyRelationship: 'Parent', emergencyPhone: '+639189876543' };
