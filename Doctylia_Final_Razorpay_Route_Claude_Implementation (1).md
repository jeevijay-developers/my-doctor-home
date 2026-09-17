# Doctylia --- Final Claude Code Implementation Specification

## Razorpay Route + Linked Accounts + Doctor-Direct Appointment Payments

> **Purpose:** Give this file directly to Claude Code with the Doctylia
> source code.
>
> **Mode:** IMPLEMENTATION --- inspect the real codebase first, then
> implement the complete payment architecture described below.
>
> **Important:** This specification is based on the current Doctylia
> payment architecture survey. The current system uses a central
> Razorpay account for patient appointment payments and a separate
> RazorpayX monthly/manual doctor payout flow. Route / Linked Accounts /
> transfer logic does not currently exist.

------------------------------------------------------------------------

# 0. NON-NEGOTIABLE PRIMARY INSTRUCTION

Read this entire document before modifying code.

Then inspect the actual Doctylia repository.

Do not assume the repository matches this document exactly. The
repository is the source of truth for existing code structure, naming,
authentication, schema, and UI.

Before implementation:

1.  Inspect the existing frontend.
2.  Inspect all payment-related Supabase Edge Functions.
3.  Inspect relevant migrations in chronological order.
4.  Inspect appointment creation and slot-locking logic.
5.  Inspect the existing Razorpay integration.
6.  Inspect the existing mock-payment mode.
7.  Inspect the existing doctor settings/admin pages.
8.  Inspect existing notification and invoice flows.
9.  Inspect existing RLS policies.
10. Inspect environment-variable conventions.
11. Inspect the installed Razorpay SDK/package versions, if any.
12. Verify current official Razorpay Route API documentation before
    implementing undocumented or conceptual fields.

Do not rewrite unrelated functionality.

Do not create duplicate doctor/profile systems.

Do not break existing subscription/plan-upgrade payments.

Do not remove historical payout data unless there is a documented
migration reason.

------------------------------------------------------------------------

# 1. CURRENT CODEBASE --- IMPORTANT BASELINE

The current payment architecture was surveyed and confirmed as follows.

## Current appointment-payment functions

### `supabase/functions/create-razorpay-order/index.ts`

Current behavior:

-   validates booking data
-   checks doctor/slot conditions
-   creates a Razorpay order in live mode
-   creates a mock order in mock mode
-   inserts a `payments` row
-   uses `payments.appointment_id = null`
-   stores booking information in `pending_booking`
-   currently creates a normal platform Razorpay order
-   currently has no Route transfer / Linked Account logic

### `supabase/functions/verify-razorpay-payment/index.ts`

Current behavior:

-   verifies Razorpay payment signature
-   creates the actual appointment after successful payment
-   marks payment as captured
-   writes `doctor_ledger`
-   currently hardcodes commission to zero
-   currently does not create a Route transfer
-   currently leaves captured appointment money in the platform Razorpay
    account

### `supabase/functions/razorpay-webhook/index.ts`

Current behavior:

-   handles payment events
-   handles existing RazorpayX payout events
-   does not currently process Route transfer events
-   does not currently have a general webhook-event idempotency table

### `supabase/functions/refund-payment/index.ts`

Current behavior:

-   admin-only
-   live Razorpay refund is not fully implemented
-   mock mode changes local payment/appointment state

### Existing manual payout system

These functions/tables currently support the old monthly payout
architecture:

-   `supabase/functions/calculate-monthly-earnings/index.ts`
-   `supabase/functions/create-doctor-payout/index.ts`
-   `supabase/functions/add-doctor-bank-account/index.ts`
-   `doctor_ledger`
-   `payouts`
-   `doctor_bank_accounts`

The existing `razorpay_contact_id` and `razorpay_fund_account_id` fields
are RazorpayX payout destinations.

They are NOT Razorpay Route Linked Account IDs.

Do not confuse:

``` text
Razorpay Route Linked Account
```

with:

``` text
RazorpayX Contact / Fund Account
```

------------------------------------------------------------------------

# 2. BUSINESS REQUIREMENT

Required appointment-payment flow:

``` text
Patient
  ↓
Select Doctor
  ↓
Select Date
  ↓
Select Time Slot
  ↓
Create/Reserve Appointment Payment Attempt
  ↓
Razorpay Checkout
  ↓
Payment Verified
  ↓
Route transfer to booked doctor's Linked Account
  ↓
Transfer confirmed by Razorpay/webhook
  ↓
Appointment Confirmed
  ↓
Success / Appointment Slip
```

The core routing rule is:

``` text
Appointment Doctor
        ==
Payment Doctor
        ==
Transfer Doctor
        ==
Razorpay Linked Account
```

Example:

``` text
Patient A books Doctor A
        ↓
Appointment.doctor_id = Doctor A
        ↓
server resolves Doctor A's razorpay_account_id
        ↓
payment transfer goes to Doctor A
```

Never allow:

``` text
Patient/browser → choose destination account
```

The browser must never determine the payment destination.

------------------------------------------------------------------------

# 3. TARGET RAZORPAY ARCHITECTURE

Use one primary Doctylia/platform Razorpay account.

Under that platform:

``` text
Primary Razorpay Platform Account
        |
        +---- Doctor A Linked Account
        |
        +---- Doctor B Linked Account
        |
        +---- Doctor C Linked Account
        |
        +---- ...
```

The application must be designed to support 10,000+ doctor payment
accounts.

This is an application architecture target.

Do NOT claim that Razorpay guarantees unlimited accounts.

Do NOT hard-code an artificial limit such as:

``` text
MAX_LINKED_ACCOUNTS = 1000
```

unless required by a real provider/business constraint.

------------------------------------------------------------------------

# 4. RAZORPAY DOCUMENTATION RULE

Before implementing any Route API call:

