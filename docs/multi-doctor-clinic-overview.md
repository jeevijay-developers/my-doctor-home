# Multi-doctor clinics on Doctylia — how it will work

*A plain-language guide for managers and the business team. The technical design is in `docs/superpowers/specs/2026-11-25-multi-doctor-clinic-design.md`.*

---

## 1. The idea in one paragraph

Today, one Doctylia account is one doctor. Many of our customers, though, are **polyclinics**: one clinic with several doctors (say a GP, a skin specialist and a child specialist) sharing a reception desk. With this feature, a clinic keeps **one account, one website, one reception desk and one patient list**. Inside it, **each doctor has their own timings, their own queue, their own fee and their own prescriptions**.

## 2. Who is it for?

- **Yes:** clinics at **one location** with **2 to 15 doctors**.
- **Not yet:** clinic chains with several branches, or one doctor who works at several separate clinics with a single login. Those come later.
- **Existing single-doctor customers notice nothing.** Their screens, website and Google listing stay exactly as they are until they add a second doctor.

## 3. Who's who inside a clinic

```
Clinic (the account)
 ├── Owner         – runs the clinic; sees and controls everything
 ├── Doctors       – see patients; each has their own timings, queue and fee
 └── Staff         – reception, billing, etc.; no access to medical details
```

| Person | Can do | Cannot do |
|---|---|---|
| **Owner** | Everything: add or remove doctors, settings, all money, all records | — |
| **Doctor** | Their own queue, prescriptions and patients' medical details; see other doctors' schedules if the owner allows | Change clinic settings or billing (unless the owner allows); edit another doctor's prescription |
| **Reception / staff** | Book for any doctor, run all queues, take payments | See prescriptions or medical history (unless specially allowed) |

Notes:
- **The owner can be a doctor too**, or purely the manager.
- **A doctor doesn't need a login.** For example, a visiting specialist who comes on Saturdays: reception manages their bookings for them.
- **Ownership stays with the owner's account.** If the owner leaves or sells the clinic, our support team helps move it. The owner can name a trusted co-admin who has full access.

## 4. Module by module

### 4.1 Doctors (new module)
A new **"Doctors"** page in the admin panel. Here the owner:
- adds a doctor (name, photo, specialty, qualifications, registration number, signature, fee, appointment length)
- sets that doctor's **weekly timings and leave days**
- gives the doctor a **login** (phone number + OTP, like staff today), or none
- chooses whether the doctor **takes online bookings** and **appears on the website and in search**
- sees how many **doctor seats** are used and buys more

**When a doctor leaves:** the system won't let the owner simply switch them off while patients are still booked with them. The owner first **moves those bookings to another doctor** (patients are informed), or cancels them. After that the doctor's login is closed, and their web page sends visitors to the clinic page. **Their old prescriptions stay in the records** with their name on them, because these are legal medical records.

### 4.2 Appointments
- Every appointment is **with a specific doctor**.
- Reception picks the doctor when booking. The calendar can show **all doctors** (colour-coded) or **one doctor**.
- **Two doctors can see patients at the same time**: 10:00 with Dr A and 10:00 with Dr B are both fine. The same doctor can't be double-booked.
- A patient can see two doctors on the same day (e.g. GP, then skin specialist).
- Reception can **move an appointment to another doctor** if needed.
- Patients who reschedule themselves online stay with the **same doctor**. Changing doctor goes through reception.

### 4.3 Live queue (token system)
- **Each doctor has their own queue and token numbers**: Dr A's token 5 and Dr B's token 5 are different patients.
- **Reception** sees a tab per doctor plus an "All" overview.
- **A doctor** opens straight into **their own queue**.
- If a doctor is running late, reception can **transfer a waiting patient** to another doctor. The patient goes to the end of that doctor's queue.
- The **waiting-room TV screen** can show all doctors side by side, or one doctor per screen. As today it shows only token numbers, plus a shortened name for the patient currently inside (e.g. "Aaryan K.").

### 4.4 Patients
- **One shared patient list for the whole clinic.** A patient registered by the GP is already there when they visit the skin specialist. No duplicates, one history.
- Each visit shows **which doctor** saw the patient.
- Patient import and export, limits, and duplicate protection all work the same as today, for the whole clinic.

### 4.5 Medical records & privacy
The owner chooses one of two settings:

| Setting | What doctors see |
|---|---|
| **Shared** (default) | Every doctor in the clinic can see every patient's medical records, which is best for joint care. |
| **Own patients only** | A doctor sees records only for patients they have seen or have booked. A covering doctor automatically gets access to today's patients. |

In both settings:
- **Allergies and medical history are always visible to the treating doctor.** That's a patient-safety rule.
- **Reception never sees medical details** unless the owner specially allows it.
- In "own patients only" mode, the system **logs who opened which record**, so the owner can check. This supports India's data-protection law (DPDP Act), which expects "need to know" access.

### 4.6 Prescriptions
- Every prescription carries the **name, registration number and signature of the doctor who wrote it**. This is a legal requirement, and it now works per doctor.
- **Only the doctor who wrote a prescription (or the owner) can change it.** Other doctors can read it.
- If reception types a prescription on a doctor's behalf, they must choose which doctor it's for.
- Sharing a prescription with the patient on WhatsApp works as today. The shared slip shows the right doctor.

### 4.7 Billing & payments
- **The clinic collects all money**, both online and at the counter, into the clinic's existing payment account. Nothing changes in how payouts reach the clinic.
- Each doctor can have **their own consultation fee**. The website and the online payment use the right fee automatically.
- New **"by doctor" reports** show revenue, visits, no-shows and payment modes per doctor. The owner uses these to pay their doctors; many clinics pay visiting doctors a share.
- A doctor sees billing only if the owner allows it, and then can be limited to **their own** revenue.
- *Later:* automatic splitting of each payment straight to each doctor's bank account.

