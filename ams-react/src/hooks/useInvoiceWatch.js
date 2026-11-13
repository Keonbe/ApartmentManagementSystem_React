import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/axiosConfig';
import { TENANT_NOTIFICATIONS_EVENT } from '../config/notificationLinks';

// Invoice states, as the tenant sees them. "Awaiting" means the tenant has
// acted and management (or the gateway) has not answered yet; "payable" means
// the tenant still has to pay. Together they are BILLING_OPEN_STATUSES.
export const AWAITING_STATUSES = ['pending-verification', 'processing', 'scheduled'];
export const PAYABLE_STATUSES = ['pending', 'unpaid', 'overdue', 'payment-failed'];
export const OPEN_STATUSES = [...PAYABLE_STATUSES, ...AWAITING_STATUSES];

// Faster than the 60 s bell poll, and only while something is awaiting a decision.
const WATCH_POLL_MS = 20000;

// The tenant's invoices, kept fresh so an admin's decision reaches the page
// without a reload. Re-fetches whenever the notification bell changes, and
// polls while any invoice is awaiting confirmation. onTransition receives the
// changes seen between two fetches:
//   { type: 'confirmed', invoice }  awaiting → paid
//   { type: 'rejected',  invoice }  proof sent back (reason on the invoice)
//   { type: 'failed',    invoice }  online checkout declined
// onFirstLoad receives the first list fetched (no transitions can be seen yet).
export default function useInvoiceWatch({ onTransition, onFirstLoad } = {}) {
  const [invoices, setInvoices] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // The last fetch failed: an empty list then means "unknown", not "nothing owed".
  const [loadError, setLoadError] = useState(false);
  const previous = useRef(null); // Map of invoice id → status from the last fetch
  const onTransitionRef = useRef(onTransition);
  const onFirstLoadRef = useRef(onFirstLoad);

  useEffect(() => {
    onTransitionRef.current = onTransition;
    onFirstLoadRef.current = onFirstLoad;
  });

  const refresh = useCallback(async () => {
    const user = JSON.parse(sessionStorage.getItem('loggedInUser') || '{}');
    if (!user.id) return;
    try {
      const res = await api.get(`/get_invoices.php?userId=${user.id}`);
      if (!res.data.success) { setLoadError(true); return; }
      const list = res.data.invoices || [];

      const before = previous.current;
      if (before) {
        const events = [];
        list.forEach((invoice) => {
          const was = before.get(invoice.id);
          if (!was || was === invoice.status) return;
          if (invoice.status === 'paid' && AWAITING_STATUSES.includes(was)) {
            events.push({ type: 'confirmed', invoice });
          } else if (was === 'pending-verification' && PAYABLE_STATUSES.includes(invoice.status) && invoice.proof_rejection_reason) {
            events.push({ type: 'rejected', invoice });
          } else if (was === 'processing' && invoice.status === 'payment-failed') {
            events.push({ type: 'failed', invoice });
          }
        });
        if (events.length > 0) onTransitionRef.current?.(events);
      } else {
        onFirstLoadRef.current?.(list);
      }

      previous.current = new Map(list.map((invoice) => [invoice.id, invoice.status]));
      setInvoices(list);
      setLoadError(false);
    } catch (err) {
      console.error('Failed to load invoices:', err);
      setLoadError(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  const watching = invoices.some((invoice) => AWAITING_STATUSES.includes(invoice.status));

  useEffect(() => {
    const load = async () => { await refresh(); };
    load();
    window.addEventListener(TENANT_NOTIFICATIONS_EVENT, refresh);
    return () => window.removeEventListener(TENANT_NOTIFICATIONS_EVENT, refresh);
  }, [refresh]);

  useEffect(() => {
    if (!watching) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, WATCH_POLL_MS);
    return () => clearInterval(timer);
  }, [watching, refresh]);

  return { invoices, loaded, loadError, refresh, watching };
}