-   inspect the installed Razorpay SDK/version
-   inspect current official Razorpay Route documentation
-   verify endpoint paths
-   verify request bodies
-   verify response fields
-   verify authentication
-   verify webhook event names
-   verify Linked Account onboarding requirements
-   verify transfer creation requirements
-   verify refund/reversal behavior
-   verify settlement information available through API/webhooks
-   verify current restrictions/cooling periods

Do NOT blindly copy conceptual examples from this document.

If this document conflicts with current official Razorpay documentation:

``` text
CURRENT OFFICIAL RAZORPAY DOCUMENTATION
        >
THIS SPECIFICATION
```

Adapt the implementation while preserving the business requirement.

------------------------------------------------------------------------

# 5. DATABASE STRATEGY

First inspect the current schema.

Current relevant tables include:

``` text
payments
appointments
profiles
doctor_ledger
payouts
doctor_bank_accounts
platform_settings
invoices
plan_upgrade_payments
```

Current `appointments` supports:

``` text
status:
pending
confirmed
completed
cancelled
no_show
```

Current `payment_status` supports:

``` text
pending
paid
refunded
pay_at_clinic
```

Current `payments` includes:

``` text
appointment_id
doctor_id
razorpay_order_id
razorpay_payment_id
razorpay_signature
amount
currency
status
method
raw_response
pending_booking
needs_refund
is_mock
```

Do not destroy these fields.

Use migrations to extend the schema safely.

------------------------------------------------------------------------

# 6. DOCTOR RAZORPAY LINKED ACCOUNT DATA

Do not duplicate doctor profile data.

Preferred architecture:

### Option A --- preferred if separation is clean

Create:

``` text
doctor_razorpay_accounts
```

with a one-to-one relationship to the doctor.

Suggested fields:

``` text
id
doctor_id
razorpay_account_id
razorpay_stakeholder_id
razorpay_product_id
activation_status
payment_enabled
bank_verification_status
kyc_status
onboarding_error
last_synced_at
created_at
updated_at
```

Constraints:

``` text
doctor_id UNIQUE
razorpay_account_id UNIQUE where not null
```

### Option B

If the existing architecture strongly favors keeping payment metadata
with the doctor profile/bank table, add only the Route-specific fields
there.

Do not mix Route identifiers with:

``` text
razorpay_contact_id
razorpay_fund_account_id
```

because those belong to the existing RazorpayX payout flow.

Claude must choose the least disruptive architecture after inspecting
the actual schema.

------------------------------------------------------------------------

# 7. LINKED ACCOUNT STATUS

Normalize provider status into application-level status values.

Recommended:

``` text
NOT_STARTED
SUBMITTED
PROCESSING
NEEDS_CLARIFICATION
ACTIVE
SUSPENDED
FAILED
```

Adapt exact enum/string style to the existing codebase.

Store the raw provider status only where useful for
reconciliation/debugging.

Never expose sensitive KYC payloads to frontend.

------------------------------------------------------------------------

# 8. ONLINE PAYMENT ELIGIBILITY

Create a single backend/server-side eligibility decision.

Conceptually:

``` text
canDoctorReceiveOnlinePayment(doctor)
```

It must verify the actual provider/account state.

At minimum:

``` text
Linked Account exists
AND
provider activation/status permits payments
AND
payment_enabled = true
AND
required bank/KYC verification is complete
```

Do not rely only on a frontend toggle.

The server is authoritative.

If the doctor is not eligible:

``` text
do not create a live online-payment order
```

Return a safe, user-friendly error.

If the product already supports:

``` text
Pay at Clinic
```

it may remain available as a fallback according to existing business
rules.

Do not silently convert a requested online payment into an unpaid
appointment.

------------------------------------------------------------------------

# 9. LINKED ACCOUNT ONBOARDING

Create backend services/Edge Functions following the project's existing
conventions.

Conceptual service operations:

``` text
createLinkedAccount(doctor)
createStakeholder(accountId, data)
createRouteProduct(accountId)
updateRouteProduct(accountId, productId, data)
getRouteAccountStatus(accountId)
syncRouteAccountStatus(doctor)
```

Use the exact current Razorpay API contracts.

The onboarding flow must:

1.  authenticate the doctor/admin
2.  load the doctor server-side
3.  validate required onboarding data
4.  create the Linked Account using Razorpay
5.  save the returned account ID
6.  create/update required stakeholder information
7.  create/configure the required Route product
8.  save returned IDs
9.  synchronize activation status
10. expose only safe status to the UI

Never accept a doctor ID and payment account mapping blindly from the
browser.

The authenticated doctor/admin must be authorized to modify that doctor.

------------------------------------------------------------------------

# 10. PAYMENT ACCOUNT ONBOARDING UI

Use the existing doctor Settings area.

Do not create a second personal-profile onboarding system.

Add a payment section such as:

``` text
Payment Settings

Razorpay Account
Connected / Not Connected

KYC
Verified / Pending / Action Required

Bank Verification
Verified / Pending

Route Status
Active / Processing / Needs Clarification / Failed

Online Payments
Enabled / Disabled
```

The UI must show actionable errors where the provider supplies them.

Do not show:

-   secret keys
-   webhook secrets
-   sensitive KYC payloads
-   full bank account numbers

------------------------------------------------------------------------

# 11. APPOINTMENT/PAYMENT DATA MODEL

The current pay-first model may be retained because it already supports:

``` text
payments.appointment_id = null
payments.pending_booking
```

However, inspect the actual slot/appointment implementation before
changing the lifecycle.

Preferred design:

``` text
Appointment reservation
        ↓
Payment attempt
        ↓
Razorpay order
        ↓
Payment
        ↓
Transfer
        ↓
Appointment confirmation
```

If creating a pending appointment first is safer for slot locking, use:

``` text
appointment.status = pending
appointment.payment_status = pending
```

and make it expire if payment is abandoned.

If retaining the current pay-first model, ensure slot concurrency is
still safe.

The key requirement is:

``` text
NO DOUBLE BOOKING
```

------------------------------------------------------------------------

# 12. PAYMENT TABLE EXTENSION

Extend the existing `payments` table rather than creating a duplicate
payment table.

