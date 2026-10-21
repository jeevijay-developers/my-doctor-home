# Doctylia Practice Management & Patient Payments

Doctylia is a multi-tenant practice-management and booking platform where doctors offer consultations and clinical services on their branded websites and collect online payments routed through Razorpay Route.

## Language

**Service**:
A bookable clinical offering or consultation defined by a doctor with a delivery type (`clinic`, `online`, or `both`), duration, and authoritative price.
_Avoid_: Product, item, treatment package, offering

**Gross Consultation Fee**:
The full authoritative price in INR charged to the patient for a booked **Service** or standard consultation before any platform deductions.
_Avoid_: Subtotal, base price, patient fee, order total

**Platform Charge (Commission)**:
The percentage-based service fee (`commission_percent` / `commission_amount`) retained by Doctylia's primary Razorpay account from an online **Gross Consultation Fee**.
_Avoid_: Take rate, convenience fee, processing fee, markup

**Doctor Net Share**:
The remaining portion of the **Gross Consultation Fee** (`doctor_share` = **Gross Consultation Fee** minus **Platform Charge (Commission)**) credited to the doctor's **Linked Account**.
_Avoid_: Net payout, doctor cut, take-home pay, net revenue

**Linked Account**:
A doctor's onboarded Razorpay Route sub-merchant account (`acc_...`) verified with KYC and bank details to receive **Route Transfers**.
_Avoid_: Sub-account, connected account, vendor account, RazorpayX contact

**Route Transfer**:
An automated split-payment instruction (`transfers[]`) attached to a Razorpay Order that routes the **Doctor Net Share** from a captured payment directly to the doctor's **Linked Account**.
_Avoid_: Manual payout, bank wire, disbursement, remittance

**Settlement (T+2)**:
The automated clearing of a processed **Route Transfer** from the doctor's **Linked Account** to their verified bank account on Razorpay's standard T+2 business-day schedule.
_Avoid_: Withdrawal, cashout, manual settlement

**Pay at Clinic**:
An appointment payment mode where the patient pays the doctor directly at the clinic and no online order, **Platform Charge (Commission)**, or **Route Transfer** is processed through Doctylia.
_Avoid_: Cash on delivery, offline checkout, post-paid booking

**Full Reversal Refund**:
A patient refund initiated with `reverse_all: 1` that returns 100% of the **Gross Consultation Fee** to the patient while reversing the corresponding **Route Transfer** from the doctor's **Linked Account**.
_Avoid_: Chargeback, clawback, partial reversal, credit note

## Relationships

- A **Doctor** offers one or more **Services**, each with an authoritative **Gross Consultation Fee**
- An online **Payment** splits the **Gross Consultation Fee** into one **Platform Charge (Commission)** and one **Doctor Net Share**
- An online **Payment** creates one **Route Transfer** targeting the doctor's **Linked Account** for the **Doctor Net Share**
- A processed **Route Transfer** completes via **Settlement (T+2)** into the doctor's bank account
- A **Full Reversal Refund** reverses the **Route Transfer** and zeroes out both the **Platform Charge (Commission)** and **Doctor Net Share** in the doctor ledger
- A **Pay at Clinic** appointment bypasses online **Payment**, **Platform Charge (Commission)**, and **Route Transfer** entirely

## Example dialogue

> **Dev:** "When a patient books a **Service** online for ₹1,000 with a 10% **Platform Charge (Commission)**, how much do we send in the **Route Transfer**?"
> **Domain expert:** "The patient pays the ₹1,000 **Gross Consultation Fee**. We retain ₹100 as the **Platform Charge (Commission)** and attach a **Route Transfer** of ₹900 — the **Doctor Net Share** — to the doctor's **Linked Account**, which reaches their bank via **Settlement (T+2)**. If the appointment is later cancelled and refunded, we trigger a **Full Reversal Refund** so the patient gets ₹1,000 back and the ₹900 **Route Transfer** is pulled back from the **Linked Account**."

## Flagged ambiguities

- "Payout" was previously used to mean both manual monthly RazorpayX disbursements and automated Razorpay Route splits — resolved: automated order-time splits are **Route Transfers** that clear via **Settlement (T+2)**, whereas "Payout" refers only to legacy manual disbursements.
- "Invoice amount" was ambiguous between what the patient paid and what the doctor earned — resolved: patient-facing invoices always display the **Gross Consultation Fee**, while internal doctor billing views break down **Gross Consultation Fee**, **Platform Charge (Commission)**, and **Doctor Net Share**.
