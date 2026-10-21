---
status: accepted
---

# Order-Time Commission Split via Razorpay Route (`transfers[]`)

Patient consultation and clinical service payments are split at order creation time (`POST /v1/orders`) using Razorpay Route's embedded `transfers[]` payload rather than post-hoc manual payouts. The `create-razorpay-order` edge function resolves the authoritative service price from the database, computes the **Platform Charge (Commission)** in integer paise using the doctor's `profiles.commission_percent` override (falling back to `platform_settings.default_commission_percent`), retains the commission in Doctylia's primary Razorpay account, and routes the **Doctor Net Share** (`grossPaise - commissionPaise`) directly to the doctor's `razorpay_account_id` Linked Account. When a payment is refunded, Doctylia issues a full refund with `reverse_all: 1` so Razorpay atomically reverses the Linked Account transfer and both platform commission and doctor net ledger entries are marked refunded.

## Considered Options

- **Order-time split via Razorpay Route (`transfers[]` on `POST /v1/orders`)** — Chosen because Razorpay handles escrow, Linked Account ledgering, T+2 bank settlement, and proportional transfer reversal (`reverse_all: 1`) natively without Doctylia holding doctor funds or running a batch payout scheduler.
- **Post-capture separate transfer call (`POST /v1/payments/:id/transfers`)** — Rejected because a network or webhook failure between payment capture and the transfer API call leaves captured funds unsplit in the primary account, requiring a reconciliation worker.
- **Periodic manual rollups via RazorpayX Payouts** — Rejected as the primary flow because holding doctor funds in Doctylia's bank account and disbursing monthly introduces custodial/nodal compliance overhead, per-payout banking fees, and delayed T+30 doctor cash flow.

## Consequences

- Doctors must have an active, KYC-verified Razorpay Route Linked Account (`razorpay_payment_enabled = true`) before accepting live online payments.
- All split calculations must be performed in integer paise (`commissionPaise = Math.round((grossPaise * pct) / 100)`, `doctorNetPaise = grossPaise - commissionPaise`) so the primary retention plus Route transfer always sum to the exact order amount.
- Patient-facing receipts and PDFs continue to show only the **Gross Consultation Fee**, while doctor billing and superadmin dashboards surface the full **Gross Consultation Fee**, **Platform Charge (Commission)**, and **Doctor Net Share** breakdown.