Recommended additional fields:

``` text
patient_id
doctor_id
appointment_id
razorpay_order_id
razorpay_payment_id
amount
currency
status
signature_verified
captured_at
failure_reason
created_at
updated_at
```

If equivalent fields already exist, reuse them.

Do not create duplicate columns.

Recommended application-level payment states:

``` text
created
authorized
captured
failed
refunded
```

Add more states only when actually needed by the implementation.

------------------------------------------------------------------------

# 13. TRANSFERS TABLE

Create a dedicated transfer table because payment and transfer are
different lifecycle events.

Suggested:

``` text
transfers
```

Fields:

``` text
id
payment_id
appointment_id
doctor_id
razorpay_transfer_id
razorpay_account_id
amount
currency
status
failure_reason
processed_at
reversed_at
created_at
updated_at
```

Recommended status values:

``` text
pending
processed
failed
reversed
```

Constraints:

``` text
razorpay_transfer_id UNIQUE where not null
```

Also consider a unique business invariant that prevents duplicate
transfers for one appointment/payment.

Add indexes for:

``` text
payment_id
appointment_id
doctor_id
razorpay_transfer_id
status
```

------------------------------------------------------------------------

# 14. WEBHOOK EVENTS TABLE

Create:

``` text
razorpay_webhook_events
```

Suggested:

``` text
id
razorpay_event_id
event_type
payload
status
error_message
processed_at
created_at
```

Constraint:

``` text
UNIQUE(razorpay_event_id)
```

Recommended status:

``` text
received
processed
failed
```

Do not rely on frontend callbacks for webhook idempotency.

------------------------------------------------------------------------

# 15. SETTLEMENT TRACKING

Payment capture, Route transfer, and bank settlement are separate
concepts.

If the provider/API exposes settlement information needed by the
product, create:

``` text
settlements
```

Suggested:

``` text
id
transfer_id
razorpay_settlement_id
amount
fee
tax
utr
status
processed_at
created_at
updated_at
```

Recommended status:

``` text
pending
processed
failed
```

Do not claim:

``` text
payment = bank settlement
```

Do not claim instant settlement unless explicitly enabled and confirmed
by Razorpay.

------------------------------------------------------------------------

# 16. MONEY CALCULATION

All INR calculations must use paise/integer smallest units.

Example:

``` text
₹1,000 = 100000 paise
```

Do not use floating-point arithmetic for payment amounts.

The backend must calculate the payable amount.

Never trust:

``` text
amount
doctor_amount
commission
transfer_amount
```

from the browser.

------------------------------------------------------------------------

# 17. COMMISSION RULE

Current appointment consultation payment logic intentionally uses:

``` text
commission = 0
doctor share = gross amount
```

Do not reintroduce the old default 10% commission merely because:

``` text
profiles.commission_percent
```

or:

``` text
platform_settings.default_commission_percent
```

still exists.

Those values are currently vestigial for this consultation-payment flow.

Unless the business requirement is explicitly changed:

``` text
Patient appointment payment
        ↓
Doctor amount = consultation amount
        ↓
Platform consultation commission = 0
```

Do not alter subscription-plan payment logic.

------------------------------------------------------------------------

# 18. CREATE PAYMENT ORDER

Update:

``` text
supabase/functions/create-razorpay-order/index.ts
```

but preserve its existing architecture where possible.

Required sequence:

``` text
1. Authenticate request
2. Validate booking payload
3. Resolve doctor server-side
4. Resolve slot server-side
5. Validate amount server-side
6. Resolve doctor's Route Linked Account server-side
7. Check online-payment eligibility
8. Prevent duplicate/expired payment attempts
9. Create Razorpay order using exact current API
10. Configure Route transfer according to current Razorpay documentation
11. Save payment record
12. Return safe checkout data
```

The destination account must be obtained from the database.

Never:

``` ts
const accountId = req.body.razorpay_account_id;
```

Correct principle:

``` text
appointment/booking doctor
        ↓
database doctor
        ↓
doctor Route account
```

------------------------------------------------------------------------

# 19. CRITICAL ROUTE ORDER/TRANSFER RULE

The existing specification may describe a `transfers` property
conceptually.

Do not assume the exact current API shape.

Before coding:

1.  inspect current Razorpay Route docs
2.  inspect installed SDK
3.  verify whether transfer instructions belong on:
    -   order creation
    -   payment creation
    -   separate transfer API
    -   another Route-supported flow
4.  implement the currently documented mechanism

The business requirement is fixed:

``` text
patient payment
        ↓
Route
        ↓
booked doctor's linked account
```

The exact API implementation must follow current official Razorpay
documentation.

------------------------------------------------------------------------

# 20. SERVER-SIDE ROUTING INVARIANT

Before creating a transfer, enforce:

``` text
payment.doctor_id
        ==
appointment.doctor_id
```

and:

``` text
transfer.doctor_id
        ==
appointment.doctor_id
```

and:

``` text
transfer.razorpay_account_id
        ==
doctor's stored Route Linked Account ID
```

If any check fails:

``` text
STOP
DO NOT TRANSFER
CREATE ADMIN/RECONCILIATION ERROR
```

This invariant is mandatory.

------------------------------------------------------------------------

# 21. FRONTEND CHECKOUT

Update the existing:

``` text
src/components/doctor/BookingWidget.tsx
```

without rewriting unrelated booking UI.

The frontend should request the backend payment order.

Backend returns only safe values such as:

``` text
order_id
amount
currency
razorpay_key_id
payment_id
appointment_id
mode
```

Never return:

``` text
RAZORPAY_KEY_SECRET
WEBHOOK_SECRET
```

Open the existing Razorpay Checkout integration.

Do not add another checkout library if the existing integration can be
reused.

------------------------------------------------------------------------

# 22. FRONTEND SUCCESS IS NOT PAYMENT CONFIRMATION

The Razorpay Checkout callback is only an input to backend verification.

Never do:

``` text
frontend callback
        ↓
appointment confirmed
```

