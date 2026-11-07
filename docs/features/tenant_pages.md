# Tenant / User Pages: Current Features

Reference for every page a tenant, applicant or guest sees (`ams-react/src/UserPages/` and the shared shell in `src/Components/`). Re-checked against the code on 2026-11-06. The route table and guards are in `App.jsx`; design reasoning for each area lives in the feature docs linked from [system_design.md](../documentation/system_design.md). User-facing text says "rent", never "lease".

## 1. Routes and guards

| Guard | Rule |
|---|---|
| `ProtectedRoute` | Any signed-in user (tenant or applicant). |
| `TenantProtectedRoute` | Admin, or a user with a rented room. Others go to `/home`; waits for the room check (a page skeleton in the tenant's theme). |
| `ServiceRouteGuard` | Reads `get_system_settings.php` (cached 10 s, cleared on the `system-settings-updated` event); a page skeleton shows meanwhile. A switched-off service redirects to `/services` (or the route's fallback). Admin always passes. An array of keys means any one on is enough. |
| `HomeRoute` | A tenant with a room opening `/home` is sent to `/my-room`. |

| Route | Page | Guard and setting |
|---|---|---|
| `/home`, `/preview`, `/inquire` | Home, Preview, InquiryForm | public |
| `/login`, `/register`, `/reset-password`, `/verify-email` | auth pages | public (`AuthThemeLayout`) |
| `/rent-application`, `/track-application`, `/view-contract`, `/notifications` | RentApplication, TrackApplication, ViewContract, UserNotifications | `ProtectedRoute` |
| `/profile-settings`, `/my-refunds` | ProfileSettings, UserRefunds | `ProtectedRoute`, inside `AccountLayout` |
| `/upload-payment` | PaymentUpload | `ProtectedRoute` + `service_pay_bills_active` (fallback `/pay-bills`) |
| `/my-room`, `/my-requests`, `/announcements`, `/user-utilities`, `/services` | MyRoom, UserMyRequests, UserAnnouncements, UserUtilities, Services | tenant |
| `/payment-history` | UserPaymentHistory | tenant, inside `AccountLayout` |
| `/pay-bills` | PayBills | tenant + `service_pay_bills_active` |
| `/parking-reservation` | ParkingReservation | tenant + `service_parking_active` |
| `/cctv-request` | CctvRequest | tenant + `service_cctv_active` |
| `/maintenance-request` | MaintenanceRequest | tenant + `service_maintenance_active` |
| `/visitor-management` | UserVisitors | tenant + `service_visitor_management_active` |
| `/service-catalog`, `/service-booking` | ServiceCatalog, ServiceBooking | tenant + any of `service_cleaning_active`, `service_laundry_active`, `service_other_active` |
| `*` | NotFound | public |

## 2. Shared shell

- **BaseAppLayout**: TopBar, per-path entrance animation, footer, `BackToTop`. Home is always the Glass theme. Auth pages use `AuthThemeLayout` (no TopBar; floating language and theme switches, Glass shown as Dark).
- **TopBar**: links depend on state (Preview with no room; Track Application when an application exists; My Room, Services and Announcements for tenants). Desktop notification bell with a dropdown, a detail dialog (attachments, "go to page"), payment notices with "View receipt" / "Open Pay Bills", and an application-status modal (approved, action required, rejected). On phones, the notification bell and unread badge sit beside the menu/close control; the drawer profile block has a full-width Settings action and a tinted outlined Sign Out action. Account menu: Profile Settings, theme picker (Light / Dark / Glass), language (English / Filipino), log out. Guests get the EN / FIL switch on the bar (phones: in the menu drawer). Other Settings → **Language** can hide the switch everywhere; the pages then show English (`language_switch_enabled`, `useLanguageSwitch()` in `config/publicSettings.js`, `setEnglishOnly()` in `config/i18n.js`; the visitor's saved choice is kept).
- **AccountLayout**: shared shell for Profile Settings, Payment History and My Refunds. Large screens: side menu with a sticky user card; phones and tablets: a scrollable tab strip. A “Back to My Room” link stays above the shell navigation across account tabs. Payment History shows only for users with a rented room (or an admin).
- **Notifications** (`/notifications`) includes a touch-sized “Back to My Room” breadcrumb above the page heading, aligned with the content column.
- **Page width** (2026-11-08): on desktop (`lg`, 1024 px and up) My Room, Announcements and the service pages (Pay Bills, Parking, Maintenance, CCTV, Visitors, Service catalog and booking, My Requests, Meter readings) are as wide as the Services hub (`lg:max-w-[1400px]`); phones and tablets keep each page's own width.
- **Loading** (2026-11-08): every tenant page shows a skeleton shaped like its content while its data loads, never a spinner or a "Loading…" line. Shared pieces in `Components/tenant/Skeleton.jsx`: `Bone` (a shimmer bar, toned down on Dark and Glass), `SkeletonGroup` (one `role="status"` with a hidden label), and ready-made `SkeletonHeading`, `SkeletonList` (notifications, announcements, requests, readings, documents, house rules), `SkeletonGrid` (rooms, services), `SkeletonForm` and `SkeletonPage` (a whole page: route guards, Track Application, Contract, Service Booking, Service Catalog, payment upload). Home's dark panel uses white-tinted shimmer bars. Spinners remain only on buttons doing something (Submitting…, refresh).
- **BackToTop**: appears after about 1.5 screens of scroll, sits left of the chat button, honours `prefers-reduced-motion`.
- **ChatWidget**: floating launcher with an unread badge on every route except `/login`, `/register` and `/admin-messages`, shown when signed in or when `ams_guest_token` exists. Conversation list and thread, reply-to quotes, photo / video / file attachments (camera supported), viewer, day dividers. Signed-in chat uses `ChatContext` and the Socket.IO sidecar; guest chat uses `guest_chat.php` with the header token and has an "End guest chat" action. See [chat_design.md](chat_design.md).
- Patterns used everywhere: `useFieldErrors` maps server field errors to inputs, `InlineAlert` with retry on load failure, `ConfirmDialog` / `useDialog` (focus trap), `useInvoiceWatch` polling for payment status (PayBills, Payment History, My Room, the bell), English / Filipino through `useLang().t`. Still mostly hardcoded English: My Room, Household panel, House rules card, PayBills banners, Payment History receipt text, Track Application, the sign-in code step and Verify Email.

## 3. Account area

### My Room (`/my-room`)
- Header with welcome and location, followed by a **room key tag** (room, type, floor, rent, rent-until date, status tag). On phones the tag is a centered, miniature vertical luggage tag with its punch-hole and transparent circular room-letter badge; at `md` and wider it retains the full-size vertical tag beside the bill and rent-period cards. The fob follows the theme (2026-11-08): light on Light, deep navy on Dark, frosted indigo on Glass, with light text and tinted status pills on the dark ones. The My Room page reserves bottom safe-area space so its content does not sit behind the fixed chat launcher.
- **Important info panel** ordered urgent, action, in review, good to know: compact rows show icon, title, priority pill and a white-label action button without a redundant panel heading; rent-ending rows include the end date in the title. Overdue bill ("Pay now"; an overdue bill blocks extending), moving out (date, days left), rent ending within 30 days ("Extend rent"), household requests in review.
- **Next bill card** (balance and period, "being confirmed by management", overdue-since, pay button, all-paid-up state) and a **rent term card** (start, end, elapsed percent, days left, Extend shortcut; hidden after move-out).
- Quick tiles: Contract, Utilities & meters, Payment history, My requests.
- **My Requests** (`/my-requests`) has a visible, keyboard-accessible “Back to My Room” link above its title. Contract and Utilities have history-based back controls; Payment History does not yet share this direct-return pattern.
- **Household panel** (`HouseholdPanel.jsx`): seat bar (named, awaiting approval, free), main-tenant card plus a card per member (relationship, age and age category, phone). Pending cards show "Awaiting approval" / "Removal requested", with Withdraw / Remove confirmations. "Add a member" is disabled when full; the dialog validates name, relationship, optional PH mobile and age (0-120; a Child needs an age of 17 or less; minimum-age and stairs-by-floor rules) and previews the rent rise from the per-person surcharge. The occupant-count change request is also embedded in this card, with its existing validation and monthly-charge preview. Management approves these requests (`household_members.php`, `update_occupants.php`).
- **House rules accordion** (bottom of My Room, after rent management): "House Rules & Policies" expands inline to show all active rules from `house_rules.php?scope=all`, grouped by scope and ordered as configured by the admin, with titles, descriptions, loading and empty states. Hidden after move-out; no modal is used on My Room.
- **Manage your rent** (immediately after Household; hidden after move-out): the *Extend Rent Term* accordion displays and validates the live extension range calculated by `my_room.php` from rent policy and the current rent end; it is blocked with the reason and a Pay Bills button when a bill is overdue (`extend_lease.php`). It sits with the red *Ending your rent* card. "End rent" asks for a move-out date inside the notice window (`record_move_out.php`); after move-out the security-deposit deductions are listed.
- Endpoints: `my_room.php`, `household_members.php`, `update_occupants.php`, `extend_lease.php`, `record_move_out.php`, `get_invoices.php`.

### Profile Settings (`/profile-settings`)
First, middle, last, suffix, gender, PH phone; email is read-only. Avatar dialog (upload, camera, delete). A sticky Discard / Save bar appears when the form is dirty, then a success modal. "Verification documents" (`get_documents.php`) and "Account security" (`change_password.php`) open dialogs. Saving fires `PROFILE_UPDATED_EVENT` so the TopBar and side menu refresh. Endpoint: `profile.php`.

### Payment History (`/payment-history`)
Skeleton while `get_invoices.php` loads, then the sections rise in (`.page-enter`). Open bills first ("To pay", Pay Now), paid bills grouped by year, then cancelled bills in a collapsible with a turning chevron (`Components/tenant/Collapsible.jsx`, also My Requests' closed list). Status badges (pending verification, scheduled, processing, failed, overdue, cancelled, unpaid), days overdue, bundled payments (`BND-`) listed once with one combined receipt. Receipt dialog with the full breakdown (rent, deposit, water, electricity, parking, add-ons, maintenance, late fee), split-payment transactions, reference, proof link, print, "paid from advance credit". A "Payment confirmed" notice with "View receipt" appears when a payment is confirmed. Endpoint: `get_invoices.php`.

### My Refunds (`/my-refunds`)
Skeleton for the form and the list while `get_refund_requests.php` loads; cards fade in one after another. New request (advance rent, or overpayment per eligible invoice; amount 0.01 up to the maximum; reason up to 1000). The list shows type, amount, number, status, an event trail, payout details when Refunded and the decision reason when Rejected; requests opened by management are marked. "Info Requested" has a reply box; Pending Review / Info Requested can be cancelled. Also lists refunds raised automatically (rejected application, rejected charge, online payment). Endpoints: `get_refund_requests.php`, `create_refund_request.php`, `respond_refund_request.php`.

## 4. Billing

### Pay Bills (`/pay-bills`)
- Two columns on large screens (statement left, how-to-pay right); header links to Meter Readings and Payment History.
- The payment-method Step 1 uses a compact accessible dropdown (outside click and Escape close it) instead of stacked method cards; selecting an option updates its payment flow. The header includes a direct “Back to My Room” breadcrumb.
- Banners: awaiting verification, scheduled, online processing, proof returned (with reason), online payment failed, overdue / due today, application cancelled, all paid up, and gateway return messages (a cancelled checkout calls `release_checkout_session.php`).
- Statement: total or balance, period, due chip, line items (rent, deposit, water, electricity, parking, services, maintenance, late fee) and an instalment progress bar.
- **Pay all together** (bundle) when an overdue bill sits beside other unpaid ones (`bundle_payment.php`); **pay in advance** with a months preview (`advance_payment.php`).
- Methods from `get_payment_channels.php`: manual (GCash / bank, reference and proof through `upload_payment_proof.php` + `pay_bill.php`), in person (`schedule_payment.php`, date within 60 days, morning / afternoon), online PayMongo checkout (`create_checkout_session.php`), **split payment** (`submit_split_payment.php`, each non-cash portion with its own reference and proof), partial amounts capped at the balance, and a QR Ph modal.

### Payment proof (`/upload-payment`)
Stand-alone proof upload (sender name, reference checked per method, proof image, bank list); the bill arrives as navigation state kept in sessionStorage. Blocks submit if the channel was switched off.

### Meter readings (`/user-utilities`)
 Averages across cycles; per cycle the water and electricity previous / present readings, usage, amounts, other fees and subtotal (or total-only), other utilities, admin note, trend arrow and "unusually high" flag, billed status. Cycle cards omit the redundant room badge, show a styled paid status, and present offline proof upload as a text action in a transparent, right-aligned footer. The total subtotal uses the shared theme-remapped white/slate surface and indigo amount colors, avoiding OS-preference-only dark variants. A tenant can upload proof for a utility bill paid outside the app. The header has a direct “Back to My Room” breadcrumb above the title and keeps “Go to Pay Bills” as its sole, vertically centered action button. Endpoints: `get_utility_readings.php`, `upload_payment_proof.php`.

## 5. Services

- **Services hub** (`/services`): touch-sized “Back to My Room” breadcrumb above the heading, aligned with the page content and search; cards from `config/serviceHubCards.js` (pay bills, parking, maintenance, CCTV, visitors, add-ons, my requests; Announcements is a TopBar link since 2026-11-06, and the admin Services page no longer lists it either); a card shows only when its setting is on, with the admin-chosen colour and icon; live search.
- **Service catalog** (`/service-catalog`): active services grouped by admin categories (`get_service_categories.php`, EN / FIL), price and unit, quantity range, lead time, Book button.
- **Service booking** (`/service-booking`): category-grouped select, quantity (whole or 2 decimals, min / max), date from today plus lead time, morning / afternoon slot with a "Full" state from `get_service_availability.php` (`max_per_slot`), notes, optional attachment (10 MB), estimated total. Posts `service_request.php`.
- **Maintenance request** (`/maintenance-request`): “Back to Services” breadcrumb above the heading, then category, preferred date (today to +14 days) and window, description (10+), optional photo or video. Scheduling, progress, cancel and "not fixed" happen in My Requests.
- **My Requests** (`/my-requests`): one list for maintenance, CCTV, parking and service requests, Active plus a collapsible Closed section. Shows assigned person, **scheduled visit**, cost or price change (booked vs final), cancel-requested state and reasons. Actions: cancel a Pending item; request cancel on an In Progress ticket or a not-free service (free = Approved and the visit is more than 24 h away); **Not fixed** reopens a Completed ticket with a reason; rate a Completed service 1-5 once (14 days); Book again. CCTV shows pickup text or the footage link with its expiry. Endpoints: `get_my_requests.php`, `cancel_request.php`, `reopen_maintenance_request.php`, `rate_service_request.php`.
- **CCTV request** (`/cctv-request`): “Back to Services” breadcrumb above the title; incident type, date (within the lookback, default 60 days), 4-hour time window, location (admin list), reason (minimum length, longer for "other"), required privacy consent. Admin choices live in Settings → CCTV.
- **Parking** (`/parking-reservation`): “Back to Services” breadcrumb above the title; availability and monthly fee, vehicle type (admin list), model, PH plate, transmission, duration, required OR/CR document, parking-rules checkbox.
- **Visitors** (`/visitor-management`): animated, touch-sized “Back to Services” chevron breadcrumb; pre-register a visitor (name, contact, purpose, arrival and departure within 30 days, ID type and number, optional plate and ID photo); sections Active, Pending verification and the full log with status chips (pending, active, overstayed, departed, declined, cancelled); mark departed, cancel registration.
- **Announcements** (`/announcements`): "N new" banner, per-user seen marker, type filter (All, Urgent, Reminder, General), a **Pinned** section on top (up to 3, set by admin), the rest grouped by month, auto-linked text, PDF or image attachment.
- **Notifications** (`/notifications`): tabs All, Unread, Billing, Requests, Rent, Announcements, Archived; search, mark all read, archive (all or one), detail dialog, per-category channel preferences.

## 6. Application and contract

- **Rent application** (`/rent-application`): locked identity fields, occupants (up to `maxOccupantsPerUnit`), months (minimum from settings, max 24), preferred move-in date inside the settings window or ASAP, previous address, room picker with "taken" check and rent preview, dynamic document list (`get_application_requirements.php`, files already on record are reused), terms and house-rules checkboxes. Draft saved to localStorage; a rejected application can be corrected and resent.
- **Track application** (`/track-application`): stepper (submitted, review, sign contract, pay move-in bill, move-in day, moved in) and status chip. *Action required* asks for a new move-in date (`resubmit_date.php`); *Rejected* shows the reason and a fix-and-resubmit path; contract step to view / print and upload the signed PDF (5 MB); payment step for one month advance plus the security deposit by online, manual or cash; cancel with a reason (a paid application is refunded by management).
- **View contract** (`/view-contract`): admin-editable template filled with the tenant's data, Tagalog / English toggle, print or save as PDF, draft notice, signature add and remove (`upload_lease_document.php`).

## 7. Public and auth pages

- **Home** (`/home`): public landing, Glass theme (the backdrop photo, a left-side darkening fixed behind the whole screen so the see-through TopBar matches, and a dark blurred panel; phones keep the photo as bright as desktop); **Preview** (`/preview`): Available / Upcoming rooms, sort, room modal, house rules.
- **Inquiry** (`/inquire`): public; a signed-out sender gets a guest chat (`ams_guest_token`); a repeat inquiry resumes the earlier thread, with an e-mailed one-time link (`guest_chat_resume.php`), asked for in a "Continue your conversation" box with a turning chevron. Sections rise in; the house rules (and the unit list) show a skeleton while they load; on phones the rules are a collapsible card. Number of occupants is kept between 1 and Settings → Rental → Maximum Occupants per Unit as it is typed (as on the application), with "4 included in the rent + 2 more at ₱1,000/month each (max 6)" from the occupancy settings (`utils/occupancy.js`, also on the application and My Room) and the move-in date to today through `inquiry_move_in_max_months` (default 6) ahead; both limits show under the fields and the server checks them too.
- **Login**: password step, lockout message, forgot-password mode, and the **sign-in code step** (six boxes, paste, autofill) when `login.php` returns `device_verification_required`. A device that passed is remembered by a 1-year cookie. Admins, `demo.example` accounts (non-production) and accounts whose sign-in code is switched off skip it. Landing: tenant to My Room, applicant to Track Application, else Home.
- **Registration**: names, e-mail, password with confirmation, terms; sends a verification e-mail. **Verify e-mail** (`?token=`) and **Reset password** (`?token=`, checklist, redirect to login after 2 s).

Last updated 2026-11-06.
