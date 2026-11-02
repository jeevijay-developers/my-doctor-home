import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  existingInvoice: null as { id: string } | null,
  profile: null as { gst_registered?: boolean; gstin?: string | null } | null,
  invoiceNumbers: [] as { invoice_number: string }[] | null,
  inserted: [] as any[],
  likeArgs: [] as any[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      let cols = "";
      const chain: any = {
        select: (c: string) => {
          cols = c;
          return chain;
        },
        eq: () => chain,
        maybeSingle: () =>
          Promise.resolve({ data: table === "profiles" ? db.profile : db.existingInvoice, error: null }),
        like: (col: string, pattern: string) => {
          db.likeArgs.push([col, pattern, cols]);
          return Promise.resolve({ data: db.invoiceNumbers, error: null });
        },
        insert: (row: any) => {
          db.inserted.push(row);
          return Promise.resolve({ error: null });
        },
      };
      return chain;
    }),
  },
}));

import { ensureInvoiceForAppointment } from "./invoiceGeneration";

const appt = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  doctor_id: "d1",
  patient_name: "Pat",
  service_name: "Consult",
  amount: 500 as number | string,
  ...over,
});
const YEAR = 2026;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${YEAR}-06-15T06:00:00Z`));
  db.existingInvoice = null;
  db.profile = { gst_registered: false, gstin: null };
  db.invoiceNumbers = [];
  db.inserted = [];
  db.likeArgs = [];
});
afterEach(() => vi.useRealTimers());

describe("ensureInvoiceForAppointment", () => {
  it("does nothing if an invoice already exists (idempotent)", async () => {
    db.existingInvoice = { id: "inv" };
    await ensureInvoiceForAppointment(appt());
    expect(db.inserted).toHaveLength(0);
  });

  it("creates the first invoice of the year as INV-YYYY-0001 with no GST for non-registered doctors", async () => {
    await ensureInvoiceForAppointment(appt());
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]).toMatchObject({
      doctor_id: "d1",
      appointment_id: "a1",
      invoice_number: `INV-${YEAR}-0001`,
      patient_name: "Pat",
      service_name: "Consult",
      amount: 500,
      gst_rate: 0,
      gst_amount: 0,
      total_amount: 500,
      clinic_gstin: null,
      status: "generated",
    });
    expect(db.likeArgs[0][1]).toBe(`INV-${YEAR}-%`);
  });

  it("continues numbering from the highest existing number (not the count), ignoring junk", async () => {
    db.invoiceNumbers = [
      { invoice_number: `INV-${YEAR}-0003` },
      { invoice_number: `INV-${YEAR}-0010` },
      { invoice_number: `INV-${YEAR}-xyz` },
    ];
    await ensureInvoiceForAppointment(appt());
    expect(db.inserted[0].invoice_number).toBe(`INV-${YEAR}-0011`);
  });

  it("handles a null existing-invoices result", async () => {
    db.invoiceNumbers = null;
    await ensureInvoiceForAppointment(appt());
    expect(db.inserted[0].invoice_number).toBe(`INV-${YEAR}-0001`);
  });

  it("pads to 4 digits but grows past 9999", async () => {
    db.invoiceNumbers = [{ invoice_number: `INV-${YEAR}-9999` }];
    await ensureInvoiceForAppointment(appt());
    expect(db.inserted[0].invoice_number).toBe(`INV-${YEAR}-10000`);
  });

  it("adds 18% GST and the clinic GSTIN for GST-registered doctors", async () => {
    db.profile = { gst_registered: true, gstin: "29ABCDE1234F1Z5" };
    await ensureInvoiceForAppointment(appt({ amount: 500 }));
    expect(db.inserted[0]).toMatchObject({ gst_rate: 18, gst_amount: 90, total_amount: 590, clinic_gstin: "29ABCDE1234F1Z5" });
  });

  it("rounds GST to 2 decimals", async () => {
    db.profile = { gst_registered: true, gstin: null };
    await ensureInvoiceForAppointment(appt({ amount: 99.99 }));
    expect(db.inserted[0].gst_amount).toBe(18);
    expect(db.inserted[0].total_amount).toBe(117.99);
  });

  it("accepts a numeric string amount and treats junk/empty as 0", async () => {
    await ensureInvoiceForAppointment(appt({ amount: "250.50" }));
    expect(db.inserted[0].amount).toBe(250.5);
    await ensureInvoiceForAppointment(appt({ amount: "abc" }));
    expect(db.inserted[1]).toMatchObject({ amount: 0, gst_amount: 0, total_amount: 0 });
    await ensureInvoiceForAppointment(appt({ amount: "" }));
    expect(db.inserted[2].amount).toBe(0);
  });

  it("missing profile row means not GST registered", async () => {
    db.profile = null;
    db.profile = null;
    await ensureInvoiceForAppointment(appt());
    expect(db.inserted[0]).toMatchObject({ gst_rate: 0, clinic_gstin: null });
  });

  it("uses the clock's year for the prefix", async () => {
    vi.setSystemTime(new Date("2031-03-01T12:00:00Z"));
    await ensureInvoiceForAppointment(appt());
    expect(db.inserted[0].invoice_number).toBe("INV-2031-0001");
  });
});