Correct:

``` text
frontend callback
        ↓
backend verify
        ↓
provider/webhook state
        ↓
transfer state
        ↓
appointment confirmation
```

------------------------------------------------------------------------

# 23. VERIFY PAYMENT

Update:

``` text
supabase/functions/verify-razorpay-payment/index.ts
```

Required checks:

1.  authenticated request
2.  payment row exists
3.  payment is not already successfully processed
4.  expected order ID matches
5.  returned payment ID is valid
6.  signature is valid
7.  amount matches
8.  currency matches
9.  doctor matches appointment/booking
10. Route destination matches the server-side doctor mapping
11. payment is captured/valid according to current Razorpay API
12. update payment safely
13. create/update transfer state
14. do not duplicate transfer
15. do not confirm appointment prematurely

If the exact Route architecture requires a separate transfer API call
after payment capture, perform that server-side using the documented
API.

------------------------------------------------------------------------

# 24. TRANSFER CREATION

Create a reusable server-side Route service.

Conceptual:

``` text
createDoctorTransfer(payment, appointment, doctor)
```

Responsibilities:

-   load payment
-   load appointment
-   load doctor
-   load Route account
-   verify all mappings
-   verify amount
-   create transfer using official Razorpay API
-   save `razorpay_transfer_id`
-   save status
-   handle idempotency
-   never expose provider secrets

Before creating:

``` text
if transfer already exists and is processed/pending:
    do not create another transfer
```

------------------------------------------------------------------------

# 25. TRANSFER FAILURE

If payment is captured but transfer fails:

``` text
DO NOT falsely show successful doctor payout
DO NOT create duplicate transfer blindly
DO NOT silently lose the payment
DO NOT mark appointment confirmed if the business rule requires transfer first
```

Instead:

``` text
payment = captured
transfer = failed
appointment = pending/payment-processing state
reconciliation = required
```

Store a safe failure reason.

Implement a retry path for transient provider failures.

Permanent failures should create an admin/reconciliation issue.

------------------------------------------------------------------------

# 26. APPOINTMENT STATE MACHINE

Preferred target:

``` text
PENDING_PAYMENT
        ↓
PAYMENT_CAPTURED
        ↓
TRANSFER_PENDING
        ↓
TRANSFER_PROCESSED
        ↓
CONFIRMED
```

Map these states onto the existing database enums/fields rather than
blindly replacing them.

The current schema already uses:

``` text
appointment status:
pending
confirmed
completed
cancelled
no_show
```

and:

``` text
payment status:
pending
paid
refunded
pay_at_clinic
```

Do not create an unnecessary second appointment-status system.

If additional transfer state is required, store it in the dedicated
`transfers` table.

Default confirmation rule:

``` text
verified/captured payment
+
successful Route transfer
=
appointment confirmed
```

------------------------------------------------------------------------

# 27. WEBHOOK ENDPOINT

Update:

``` text
supabase/functions/razorpay-webhook/index.ts
```

Preserve existing payment and RazorpayX payout handling.

Add Route handling.

Required behavior:

``` text
Receive webhook
    ↓
Verify webhook signature
    ↓
Read event ID
    ↓
Check webhook_events
    ↓
Ignore/replay safely if already processed
    ↓
Save event
    ↓
Process event
    ↓
Update payment/transfer/settlement/appointment
    ↓
Mark event processed
```

Use raw request body if required by Razorpay signature verification.

Never process an unverified webhook.

------------------------------------------------------------------------

# 28. PAYMENT WEBHOOK EVENTS

Continue supporting relevant existing events.

For payment capture/failure:

``` text
payment.captured
payment.failed
```

Adapt to the exact currently documented Razorpay event payloads.

Webhook processing must be idempotent.

------------------------------------------------------------------------

# 29. ROUTE TRANSFER WEBHOOK EVENTS

Support the currently documented Route transfer lifecycle events.

Where applicable, process events such as:

``` text
transfer.processed
transfer.failed
```

Do not assume these are the only current event names.

Verify exact event names from current official Razorpay documentation.

For processed:

``` text
find transfer
verify mapping
update transfer
update appointment if eligible
trigger existing notifications
```

For failed:

``` text
find transfer
update transfer failed
store safe reason
keep payment record intact
create reconciliation condition
do not falsely confirm
```

------------------------------------------------------------------------

# 30. WEBHOOK IDEMPOTENCY

For every webhook:

``` text
event_id = provider event ID
```

If already processed:

``` text
return success
```

Do not execute business logic twice.

Also make payment and transfer operations themselves idempotent.

A retry must not create:

``` text
two appointments
two transfers
two invoices
two ledger rows
```

for one payment.

------------------------------------------------------------------------

# 31. PAYMENT + TRANSFER DATABASE TRANSACTION

Use database transactions/atomic operations where supported.

Example conceptual logic:

``` text
BEGIN

verify payment

if payment already captured:
    safely continue/idempotent

update payment

create transfer record if missing

COMMIT
```

External Razorpay API calls cannot always be rolled back by a DB
transaction.

Therefore design explicit recovery/reconciliation logic.

Never assume:

``` text
DB rollback = Razorpay rollback
```

------------------------------------------------------------------------

# 32. SLOT CONCURRENCY

Do not introduce double booking while changing payment flow.

The system must protect against:

``` text
Patient A books 10:00
Patient B books 10:00
```

at the same time.

Inspect the existing slot availability/RPC/constraint logic.

Reuse it.

If required, implement a durable pending appointment/payment reservation
with expiration.

An abandoned payment must not permanently block a slot.

------------------------------------------------------------------------

# 33. PAYMENT EXPIRATION

If a payment attempt remains abandoned:

``` text
created
```

for too long, implement expiration according to the existing booking
rules.

Possible flow:

``` text
created
   ↓
expired
```

If the database enum does not support `expired`, use the existing schema
conventions or add a safe payment-attempt status.

Do not add an unnecessary state if current architecture can handle
expiration with timestamps.

