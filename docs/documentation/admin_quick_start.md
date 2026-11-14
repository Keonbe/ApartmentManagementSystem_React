# AMS Admin Quick Start

**For:** the property manager or office staff who run the system day to day.
**Time to read:** about 10 minutes. This is a short guide, not the full manual; the details of each area are in the documents linked at the end.
**Written:** 2026-11-13, from the pages and rules in the current build.

---

## 1. Signing in and the first-day checks

1. Open the site and sign in with the admin account. **Change the default password straight away** (Other Settings, then the account section). Never keep the password that came with the install.
2. Open **Other Settings** once and look at: building name, payment options (GCash, bank, QR), the notice period for move-out, and which services are switched on. The sidebar hides a service that is switched off.
3. Make sure the daily jobs run on the server (the operator sets this up, see [backup_and_restore.md](../deployment/backup_and_restore.md) and [environment_config.md](../deployment/environment_config.md)). If they do not, the system still runs its daily clean-up the first time anyone opens Notifications each day.

## 2. Your daily routine (10 minutes)

| Where | What to look for | What to do |
|---|---|---|
| **Dashboard** | Counts that need attention: payments to verify, new applications, requests, overdue bills | Click a count to open the list behind it |
| **Notifications** | The admin queue: new applications, payment proofs, maintenance, refunds | Open each, act on it; the item clears when it is done |
| **Messages** | Tenants' and guests' chat | Answer; use *Ask if resolved* when a guest's question is answered |
| **Payments** | Bills in *Pending verification* | Check the proof, then **Verify** (or reject it with a reason) |

Nothing is done for you except reminders and clean-up: money, approvals and move-outs are always your decision.

## 3. The jobs you will do most

### Approve a rent application and make the contract
1. **Applications**: open the application, check the documents, then choose **Approve** ("Approve this application?"). The applicant is notified and a move-in bill is created.
2. **Contracts**: create and review the rent contract, then send it for signing. Upload the signed copy when the tenant returns it.
3. The applicant pays the move-in bill (1 month advance + deposit). If they do not pay within the payment window, the hold lapses and the unit is released by itself.

### Record or verify a payment
- **Tenant paid online (GCash, Maya, QR Ph via PayMongo):** the bill turns *Paid* by itself. If it stays *Processing* for a long time, check the PayMongo dashboard before releasing it.
- **Tenant uploaded a receipt:** open **Payments**, look at the proof and the reference, then **Verify**. If the receipt is wrong, reject it and give the reason; the tenant is told.
- **Tenant paid cash at the office:** use **Record Payment**, and record only cash you actually received. The system will warn you if a bank or GCash reference was already used on another bill.
- A payment already marked *Paid* cannot be un-paid. If one was recorded by mistake, raise a refund (see below) instead.

### Maintenance requests
Open **Maintenance**. A request goes *Pending*, then *In Progress*, then *Completed* (or *Rejected* with a reason). Mark it *In Progress* when you start so the tenant sees it. If the tenant is responsible for the cost, enter the cost before completing and it is added to their bill.

### Move-out and the deposit
1. The tenant gives notice (inside the allowed notice window). The unit shows *pending move-out*.
2. On the day, open **Tenants** and choose **Move-Out Inspection & Clearance**. Add each deduction on its own line (damage, electricity, water, unpaid rent, other) with a reason.
3. **If a payment is still being checked** (a receipt waiting for you, or an online payment in progress), the system will not let you clear the tenant. Verify or reject that payment first.
4. The system takes unpaid bills and your deductions from the deposit and shows what is left. The tenant can ask for **one** review of the deductions within the set number of days.
5. **If the deposit does not cover what is owed, the system shows the balance but does not collect it.** Agree the arrangement with the former tenant (instalments, lump sum, or otherwise) and note it. A forfeiture can be waived, but you must give a reason.

### Refunds
**Refunds** lists money owed back (rejected applications, overpayments, unused advance rent, unapplied online payments). Review, approve, then send the money by bank, GCash or cash and record the **method and reference**. Online payments can be refunded through PayMongo from the same screen.

### Reports
**Reports** shows revenue, occupancy and other summaries. Use **Export CSV** to open the figures in Excel. Revenue counts bills marked *Paid*.

## 4. Rules to remember

- **Everything you do is logged** with your name: see **Activity Log**. Use a clear reason whenever the system asks for one (waivers, adjustments, rejections).
- Use the word **rent** with tenants, not "lease".
- **Rent increases:** a rent increase at renewal may be limited by the rent-control rules (NHSB Resolution 2024-01 covers units renting at ₱10,000 or less). Check the current cap before raising rent. The system does not stop you by itself yet.
- **Personal data:** IDs and documents are only for the people who need them. Do not share screenshots of tenants' documents. Privacy questions or deletion requests go to the owner (see the Privacy Notice on the site).
- **Do not share the admin login.** Create a separate account for each staff member under **Users**.

## 5. If something looks wrong

| Problem | First thing to try |
|---|---|
| A payment is stuck on *Processing* | Check PayMongo. Only if the tenant did not complete it, release it, then record the payment properly |
| A tenant cannot sign in | **Users**: check the account is not archived; ask them to use *Forgot password* |
| Text messages or emails are not sent | The channels may be off (**Other Settings**) or the provider is not configured. Tenants still see in-app notifications; call them if urgent |
| An action says "changed by someone else" | Another admin or tab changed it. Refresh the page and look again |
| A page shows an error | Refresh once. If it repeats, write down the time and what you clicked and tell the developer or operator |

## 6. Going further

- Payment rules: [payment_system_design.md](../features/payment_system_design.md)
- Moving in and out, deposits: [move_in_move_out_design.md](../features/move_in_move_out_design.md)
- Settings and what they do: Other Settings in the app; [system_design.md](system_design.md)
- Backups and restoring: [backup_and_restore.md](../deployment/backup_and_restore.md)
- What the system does not do, and who covers it: [2026-11-12_panel_policy_gap_audit.md](../audits/2026-11-12_panel_policy_gap_audit.md) Part B
