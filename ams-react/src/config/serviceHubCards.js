// The cards on the tenant Services page (UserPages/Services.jsx), in display order.
// The admin "Customize Service Appearance" preview (Components/ServiceAppearanceModal.jsx)
// reads the same list, so its preview shows the tenant's real title, text, tag and button.
//   key      system setting that hides the card when off (null = always shown)
//   i18n     prefix of the `.title` / `.desc` / `.btn` keys in config/i18n.js
//   tagKey   i18n key of the category tag (the add-ons card shows a live count instead)
export const SERVICE_HUB_CARDS = [
    { id: 'pay-bills', key: 'service_pay_bills_active', i18n: 'services.billPayments', path: '/pay-bills', tagKey: 'services.tag.billing' },
    { id: 'parking', key: 'service_parking_active', i18n: 'services.parking', path: '/parking-reservation', tagKey: 'services.tag.parking' },
    { id: 'maintenance', key: 'service_maintenance_active', i18n: 'services.maintenance', path: '/maintenance-request', tagKey: 'services.tag.repairs' },
    { id: 'cctv', key: 'service_cctv_active', i18n: 'services.cctv', path: '/cctv-request', tagKey: 'services.tag.security' },
    { id: 'visitor-management', key: 'service_visitor_management_active', i18n: 'services.visitors', path: '/visitor-management', tagKey: 'services.tag.access' },
    { id: 'addons', key: null, i18n: 'services.addons', path: '/service-catalog', tagKey: 'services.tag.addons' },
    { id: 'my-requests', key: null, i18n: 'services.myRequests', path: '/my-requests', tagKey: 'services.tag.tracking' },
    // Payment History is in the account area (Profile Settings side menu) and
    // Announcements is a TopBar link, so neither is a card here.
];

export const SERVICE_HUB_CARD_BY_ID = Object.fromEntries(SERVICE_HUB_CARDS.map((c) => [c.id, c]));