------------------------------------------------------------------------

# 34. REFUNDS

Update:

``` text
supabase/functions/refund-payment/index.ts
```

Implement live refund behavior using the current official Razorpay API.

Required checks:

-   authenticated admin/authorized actor
-   payment exists
-   payment belongs to correct appointment
-   payment is refundable
-   refund amount does not exceed refundable amount
-   duplicate refund is prevented

Important:

``` text
Payment refund
```

and:

``` text
Route transfer reversal
```

may be different provider operations.

Inspect current Razorpay Route documentation and implement the correct
reversal/refund relationship.

Never simply mark a payment as refunded locally before the provider
operation succeeds in live mode.

Mock mode may simulate the complete state transition.

------------------------------------------------------------------------

# 35. REFUND STATE

Target conceptual flow:

``` text
Payment captured
     ↓
Doctor transfer processed
     ↓
Refund requested
     ↓
Provider refund/reversal
     ↓
Transfer/payment state updated
     ↓
Appointment payment_status = refunded
```

The exact provider sequence must follow current Razorpay documentation.

If refund/reversal fails:

``` text
do not falsely mark refunded
```

Store failure/reconciliation information.

------------------------------------------------------------------------

# 36. SETTLEMENT AND UTR

Settlement is not the same as payment capture.

The system should distinguish:

``` text
Payment Captured
Transfer Processed
Settlement Pending
Settlement Processed
UTR Available
```

If Razorpay provides settlement/UTR data for the Route flow through
APIs/webhooks, synchronize it.

Store:

``` text
razorpay_settlement_id
utr
amount
fee
tax
status
processed_at
```

Do not fabricate UTR values.

Do not mark settlement complete just because payment is captured.

------------------------------------------------------------------------

# 37. OLD RAZORPAYX PAYOUT SYSTEM

Existing:

``` text
doctor_ledger
payouts
doctor_bank_accounts
calculate-monthly-earnings
create-doctor-payout
add-doctor-bank-account
```

was designed for:

``` text
Patient payment
   ↓
Platform Razorpay
   ↓
Ledger
   ↓
Monthly payout
   ↓
RazorpayX
```

The new Route appointment-payment flow is:

``` text
Patient payment
   ↓
Route
   ↓
Doctor Linked Account
```

Therefore:

### Do NOT use RazorpayX monthly payout as the normal destination for new Route appointment payments.

Do not automatically delete the old tables/functions.

They may contain historical data or support legacy flows.

Before changing/removing any old payout behavior:

1.  inspect all callers
2.  determine whether historical records depend on it
3.  preserve data
4.  separate legacy payout logic from the new Route flow
5.  document any deprecation

------------------------------------------------------------------------

# 38. DOCTOR LEDGER

The existing ledger can remain for:

-   historical reporting
-   accounting/audit
-   legacy payouts if still needed

But do not make the new Route payment depend on:

``` text
monthly payout
```

for normal doctor receipt.

If ledger entries are retained for reporting, add enough transfer
references to reconcile:

``` text
payment
→ transfer
→ settlement
```

Do not mark:

``` text
ledger.paid = true
```

merely because payment was captured.

Use the correct meaning for the existing field after inspecting current
consumers.

------------------------------------------------------------------------

# 39. INVOICES

Reuse the existing invoice system.

Do not create duplicate invoices.

Ensure one appointment cannot generate duplicate invoice records.

Existing uniqueness:

``` text
appointment_id UNIQUE
```

must remain protected.

Generate/update invoice only at the correct payment/appointment state.

Do not generate a paid invoice for a payment that has actually failed.

------------------------------------------------------------------------

# 40. SUBSCRIPTION PLAN PAYMENTS

Do not break:

``` text
plan_upgrade_payments
create-plan-upgrade-order
verify-plan-upgrade-payment
```

These are platform subscription payments and are separate from patient
appointment payments.

Do NOT route subscription payments to doctors.

There must remain a clear distinction:

``` text
Doctor subscription payment
        ↓
Doctylia platform

Patient appointment payment
        ↓
Booked doctor's Route Linked Account
```

------------------------------------------------------------------------

# 41. MOCK PAYMENT MODE

The current project has mock payment support.

Retain it.

Extend mock mode so developers can test the complete Route lifecycle
without live money.

Mock flow should simulate:

``` text
doctor linked account ACTIVE
        ↓
mock order
        ↓
mock checkout
        ↓
mock payment capture
        ↓
mock transfer
        ↓
mock transfer processed
        ↓
appointment confirmed
```

Also test:

``` text
payment failed
transfer failed
webhook retry
duplicate webhook
refund
reversal
doctor not eligible
missing linked account
```

Do not pretend a mock transaction is a real Razorpay transaction.

Clearly keep:

``` text
is_mock = true
```

or equivalent existing flag.

------------------------------------------------------------------------

# 42. PAYMENT MODE

Reuse:

``` text
get-payment-mode
```

and the existing environment conventions.

Do not hard-code production credentials.

Live mode must require server-side environment secrets.

Mock mode must not accidentally use live money.

------------------------------------------------------------------------

# 43. ENVIRONMENT VARIABLES

Use the existing environment-variable naming convention.

At minimum, keep secrets server-side:

``` text
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
```

Use existing names if the repository already defines them.

Never put:

``` text
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
```

in:

``` text
VITE_*
frontend source
browser local storage
client response
```

Only the public key ID may be exposed where Razorpay Checkout requires
it.

------------------------------------------------------------------------

# 44. SECURITY

Mandatory:

-   server-side authentication
-   server-side authorization
-   server-side amount calculation
-   server-side doctor mapping
-   server-side Route account lookup
-   Razorpay payment signature verification
-   webhook signature verification
-   idempotency
-   input validation
-   RLS
-   least privilege
-   safe error messages
-   no sensitive logging

Never log:

``` text
Razorpay secret
webhook secret
full bank account number
full KYC data
payment credentials
card data
```

Never accept destination account from:

``` text
req.body
URL parameter
frontend state
localStorage
```

