# Razorpay Route — Direct Payment to Doctor Strategy
## Doctor India (Doctylia) Payment Gateway Redesign

> **Document Purpose:** Complete research, analysis, and implementation prompt for migrating from the current "Patient → Super Admin pool → monthly payout to Doctor" model to a "Patient pays → Doctor receives directly via Razorpay Route Linked Accounts" model.

---

## Table of Contents

1. [Current System Analysis — What's Wrong](#1-current-system-analysis)
2. [How Indian Unicorns Solve This](#2-how-indian-unicorns-solve-this)
3. [The Razorpay Route Solution — Deep Dive](#3-razorpay-route-solution)
4. [Transfer Methods Comparison](#4-transfer-methods-comparison)
5. [Can Doctors Get Money Instantly?](#5-instant-settlement-analysis)
6. [Complete Fee Breakdown](#6-complete-fee-breakdown)
7. [Architecture: Before vs After](#7-architecture-before-vs-after)
8. [What Changes in the Codebase](#8-what-changes-in-codebase)
9. [Doctor Onboarding (KYC) Flow](#9-doctor-onboarding-flow)
10. [Superadmin Role in New System](#10-superadmin-role)
11. [Edge Cases & Risk Mitigation](#11-edge-cases)
12. [Phase-wise Implementation Prompt](#12-implementation-prompt)

---

## 1. Current System Analysis

### How Payment Works Today

```
Patient pays ₹500 for appointment
         │
         ▼
┌─────────────────────────────────┐
│  Super Admin's Razorpay Account │  ← ALL money lands here
│  (Platform Razorpay Account)    │
└────────────┬────────────────────┘
             │ After ~30 days
             ▼
┌─────────────────────────────────┐
│  calculate-monthly-earnings     │  Aggregates doctor_ledger
│  → creates payout row           │
└────────────┬────────────────────┘
             │ Super Admin clicks "Approve & Pay"
             ▼
┌─────────────────────────────────┐
│  create-doctor-payout           │  RazorpayX transfer via
│  → IMPS to doctor bank          │  fund_account_id
└─────────────────────────────────┘
```

### What's Wrong with This

| Problem | Impact |
|:--------|:-------|
| **Doctors wait ~30 days** for their own earned money | Doctor dissatisfaction, trust issues |
| **Platform holds all patient money** | Regulatory risk — RBI Payment Aggregator (PA) guidelines apply when you hold funds on behalf of others |
| **Manual monthly rollup** | Super Admin must manually trigger `calculate-monthly-earnings` and `Approve & Pay` for every doctor |
| **RazorpayX dependency** | Requires a separate RazorpayX current account + Contact/Fund Account setup per doctor |
| **Refund complexity** | Refund must come from platform's pool, not from the doctor's received funds |
| **Scaling to 10,000+ doctors** | Monthly payout batching for 10K doctors is operationally painful |
| **Trust deficit** | Doctors have to trust the platform will pay them — no direct visibility into patient payment flow |

### Existing Codebase Tables Affected

| Table | Current Role | Post-Migration Role |
|:------|:-------------|:-------------------|
| `payments` | Stores order/payment against platform Razorpay account | Will store order/payment + transfer details via Route |
| `payouts` | Monthly superadmin→doctor RazorpayX transfer | **No longer needed** for appointment payments (keep for manual adjustments) |
| `doctor_ledger` | Commission split tracking for monthly payout rollup | Simplified — doctor gets 100%, ledger tracks for reporting only |
| `doctor_bank_accounts` | Stores bank/UPI for RazorpayX fund_account | **Replaced** by Razorpay Route Linked Account (bank details submitted to Razorpay at onboarding, not stored by us) |
| `profiles` | Has `commission_percent` column | Commission becomes irrelevant — platform earns from SaaS subscriptions, not per-txn cuts |

---

## 2. How Indian Unicorns Solve This

### Practo (Healthcare)

- **Model:** Commission-based marketplace
- **Flow:** Patient pays Practo → Practo deducts 10–20% commission → settles to doctor in T+3 days
- **Tech:** Payment aggregator license, escrow-like model
- **Lesson:** Even Practo doesn't give instant settlement — T+3 is considered fast in India healthcare

### Urban Company (Services Marketplace)

- **Model:** Razorpay Route / similar split payment
- **Flow:** Customer pays → automatic split at payment time → partner gets funds in T+2
- **Tech:** Route-style transfer from order with commission deduction
- **Lesson:** Automated split at order creation time is the gold standard — eliminates manual payouts

### Swiggy / Zomato (Food Delivery)

- **Model:** Custom payment infrastructure + NBFC partnerships
- **Flow:** Customer pays → restaurant gets weekly settlement → delivery partners get daily
- **Tech:** Own PA license, bulk NEFT/IMPS settlements
- **Lesson:** At scale, you need different settlement cycles for different vendor tiers

### Meesho (Social Commerce)

- **Model:** Razorpay Route Linked Accounts
- **Flow:** Customer pays → automated Route transfer → seller gets in T+2 (with instant settlement option at 0.5% fee)
- **Tech:** Direct Route integration with on_hold controls
- **Lesson:** The exact same Razorpay Route product we're proposing — proven at scale

### What Doctor India Should Learn

| Principle | Application |
|:----------|:-----------|
| **No manual payouts** — automate at payment time | Use Transfer from Order (split defined when order is created) |
| **No fund holding** — money flows through, not stays | Route transfer happens automatically on payment capture |
| **Platform earns from SaaS, not commission** | Already your model! Commission = 0%. Makes Route even simpler. |
| **Give vendors transparency** | Linked Account dashboard access for doctors |
| **Offer instant if you can** | Explore after Route is live — it's a premium upsell |

---

## 3. Razorpay Route Solution — Deep Dive

### What is Razorpay Route?

Razorpay Route is a **marketplace payment splitting** product. Instead of all money pooling in your account and you manually paying out vendors, Route **automatically splits the payment at the time of collection** and sends each stakeholder their share.

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  DOCTOR INDIA PLATFORM                    │
│              (One Primary Razorpay Account)               │
│                                                          │
│    ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│    │ Doctor A  │  │ Doctor B  │  │ Doctor C  │  ...10K+   │
│    │ Linked    │  │ Linked    │  │ Linked    │             │
│    │ Account   │  │ Account   │  │ Account   │             │
│    │ acc_xxx   │  │ acc_yyy   │  │ acc_zzz   │             │
│    └──────────┘  └──────────┘  └──────────┘             │
└──────────────────────────────────────────────────────────┘
```

### Key Concepts

| Concept | What It Means |
|:--------|:-------------|
| **Primary Account** | Your main Razorpay business account (Doctor India platform) |
| **Linked Account** | A sub-account created under your primary account for each doctor |
| **Transfer** | Movement of funds from a captured payment to a linked account |
| **Settlement** | Actual bank credit from Razorpay to the linked account's bank |
| **Stakeholder** | The person behind a linked account (the doctor, for KYC) |
| **Route Product** | Must be activated on each linked account to enable receiving transfers |

### Linked Account vs Separate Razorpay Account

> **You do NOT need to create a separate Razorpay merchant account for each doctor.**

| Approach | Linked Account (Route) ✅ | Separate Razorpay Account ❌ |
|:---------|:------------------------|:--------------------------|
| Setup | One API call from your platform | Each doctor signs up individually |
| KYC | Minimal — under your umbrella | Full merchant KYC per doctor |
| Management | Centralized from your dashboard | Doctor manages their own |
| Fees | Your negotiated rate applies | Each doctor gets default rates |
| Scale | Designed for 10,000+ | Unmanageable at scale |
| Refunds | You control refunds/reversals | Doctor must initiate |

---

## 4. Transfer Methods Comparison

Razorpay Route offers three transfer types. Here's which one Doctor India should use:

### Option A: Transfer from Order ⭐ RECOMMENDED

```
create-razorpay-order → includes transfer[] in the order creation payload
                      → payment captured → transfer auto-executes
```

| Aspect | Detail |
|:-------|:-------|
| **When split is defined** | At order creation time |
| **Automation** | Fully automatic — no second API call needed |
| **Best for** | Known, fixed splits (which is our case — doctor gets 100%) |
| **Refund handling** | Razorpay auto-handles linked account reversal on refund |

### Option B: Transfer from Payment

```
create-razorpay-order → payment captured → separate API call to create transfer
```

| Aspect | Detail |
|:-------|:-------|
| **When split is defined** | After payment is captured |
| **Best for** | When you need to verify/approve before releasing funds |
| **Drawback** | Requires a second API call — more failure points |

### Option C: Direct Transfer

```
Move funds from your Razorpay balance → linked account
(Not tied to a specific payment)
```

| Aspect | Detail |
|:-------|:-------|
| **Best for** | Ad-hoc payouts, bonus payments |
| **Drawback** | Requires on-demand feature activation; not tied to patient payments |

### Verdict for Doctor India

**Use Transfer from Order.** Reasoning:

1. The split is always known at booking time (doctor gets 100%, platform gets 0%)
2. It's fully automated — no manual step, no second API call
3. Refund handling is built-in — Razorpay auto-reverses the linked account transfer
4. Simplest code path with fewest failure modes

---

## 5. Instant Settlement Analysis

### Can the Doctor Get Money Instantly When Patient Pays?

**Short answer: Not truly "instantly" — but much faster than the current 30-day cycle.**

### Settlement Timeline Breakdown

| Stage | What Happens | Time |
|:------|:-------------|:-----|
| Patient pays | Razorpay captures payment | Instant |
| Transfer executes | Funds move from primary to linked account balance | Instant (automatic with Order Transfer) |
| Settlement to bank | Razorpay settles linked account balance to doctor's bank | **T+2 business days** (standard) |

### Can We Make It Faster Than T+2?

| Option | How | Charge | Availability |
|:-------|:----|:-------|:-------------|
| **Standard Settlement** | Automatic T+2 business days | Included in Route fee | Default |
| **Same-Day Settlement** | Request faster settlement cycle | ~0.15–0.20% additional | Contact Razorpay |
| **Instant Settlement** (ES) | On-demand trigger, money in 10 seconds | ~0.20–0.50% additional | Must be enabled by Razorpay for your account |
| **Instant Settlement for Linked Accounts** | Seller-triggered instant via credit product | ~0.5–0.7% per withdrawal | NBFC partnership, must be enabled separately |

### Important Caveats

> [!WARNING]
> **Do NOT promise doctors "instant money" in the UI.** The settlement to the doctor's bank account is controlled by Razorpay, not by your platform.

1. **T+2 is the standard** for linked accounts and cannot be faster without explicit Razorpay activation
2. **Instant Settlement for linked accounts** is a separate product that requires Razorpay's sales team to enable
3. The linked account's settlement cycle can **never be faster** than the primary account's cycle
4. Even with instant settlement, there's a **24-hour cooling period** for newly created linked accounts

### Recommendation for Doctor India

| Phase | Settlement | What to Tell Doctors |
|:------|:-----------|:--------------------|
| **Launch (Phase 1)** | T+2 business days (standard) | "You receive payment within 2 working days" |
| **Growth (Phase 2)** | Same-day settlement | "Same-day settlement for high-volume doctors" |
| **Scale (Phase 3)** | Instant settlement | "Instant settlement available at a small fee" |

**Even T+2 is a massive improvement over the current 30-day cycle.** Start there.

---

## 6. Complete Fee Breakdown

### Current System Fees (Patient → Platform → Doctor via RazorpayX)

| Fee | Who Pays | Amount |
|:----|:---------|:-------|
| Payment gateway (capturing patient payment) | Platform (deducted from settlement) | ~2% + GST |
| RazorpayX payout (IMPS to doctor bank) | Platform | ₹5–₹25 per payout |
| **Total per ₹500 consultation** | | **~₹12 (gateway) + ₹10 (payout) = ~₹22** |

### New System Fees (Patient → Route → Doctor's Linked Account)

| Fee | Who Pays | Amount |
|:----|:---------|:-------|
| Payment gateway (capturing patient payment) | Platform (or pass to linked account) | ~2% + GST |
| Route transfer fee | Platform (or pass to linked account) | ~0.25% |
| Settlement to linked account bank | Included | ₹0 |
| **Total per ₹500 consultation** | | **~₹12 (gateway) + ₹1.25 (Route) = ~₹13.25** |

### Fee Comparison

| Scenario | Current | New (Route) | Savings |
|:---------|:--------|:------------|:--------|
| ₹500 consultation | ~₹22 | ~₹13.25 | **₹8.75 saved per transaction** |
| ₹1000 consultation | ~₹33.60 | ~₹26.50 | **₹7.10 saved** |
| 100 appointments/month | ~₹2,200 | ~₹1,325 | **₹875/month saved** |

### Who Should Bear the Fees?

There are three models — Doctor India should choose:

| Model | How | Pros | Cons |
|:------|:----|:-----|:-----|
| **A) Platform absorbs all fees** | Transfer doctor the full consultation amount; platform pays gateway + Route fees | Doctor-friendly, clean UX | Eats into SaaS margin |
| **B) Doctor absorbs gateway fees** ⭐ | Transfer `amount - gateway_fee - route_fee` to doctor | Industry standard (Practo, Urban Company do this) | Doctor gets slightly less than face value |
| **C) Patient pays fees on top** | Add convenience fee to patient's total | Doctor gets exact amount | Patient sees a higher price |

**Recommended: Model B** — deduct fees before transfer. This is how every major marketplace works. The doctor's linked account receives `consultation_fee - (2% gateway + 0.25% Route + GST)`.

Alternatively, since Doctor India already earns from SaaS subscriptions (not commissions), **Model A** can be positioned as a premium benefit: _"Switch to our Pro/Premium plan — we absorb all payment processing fees."_

---

## 7. Architecture: Before vs After

### BEFORE (Current)

```
Patient ──pay──▶ Platform Razorpay Account
                        │
                        ├─ payments table (captured)
                        ├─ doctor_ledger (commission=0, doctor_share=full)
                        │
                        │  ⏳ 30 days later...
                        │
                        ├─ calculate-monthly-earnings (Super Admin triggers)
                        ├─ payouts table (pending)
                        │
                        │  👆 Super Admin clicks "Approve & Pay"
                        │
                        ├─ create-doctor-payout → RazorpayX IMPS
                        └─ doctor_bank_accounts (fund_account_id)
```

### AFTER (Proposed)

```
Patient ──pay──▶ Platform Razorpay Account
                        │
                        ├─ Order created WITH transfer[] to doctor's linked account
                        ├─ Payment captured → Transfer auto-executes
                        │
                        ├─ payments table (captured, transfer_id, transfer_status)
                        ├─ transfers table (transfer tracking)
                        │
                        │  ⏱ T+2 business days (automatic, no human action)
                        │
                        └─ Razorpay settles to doctor's bank
                           (via linked account's own settlement cycle)
```

### What Gets Eliminated

| Component | Status |
|:----------|:-------|
| `calculate-monthly-earnings` edge function | **Deprecated** for appointment payments |
| `create-doctor-payout` edge function | **Deprecated** for appointment payments |
| `add-doctor-bank-account` edge function | **Replaced** by linked account onboarding |
| `payouts` table | **Keep for legacy** but no new rows for appointments |
| `doctor_ledger.paid` / `payout_id` | **Simplified** — ledger exists for reporting only |
| Monthly Super Admin "Approve & Pay" workflow | **Eliminated** — settlement is automatic |
| RazorpayX account + keys | **Not required** for appointment payments |

---

## 8. What Changes in the Codebase

### Edge Functions — Changes Required

| Function | Change |
|:---------|:-------|
| `create-razorpay-order` | **Major rewrite** — add `transfers[]` payload with doctor's `razorpay_account_id`; validate doctor has active linked account |
| `verify-razorpay-payment` | **Modify** — save transfer_id from order response; track transfer status alongside payment status |
| `razorpay-webhook` | **Extend** — handle `transfer.processed`, `transfer.failed`, `transfer.reversed` events |
| `refund-payment` | **Modify** — use Razorpay refund API (auto-reverses linked account transfer) |
| **NEW** `onboard-doctor-payment` | **Create** — Linked Account creation + Stakeholder + Route Product activation |
| **NEW** `sync-doctor-payment-status` | **Create** — polls/syncs linked account activation status |

### Database — New Tables & Columns

| Change | Detail |
|:-------|:-------|
| `profiles` table — add columns | `razorpay_account_id`, `razorpay_account_status`, `razorpay_payment_enabled` |
| **NEW** `transfers` table | Tracks Route transfers per payment |
| **NEW** `settlements` table (optional Phase 2) | Tracks settlement UTR for reconciliation |
| **NEW** `webhook_events` table | Idempotent webhook processing |
| `payments` table — add columns | `pending_booking` already exists; add `transfer_status` |

### Frontend — Changes Required

| Component | Change |
|:----------|:-------|
| `BookingWidget.tsx` | Validate doctor has active linked account before showing pay button |
| `ProfilePage.tsx` (Admin) | Replace bank/UPI setup with linked account onboarding status |
| `SAPayments.tsx` (Super Admin) | Add transfer tracking columns; remove manual payout workflow |
| **NEW** Doctor Payment Onboarding UI | Guided KYC flow for linked account creation |

---

## 9. Doctor Onboarding (KYC) Flow

### What Information Razorpay Needs for a Linked Account

| Field | Required? | Source |
|:------|:----------|:-------|
| Business name | Yes | Doctor's clinic/practice name (from `profiles`) |
| Business type | Yes | Always `individual` for solo-practice doctors |
| Contact name | Yes | Doctor's full name (from `profiles`) |
| Contact email | Yes | From `profiles` or auth |
| Contact phone | Yes | From `profiles` |
| Legal business name | Yes | Doctor's name or registered practice |
| PAN | Yes (for KYC activation) | Doctor provides |
| GSTIN | Optional | Only if doctor has GST registration |
| Bank account details | Yes | Account number + IFSC + beneficiary name |

### Onboarding State Machine

```
NOT_STARTED
     │
     ▼  Doctor clicks "Enable Online Payments"
SUBMITTED
     │
     ▼  Platform calls Razorpay Create Linked Account API
PROCESSING
     │
     ├──▶ NEEDS_CLARIFICATION (KYC issue — doctor must fix)
     │         │
     │         ▼  Doctor fixes, platform re-submits
     │    PROCESSING
     │
     ├──▶ ACTIVE ← ✅ ready to receive payments
     │
     └──▶ FAILED (rejected by Razorpay)
```

### 24-Hour Cooling Period

> [!IMPORTANT]
> Razorpay imposes a **24-hour cooling period** on newly created linked accounts before they can receive transfers. Plan the onboarding UX accordingly.

**Recommendation:** Onboard doctors at profile setup time (Onboarding.tsx), not at first patient booking. This way, the cooling period passes before any patient tries to pay.

---

## 10. Superadmin Role in New System

### What Superadmin Still Does

| Responsibility | Detail |
|:---------------|:-------|
| **Monitor payment health** | View all payments, transfers, settlements across doctors |
| **Handle failed transfers** | Investigate and retry/refund when Route transfers fail |
| **Doctor onboarding oversight** | See which doctors have active/pending/failed linked accounts |
| **Refund management** | Initiate refunds (Razorpay auto-reverses the linked account transfer) |
| **Fee configuration** | Set who bears the gateway + Route fees |
| **Reconciliation** | Match settlements to transfers, track UTRs |

### What Superadmin No Longer Does

| Eliminated Task | Why |
|:----------------|:----|
| Monthly "Calculate Earnings" | Transfers happen automatically per payment |
| "Approve & Pay" doctor payouts | Settlement is automatic via Razorpay |
| Managing RazorpayX contacts/fund accounts | Replaced by linked account onboarding |
| Worrying about pool balance | Money flows through, doesn't accumulate |

---

## 11. Edge Cases & Risk Mitigation

### Critical Edge Cases

| Scenario | What Happens | Mitigation |
|:---------|:-------------|:-----------|
| Doctor's linked account not yet active | Patient tries to pay | **Block payment** — show "Online payment not available for this doctor yet. Please contact clinic." |
| Payment captured but transfer fails | Money in platform, not reached doctor | Alert superadmin; log to `transfers` table as FAILED; provide retry or refund |
| Doctor's linked account gets suspended | Mid-flow or post-activation | Periodic sync job checks account status; disable online payments if suspended |
| Refund after transfer processed | Patient wants refund, doctor already got money | Razorpay auto-reverses the linked account transfer; if linked account balance insufficient, platform covers and recoups |
| Duplicate webhook | `transfer.processed` fires twice | Idempotent processing via `webhook_events.razorpay_event_id` UNIQUE constraint |
| Patient tampers with linked account ID | Sends wrong `razorpay_account_id` in request | **Never trust client-side account ID** — always derive from `profiles.razorpay_account_id` based on `appointment.doctor_id` |
| Doctor has multiple clinics | Different bank accounts per location | One linked account per doctor initially; multi-clinic support is Phase 3 |

### Refund Flow (New System)

```
Appointment cancelled
     │
     ▼
Platform calls Razorpay Refund API (on original payment_id)
     │
     ▼
Razorpay auto-reverses linked account transfer
     │
     ▼
Money returns to patient's original payment method
```

> [!NOTE]
> With Route, refunds are simpler than the current system. Razorpay handles the linked account reversal automatically — no manual calculation or RazorpayX payout adjustment needed.

---

## 12. Phase-wise Implementation Prompt

### Phase 1 — Foundation (Week 1–2)

> [!IMPORTANT]
> **This is the complete, self-contained prompt to implement Phase 1.**

#### Database Migration

Create a new migration that:

1. Adds to `profiles`:
   - `razorpay_account_id TEXT UNIQUE` — the Razorpay linked account ID
   - `razorpay_stakeholder_id TEXT`
   - `razorpay_product_id TEXT`
   - `razorpay_account_status TEXT DEFAULT 'not_started'` — enum: `not_started`, `submitted`, `processing`, `needs_clarification`, `active`, `suspended`, `failed`
   - `razorpay_payment_enabled BOOLEAN DEFAULT false`
   - `razorpay_onboarding_error TEXT`
   - `razorpay_last_synced_at TIMESTAMPTZ`

2. Creates `transfers` table:
   ```sql
   CREATE TABLE transfers (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     payment_id UUID NOT NULL REFERENCES payments(id),
     appointment_id UUID NOT NULL REFERENCES appointments(id),
     doctor_id UUID NOT NULL REFERENCES profiles(id),
     razorpay_transfer_id TEXT UNIQUE,
     razorpay_account_id TEXT NOT NULL,
     amount NUMERIC(10,2) NOT NULL,
     currency TEXT DEFAULT 'INR',
     status TEXT NOT NULL DEFAULT 'pending',  -- pending, processed, failed, reversed
     processed_at TIMESTAMPTZ,
     reversed_at TIMESTAMPTZ,
     error TEXT,
     created_at TIMESTAMPTZ DEFAULT now(),
     updated_at TIMESTAMPTZ DEFAULT now()
   );
   ```

3. Creates `webhook_events` table:
   ```sql
   CREATE TABLE webhook_events (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     razorpay_event_id TEXT UNIQUE NOT NULL,
     event_type TEXT NOT NULL,
     payload JSONB,
     status TEXT DEFAULT 'received',  -- received, processed, failed
     processed_at TIMESTAMPTZ,
     error TEXT,
     created_at TIMESTAMPTZ DEFAULT now()
   );
   ```

4. Adds to `payments`:
   - `transfer_status TEXT` — mirrors the transfer status for quick lookups

#### Edge Functions

**`onboard-doctor-payment/index.ts`** (NEW)
- Auth-gated: only the doctor themselves or superadmin can trigger
- Collects: business_name, legal_name, contact (name/email/phone), PAN (optional at creation, required for activation), bank details (account_number + IFSC)
- Calls Razorpay API sequence:
  1. `POST /v2/accounts` — Create Linked Account
  2. `POST /v2/accounts/{account_id}/stakeholders` — Create Stakeholder (with doctor's details)
  3. `POST /v2/accounts/{account_id}/products` — Request Route Product (`route`)
  4. `PATCH /v2/accounts/{account_id}/products/{product_id}` — Update with settlement (bank) details
- Saves returned IDs to `profiles` columns
- Sets `razorpay_account_status = 'submitted'` initially
- Mock mode: generates mock IDs, sets status to `active` immediately

**`sync-doctor-payment-status/index.ts`** (NEW)
- Called periodically (cron or manual) or after onboarding
- Calls `GET /v2/accounts/{account_id}` to fetch current activation status
- Updates `profiles.razorpay_account_status` and `razorpay_payment_enabled`
- If `activation_status === 'activated'` → set `razorpay_payment_enabled = true`
- If `needs_clarification` → store requirements in `razorpay_onboarding_error`

**Modify `create-razorpay-order/index.ts`**
- Before creating order, validate:
  - `doctor.razorpay_account_id` exists
  - `doctor.razorpay_payment_enabled === true`
  - `doctor.razorpay_account_status === 'active'`
- If doctor isn't Route-enabled, return clear error
- Add `transfers[]` to the Razorpay order creation payload:
  ```typescript
  const orderPayload = {
    amount: amountPaise,
    currency: "INR",
    receipt: `appt_${booking.doctor_id}_${Date.now()}`,
    transfers: [
      {
        account: doctor.razorpay_account_id,
        amount: doctorAmountPaise, // Full amount or after fee deduction
        currency: "INR",
        notes: {
          doctor_id: booking.doctor_id,
          appointment_date: booking.date,
          appointment_time: booking.time_slot,
        },
        on_hold: 0, // Don't hold — settle immediately
      },
    ],
  };
  ```
- Save the transfer information from the order response

**Modify `verify-razorpay-payment/index.ts`**
- After signature verification, fetch order details to get transfer status
- Create a row in `transfers` table with the transfer_id from the order
- Update `payments.transfer_status`
- Ledger entry still created (for reporting) but `commission_percent = 0`, `commission_amount = 0`

**Modify `razorpay-webhook/index.ts`**
- Add handlers for new Route-specific events:
  - `transfer.processed` → update transfer status, confirm appointment
  - `transfer.failed` → alert superadmin, mark appointment as payment_review
  - `transfer.reversed` → update transfer, handle refund state
- Implement idempotency via `webhook_events` table
- Always verify webhook signature before processing

**Modify `refund-payment/index.ts`**
- For live mode: call Razorpay's refund API (`POST /v1/payments/{payment_id}/refund`)
- Razorpay automatically reverses the linked account transfer
- Track refund ID and reversal status

#### Frontend Changes

**`BookingWidget.tsx`**
- Check doctor's `razorpay_payment_enabled` before showing payment flow
- If not enabled, show "Online booking unavailable — please call clinic" message

**New Component: `DoctorPaymentOnboarding.tsx`**
- Wizard-style form: business details → bank details → submit to Razorpay
- Show onboarding status: NOT_STARTED → SUBMITTED → PROCESSING → ACTIVE
- Display any `needs_clarification` issues from Razorpay

**`SAPayments.tsx`** (Super Admin)
- Add transfer status columns to payment listing
- Remove/deprecate the monthly payout workflow
- Add doctor onboarding status overview panel

### Phase 2 — Polish & Monitoring (Week 3)

- Settlement tracking table + UTR reconciliation
- Doctor-facing payment dashboard (see their settlements)
- Automated periodic sync of linked account statuses
- Admin alerts for failed transfers
- Transfer retry mechanism for transient failures

### Phase 3 — Instant Settlement (Week 4+, Optional)

- Contact Razorpay to enable instant/same-day settlement for linked accounts
- Add UI toggle for doctors to opt into instant settlement (at a fee)
- Track instant settlement fees separately in the ledger

---

## Summary: Why This Is Better for Everyone

### For Doctors ✅

| Before | After |
|:-------|:------|
| Wait 30 days for money | **Receive in 2 business days** (automatic) |
| Depend on superadmin to "Approve & Pay" | **Automatic — no human intervention** |
| No visibility into payment flow | Can see transfers in linked account dashboard |
| Trust the platform to pay | **Money goes directly to them** |

### For Patients ✅

| Before | After |
|:-------|:------|
| Same payment experience | **Same payment experience** (no change!) |
| Refund depends on platform balance | **Automatic refund + reversal** |

### For Superadmin ✅

| Before | After |
|:-------|:------|
| Monthly manual "Calculate Earnings" | **Eliminated** |
| Manual "Approve & Pay" per doctor | **Eliminated** |
| Hold all doctor money (regulatory risk) | **No fund holding — pass-through** |
| Need RazorpayX account + keys | **Only Razorpay Route (same account)** |
| Manage fund accounts per doctor | **Linked accounts auto-managed** |

### For the Platform ✅

| Before | After |
|:-------|:------|
| Regulatory risk of holding funds | **No PA license concerns** — you're just routing |
| Operational overhead of monthly payouts | **Zero operational overhead** |
| Trust issues with doctors | **Transparent, automatic flow** |
| Complex refund path | **Simple — Razorpay handles reversal** |

---

> [!TIP]
> **Next Step:** Review this document, clarify any open questions, and when ready — the Phase 1 Implementation Prompt in Section 12 is self-contained and ready to be executed. Say "Proceed" to begin implementation.