### 4.8 The clinic website & online booking
- The clinic's website becomes a **clinic page** with an **"Our Doctors"** section: photo, specialty, fee and next free time for each doctor.
- **Patient booking flow:** **choose doctor → choose service → choose time → enter details / pay.**
- **Each doctor gets their own page** on the clinic's site, e.g. `.../dr/sharma-clinic/doctor/dr-priya`, with their profile, timings, reviews and a "Book" button. Patients can be sent straight to it.
- Services that only one doctor offers (e.g. laser treatment) are shown only for that doctor.
- The clinic's opening hours on the website are worked out from all doctors' timings.

### 4.9 Google & doctor search (SEO)
- Google sees the clinic as a **clinic** with several doctors working there, and sees **each doctor as a doctor** with their own page.
- In Doctylia's **"Find a doctor" directory**, **each doctor appears separately**, so a 5-doctor clinic gets 5 listings, which means more ways for patients to find it.
- Single-doctor clinics' Google pages **don't change at all**, so there's no risk to their current ranking.

### 4.10 Blog / health articles
- Each article shows the **doctor who wrote it** (important for Google trust), not just the clinic.

### 4.11 Reviews
- Patients can review a **specific doctor**, so each doctor's page can show their own rating. The clinic keeps its overall rating.

### 4.12 Staff
- Works as today. The owner adds reception or billing staff with chosen permissions.
- New ready-made role templates: **"Doctor"** and **"Reception"**, so setup is quick and reception never accidentally gets medical access.

### 4.13 Notifications
- A new booking alerts **that doctor**, plus the owner and reception.
- Problems like a **paid no-show** go to the owner.

### 4.14 Plans & pricing
- **Multi-doctor is a Premium feature.**
- Premium includes **1 doctor**. Each **extra doctor is a monthly add-on**. The price is a setting our team can change at any time, and it isn't fixed yet.
- Staff logins stay free.
- **Free trial** clinics can try one extra doctor.
- **If a clinic downgrades or its plan expires:** nothing is deleted. Doctors beyond the plan's limit simply stop taking *new* bookings; existing bookings still happen. The owner chooses which doctors stay bookable.
- Special deals (custom plans) can include an agreed number of doctors.

### 4.15 Doctylia's own admin team (superadmin)
- The clinics list shows **how many doctors** each clinic has and how many seats it pays for.
- Our team can **add seats manually** for a clinic. This is how we'll sell it at first, before self-service checkout is ready.

## 5. A day in a polyclinic (example)

**Sharma Polyclinic:** Dr Sharma (GP, owner), Dr Priya (skin), Dr Khan (child specialist, Saturdays only, no login).

1. **Morning:** a patient books **Dr Priya at 11:00** on the website and pays online. The money goes to the clinic. Dr Priya and reception get a notification.
2. **10:00:** reception opens the queue. Dr Sharma's queue and Dr Priya's queue run side by side, each with its own tokens. The TV shows both.
3. **10:30:** Dr Sharma is delayed. Reception **transfers** one waiting patient to another free GP.
4. **11:00:** Dr Priya calls her token 1. She sees the patient's **allergy noted by Dr Sharma last month**, writes a prescription (with her own signature and registration number) and shares it on WhatsApp.
5. **Saturday:** reception runs **Dr Khan's** queue and types his prescriptions "on behalf of Dr Khan".
6. **Month end:** the owner opens **Billing → by doctor** and sees each doctor's earnings to settle their share.

## 6. What does *not* change

- Single-doctor clinics: no change at all.
- How money reaches the clinic, platform charges and refunds.
- Patient import/export, limits and duplicate protection.
- Prescription sharing, queue screen privacy and booking-token security.

## 7. Rollout plan

| Phase | What happens | Who notices |
|---|---|---|
| **0. Foundation** | Behind-the-scenes groundwork. Every clinic is quietly set up with its current doctor as "Doctor 1". | Nobody (by design) |
| **1. Admin panel** | Doctors page, doctor logins, per-doctor calendar and queues, prescription authorship, privacy setting. Seats are added by our team. | Premium clinics |
| **2. Website & booking** | Clinic page with doctors, choose-doctor booking, doctor pages, Google/directory listings, multi-doctor TV screen, online payment per doctor | Patients |
| **3. Money** | Self-service seat purchase, per-doctor reports | Clinic owners |
| **Later** | Automatic payment split per doctor, clinic branches, one doctor across several clinics, government health ID (ABDM) linking | — |

> **Safety rule:** Phases 1 and 2 are switched on **together**, first for a few pilot clinics. Adding doctors in the admin panel only makes sense once patients can choose a doctor when booking and paying online. Launching them together means a patient who pays for one doctor can never end up in another doctor's queue. Phase 0 goes first, on its own, and changes nothing anyone can see.

## 8. Known limits (agreed)

- **One location per clinic** for now (no branches).
- **A login belongs to one clinic.** A doctor who already runs their own Doctylia clinic can be added to a polyclinic as a doctor *without a login*, or join with a different phone number.
- **Clinic ownership is tied to the owner's account.** Our support team helps if ownership must change.
- **Doctors are paid by the clinic outside Doctylia**, using our reports, until automatic splitting arrives.

## 9. Decisions still open

- The **price per extra doctor** (it's a setting, so this can be decided any time before Phase 3).
- How long to keep the record-access log (proposed: 1 year).