------------------------------------------------------------------------

# 45. RLS

Add appropriate RLS policies for new tables.

Doctor:

``` text
can read own payment-account status
```

Admin:

``` text
can inspect all payment/transfer/reconciliation information
```

Patient:

``` text
can access only their own payment/appointment information
```

Service role:

``` text
can perform trusted payment/webhook operations
```

Do not grant broad write permissions to anonymous users.

Webhook processing should use the secure server-side mechanism already
used by the project.

------------------------------------------------------------------------

# 46. ADMIN PAYMENT/RECONCILIATION

Add or extend the existing admin payment area.

Admin should be able to see:

``` text
Payment ID
Appointment
Doctor
Amount
Payment Status
Transfer ID
Transfer Status
Linked Account
Settlement ID
Settlement Status
UTR
Refund Status
Created At
Updated At
```

Useful filters:

``` text
Payment Failed
Transfer Failed
Transfer Pending
Settlement Pending
Refund Failed
Doctor Payment Account Inactive
```

Do not expose sensitive KYC/bank information unnecessarily.

------------------------------------------------------------------------

# 47. DOCTOR PAYMENT STATUS

Doctor should be able to see:

``` text
Route Account: Connected / Not Connected
Activation: Active / Pending / Action Required
Bank Verification: Verified / Pending
Online Payments: Enabled / Disabled
```

If action is required:

``` text
show safe provider/application message
```

Do not show raw API responses containing sensitive information.

------------------------------------------------------------------------

# 48. ERROR HANDLING

Use existing project error conventions.

Errors should be meaningful.

Examples:

``` text
ONLINE_PAYMENT_NOT_ENABLED
DOCTOR_PAYMENT_ACCOUNT_NOT_CONNECTED
DOCTOR_PAYMENT_ACCOUNT_NOT_ACTIVE
PAYMENT_AMOUNT_MISMATCH
PAYMENT_SIGNATURE_INVALID
PAYMENT_ALREADY_PROCESSED
TRANSFER_ALREADY_EXISTS
TRANSFER_FAILED
WEBHOOK_SIGNATURE_INVALID
WEBHOOK_ALREADY_PROCESSED
REFUND_NOT_ALLOWED
```

Do not expose internal stack traces to patients.

Log technical details server-side in a safe manner.

------------------------------------------------------------------------

# 49. RETRIES

Implement retries only for transient failures.

Examples:

``` text
network timeout
temporary provider error
rate limit
temporary database conflict
```

Do not blindly retry:

``` text
invalid account
invalid amount
invalid signature
authorization failure
permanent validation error
```

Use exponential backoff where appropriate.

Prevent retry storms.

------------------------------------------------------------------------

# 50. RATE LIMITING / SCALE

Target architecture:

``` text
10,000+ doctors
high appointment volume
many payment attempts
many webhook events
```

Use:

-   indexed lookup columns
-   pagination
-   batch processing
-   asynchronous processing where appropriate
-   retry queues/jobs where available
-   webhook idempotency
-   no N+1 queries
-   efficient doctor/account lookup
-   no synchronous mass onboarding

Do not onboard thousands of doctors inside one request.

------------------------------------------------------------------------

# 51. 24-HOUR / PROVIDER COOLING PERIOD

The previous design specification referenced a Route cooling period for
newly created Linked Accounts.

Do not hard-code this as an assumed universal rule.

Verify current Razorpay documentation.

If the provider currently imposes a cooling/activation period:

``` text
Account created
    ↓
Provider processing/cooling
    ↓
Account eligible
    ↓
Online payments enabled
```

The application must respect provider status.

Never enable online payment just because the local record says:

``` text
account_created = true
```

------------------------------------------------------------------------

# 52. API/EDGE FUNCTION STRUCTURE

Follow existing Supabase Edge Function conventions.

Expected additions/updates may include:

``` text
supabase/functions/create-doctor-linked-account/
supabase/functions/get-doctor-payment-status/
supabase/functions/create-razorpay-order/
supabase/functions/verify-razorpay-payment/
supabase/functions/razorpay-webhook/
supabase/functions/refund-payment/
```

Names may be adapted if the repository has an established naming
pattern.

Do not duplicate an existing helper if `_shared` already contains
reusable Razorpay/auth utilities.

Create a reusable Razorpay server helper if one does not already exist.

------------------------------------------------------------------------

# 53. SHARED RAZORPAY SERVICE

Prefer one server-side wrapper for:

``` text
createOrder
fetchPayment
verifyPaymentSignature
createLinkedAccount
createStakeholder
createRouteProduct
updateRouteProduct
getLinkedAccount
createTransfer
fetchTransfer
createRefund
fetchSettlement
```

Only implement operations actually required by the current API.

Centralize:

-   authentication
-   base URL
-   request headers
-   timeout
-   safe error normalization
-   retry behavior
-   logging redaction

Do not duplicate raw fetch/authentication code across every Edge
Function.

------------------------------------------------------------------------

# 54. DATABASE CONSTRAINTS

Add appropriate uniqueness/indexes.

Important examples:

``` text
doctor_id unique for one active Route account
razorpay_account_id unique
razorpay_transfer_id unique
razorpay_event_id unique
appointment_id unique where business logic requires one payment/transfer
```

Do not create constraints that break legitimate multiple payment
attempts for one appointment.

Multiple failed/abandoned payment attempts may be legitimate.

The final successful payment must be unique.

------------------------------------------------------------------------

# 55. DUPLICATE PAYMENT PROTECTION

A patient may:

``` text
click Pay twice
refresh checkout
retry after network timeout
receive duplicate frontend callback
```

The backend must remain safe.

Before creating a new payment:

``` text
check for active existing payment attempt
```

Before confirming:

``` text
check appointment/payment state
```

Before transferring:

``` text
check transfer table
```

Before processing webhook:

``` text
check webhook event table
```

------------------------------------------------------------------------

# 56. FRONTEND PAYMENT STATES

The patient UI should handle:

``` text
Preparing payment
Opening checkout
Payment processing
Payment verification
Doctor transfer processing
Appointment confirmed
Payment failed
Transfer delayed
Payment/refund issue
```

Do not show:

``` text
Appointment Confirmed
```

before backend confirmation.

If transfer is temporarily pending, show a safe status instead of
falsely claiming success.

------------------------------------------------------------------------

# 57. PATIENT SUCCESS

After the appointment is actually confirmed:

``` text
Payment Successful

Appointment Confirmed

Doctor: Dr. [Name]
Date: [Date]
Time: [Time]
Amount: ₹[Amount]
Appointment ID: [ID]
```

Reuse the existing appointment confirmation/success UI where possible.

Do not rebuild the whole booking UI.

------------------------------------------------------------------------

# 58. PAYMENT SLIP / APPOINTMENT SLIP

Preserve the existing Doctylia appointment/payment-slip design if
already implemented.

Payment/appointment records must use the actual:

``` text
payment amount
appointment
doctor
payment ID/order ID where appropriate
```

Do not display secret provider fields.

If QR/invoice functionality already exists, reuse it.

------------------------------------------------------------------------

# 59. NOTIFICATIONS

Reuse existing notification architecture.

Trigger notifications only from trusted backend state.

Examples:

``` text
appointment confirmed
payment failed
refund processed
```

Do not trigger "payment successful" solely from a frontend callback.

------------------------------------------------------------------------

# 60. AUDIT TRAIL

For important payment events, preserve enough information to answer:

``` text
Who paid?
Which appointment?
Which doctor?
Which Linked Account?
Which Razorpay order?
Which Razorpay payment?
Which transfer?
Which settlement?
Which UTR?
Was it refunded/reversed?
```

Do not store unnecessary sensitive payloads.

Redact sensitive provider data.

------------------------------------------------------------------------

# 61. LEGACY MIGRATION SAFETY

Before migrations:

1.  inspect production-like schema
2.  inspect current data
3.  add nullable columns first where needed
4.  backfill only safe deterministic values
5.  add constraints after backfill
6.  do not delete historical payout records
7.  do not rename existing columns unless required
8.  do not change existing enums destructively

All migrations must be reversible or have a documented recovery path
where practical.

------------------------------------------------------------------------

# 62. EXISTING `doctor_bank_accounts`

Do not automatically delete:

``` text
account_number
ifsc
upi_id
razorpay_contact_id
razorpay_fund_account_id
```

because existing code/history may depend on them.

However:

``` text
Route Linked Account ID
```

must remain logically separate.

If the new system makes these fields unnecessary for future appointment
payments, leave the legacy system intact unless a safe deprecation is
explicitly justified.

------------------------------------------------------------------------

# 63. NO MANUAL MONTHLY PAYOUT FOR NEW ROUTE PAYMENTS

After Route integration, a new appointment payment should NOT follow:

``` text
Patient
 ↓
Platform
 ↓
doctor_ledger
 ↓
monthly payouts
 ↓
RazorpayX
```

as the primary payment-routing mechanism.

It should follow:

``` text
Patient
 ↓
Razorpay
 ↓
Route
 ↓
Doctor Linked Account
```

Settlement may then occur according to Razorpay's actual settlement
process.

------------------------------------------------------------------------

# 64. DO NOT CLAIM "INSTANT BANK PAYMENT"

Do not display or document:

``` text
Money instantly reaches doctor's bank
```

unless the actual provider account is explicitly enabled for the
relevant capability and the provider confirms it.

Use accurate terminology:

``` text
Payment captured
Transfer processed
Settlement pending/processed
```

------------------------------------------------------------------------

# 65. TEST CASES --- REQUIRED

Implement/test at minimum:

## Doctor account

-   no linked account
-   linked account created
-   account processing
-   account active
-   account needs clarification
-   account suspended
-   account failed
-   payment disabled

## Payment

-   valid payment
-   invalid signature
-   wrong order ID
-   wrong amount
-   wrong currency
-   duplicate verification
-   payment failed
-   payment timeout
-   duplicate checkout callback

## Routing

-   Doctor A payment → Doctor A account
-   Doctor B payment → Doctor B account
-   Doctor A must never receive Doctor B's payment
-   missing Route account
-   inactive Route account
-   mismatched doctor/account mapping
-   duplicate transfer prevention

## Webhooks

-   valid payment webhook
-   invalid webhook signature
-   duplicate webhook
-   transfer processed
-   transfer failed
-   settlement event if supported
-   webhook retry after failure

## Refund

-   valid refund
-   duplicate refund
-   refund after failed payment
-   transfer reversal path
-   provider refund failure

## Booking

-   slot available
-   slot already taken
-   concurrent booking
-   abandoned payment
-   successful payment
-   payment failure
-   transfer failure

## Mock mode

All critical scenarios above must be testable without real money.

------------------------------------------------------------------------

# 66. ACCEPTANCE CRITERIA

The feature is NOT complete if only:

``` text
Razorpay Checkout opens
```

It is complete only when the following works:

``` text
Doctor onboarding
      ↓
Linked Account created
      ↓
Provider status synchronized
      ↓
Doctor becomes payment eligible
      ↓
Patient selects Doctor A
      ↓
Appointment/slot is safely reserved
      ↓
Backend resolves Doctor A
      ↓
Backend resolves Doctor A's Linked Account
      ↓
Razorpay order created using documented Route architecture
      ↓
Patient pays
      ↓
Backend verifies payment
      ↓
Route transfer is created/confirmed
      ↓
Transfer webhook is processed idempotently
      ↓
Appointment becomes confirmed
      ↓
Settlement can be tracked
      ↓
UTR can be reconciled where provider data is available
      ↓
Refund/reversal can be handled safely
```

------------------------------------------------------------------------

# 67. REQUIRED FILE-BY-FILE IMPLEMENTATION PLAN

Claude should inspect and then implement changes approximately in this
order:

### Phase 1 --- Inspect

-   existing payment functions
-   migrations
-   BookingWidget
-   settings
-   auth/RLS
-   Razorpay helper
-   mock payment flow

### Phase 2 --- Database

Add/extend:

``` text
doctor Route account storage
payments
transfers
webhook events
settlements
indexes
constraints
```

### Phase 3 --- Razorpay server integration

Implement verified helpers for:

``` text
Linked Account
Stakeholder
Route Product
Account status
Order
Payment verification
Transfer
Refund/reversal
Settlement
```

Only implement APIs currently supported by Razorpay.

### Phase 4 --- Doctor onboarding

Implement:

``` text
create linked account
sync status
payment eligibility
```

### Phase 5 --- Patient payment

Update:

``` text
create-razorpay-order
BookingWidget
verify-razorpay-payment
```

### Phase 6 --- Webhooks

Update:

``` text
razorpay-webhook
```

Add:

``` text
event idempotency
transfer handling
settlement handling where supported
```

### Phase 7 --- Refunds

Update:

``` text
refund-payment
```

### Phase 8 --- UI

Update:

``` text
doctor Settings
admin payment/reconciliation
patient booking/payment status
```

### Phase 9 --- Mock mode

Extend mock lifecycle.

### Phase 10 --- Tests

Run unit/integration/type/lint/build/database tests.

------------------------------------------------------------------------

# 68. REQUIRED VALIDATION BEFORE COMPLETION

Claude must run, where available:

``` text
TypeScript typecheck
Lint
Build
Unit tests
Integration tests
Supabase migration validation
Edge Function validation
```

Also manually inspect:

``` text
Doctor A → Doctor A transfer
Doctor B → Doctor B transfer
```

and verify no cross-doctor routing is possible.

------------------------------------------------------------------------

# 69. FINAL SECURITY REVIEW

Before saying complete, verify:

``` text
[ ] No Razorpay secret in frontend
[ ] No webhook secret in frontend
[ ] No patient-selected destination account
[ ] No client-trusted amount
[ ] No client-only appointment confirmation
[ ] Payment signature verified
[ ] Webhook signature verified
[ ] Webhook idempotency implemented
[ ] Transfer idempotency implemented
[ ] Doctor/account mapping verified server-side
[ ] Duplicate appointments prevented
[ ] Duplicate transfers prevented
[ ] Sensitive logging removed
[ ] RLS reviewed
[ ] Admin authorization reviewed
```

------------------------------------------------------------------------

# 70. FINAL BUSINESS FLOW

The final system should behave like:

``` text
                    DOCTYLIA
                       |
              Primary Razorpay Account
                       |
          +------------+------------+
          |            |            |
       Doctor A     Doctor B     Doctor C
       Linked       Linked       Linked
       Account      Account      Account
          |            |            |
          +------------+------------+
                       |
                    Patients
                       |
                 Book Appointment
                       |
                 Razorpay Checkout
                       |
                 Payment Captured
                       |
                 Route Transfer
                       |
              Correct Doctor Account
                       |
                 Transfer Webhook
                       |
               Appointment Confirmed
                       |
              Settlement Reconciliation
                       |
                       UTR
```

The critical invariant remains:

``` text
Appointment Doctor
       ==
Payment Doctor
       ==
Transfer Doctor
       ==
Razorpay Linked Account
```

------------------------------------------------------------------------

# 71. DO NOT IMPLEMENT THESE ANTI-PATTERNS

Never implement:

``` text
Patient chooses Razorpay destination account
```

Never implement:

``` text
Frontend says payment successful → appointment confirmed
```

Never implement:

``` text
Doctor A's payment → Doctor B's account
```

Never implement:

``` text
One separate primary Razorpay merchant account per doctor
```

Never implement:

``` text
Hard-coded doctor IDs
```

Never implement:

``` text
Hard-coded unlimited provider capacity
```

Never implement:

``` text
Fake live Razorpay transfer
```

Never implement:

``` text
Fake settlement/UTR
```

Never implement:

``` text
Secrets in frontend
```

Never implement:

``` text
Duplicate doctor/profile tables
```

Never implement:

``` text
Delete historical payout data without migration justification
```

Never implement:

``` text
Automatic monthly RazorpayX payout as the normal destination of a new Route appointment payment
```

------------------------------------------------------------------------

# 72. IMPORTANT IMPLEMENTATION OUTPUT

After implementation, report:

## A. Files changed

List every changed/created file.

## B. Database migrations

List every migration and what it changes.

## C. Razorpay APIs used

List:

``` text
endpoint
purpose
request/response shape
```

using the current verified Razorpay documentation.

## D. Payment flow

Explain:

``` text
Patient → Order → Payment → Verification → Transfer → Webhook → Appointment
```

## E. Existing legacy flow

Explain what remains from:

``` text
doctor_ledger
payouts
doctor_bank_accounts
RazorpayX
```

and why.

## F. Environment variables

List names only.

Never print secret values.

## G. Tests

Report:

``` text
passed
failed
not available
```

## H. Known limitations

Clearly list any provider/account activation dependency or API
limitation.

------------------------------------------------------------------------

# 73. FINAL DEFINITION OF DONE

Do not say:

``` text
Payment integration complete
```

until all applicable requirements in this document are implemented and
tested.

The final production architecture must support:

``` text
One primary Razorpay account
+
Many doctor Linked Accounts
+
Server-side doctor routing
+
Secure patient checkout
+
Payment verification
+
Route transfer
+
Transfer webhook
+
Webhook idempotency
+
Settlement tracking where supported
+
UTR reconciliation where supported
+
Refund/reversal handling
+
Mock testing
+
10,000+ doctor-scale application architecture
```

The implementation must preserve existing Doctylia functionality and
must not break:

``` text
appointments
slot availability
patient booking
doctor profiles
doctor settings
subscription payments
invoices
existing historical payout records
mock payment mode
authentication
RLS
```

**Implement the complete payment-routing system, not just the Razorpay
Checkout button.**
