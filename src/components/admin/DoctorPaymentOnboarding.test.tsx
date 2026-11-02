import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DoctorPaymentOnboarding from "./DoctorPaymentOnboarding";

const m = vi.hoisted(() => ({ invoke: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: m.invoke } } }));
vi.mock("sonner", () => ({ toast: { error: m.error, success: m.success } }));
vi.mock("@/lib/edgeFunctionError", () => ({
  edgeFunctionErrorMessage: vi.fn(async (_e: unknown, fallback: string) => fallback),
}));

const profile = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  full_name: "Asha Rao",
  phone: "9876543210",
  clinic_email: "asha@clinic.in",
  razorpay_account_status: "not_started",
  ...over,
});

const fill = (id: string, value: string) => fireEvent.change(document.getElementById(id)!, { target: { value } });
const submit = () => fireEvent.submit(document.querySelector("form")!);

const openForm = (p = profile(), onStatusChange = vi.fn()) => {
  render(<DoctorPaymentOnboarding profile={p as any} onStatusChange={onStatusChange} />);
  fireEvent.click(screen.getByRole("button", { name: /Enable Online Payments/ }));
  return onStatusChange;
};

const fillValid = () => {
  fill("op-business-name", "Asha Clinic");
  fill("op-acc", "123456789012");
  fill("op-acc-confirm", "123456789012");
  fill("op-ifsc", "sbin0001234");
};

describe("DoctorPaymentOnboarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("not started: shows Set Up status and Enable button, form hidden", () => {
    render(<DoctorPaymentOnboarding profile={profile() as any} />);
    expect(screen.getByText("Not Set Up")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Enable Online Payments/ })).toBeInTheDocument();
    expect(document.querySelector("form")).toBeNull();
  });

  it("failed: offers Retry Setup and shows Razorpay's error", () => {
    render(<DoctorPaymentOnboarding profile={profile({ razorpay_account_status: "failed", razorpay_onboarding_error: "PAN mismatch" }) as any} />);
    expect(screen.getByRole("button", { name: /Retry Setup/ })).toBeInTheDocument();
    expect(screen.getByText("PAN mismatch")).toBeInTheDocument();
  });

  it("active: shows linked account id and no setup button", () => {
    render(<DoctorPaymentOnboarding profile={profile({ razorpay_account_status: "active", razorpay_account_id: "acc_123" }) as any} />);
    expect(screen.getByText("acc_123")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Enable Online Payments/ })).not.toBeInTheDocument();
  });

  it("an unknown status falls back to the not-started look instead of crashing", () => {
    render(<DoctorPaymentOnboarding profile={profile({ razorpay_account_status: "weird" }) as any} />);
    expect(screen.getByText("Not Set Up")).toBeInTheDocument();
  });

  it("processing: Refresh Status syncs and reports", async () => {
    m.invoke.mockResolvedValue({ data: { ok: true, status: "active" }, error: null });
    const cb = vi.fn();
    render(<DoctorPaymentOnboarding profile={profile({ razorpay_account_status: "processing" }) as any} onStatusChange={cb} />);
    fireEvent.click(screen.getByRole("button", { name: /Refresh Status/ }));
    await waitFor(() => expect(m.success).toHaveBeenCalledWith("Status updated: active"));
    expect(m.invoke).toHaveBeenCalledWith("sync-doctor-payment-status", { body: {} });
    expect(cb).toHaveBeenCalled();
  });

  it("prefills contact details from the profile", () => {
    openForm();
    expect((document.getElementById("op-contact-name") as HTMLInputElement).value).toBe("Asha Rao");
    expect((document.getElementById("op-contact-email") as HTMLInputElement).value).toBe("asha@clinic.in");
    expect((document.getElementById("op-contact-phone") as HTMLInputElement).value).toBe("9876543210");
  });

  it("account numbers are masked and digit-only", () => {
    openForm();
    expect(document.getElementById("op-acc")).toHaveAttribute("type", "password");
    fill("op-acc", "12ab34-56");
    expect((document.getElementById("op-acc") as HTMLInputElement).value).toBe("123456");
  });

  it("requires a business name", () => {
    openForm();
    fill("op-acc", "123456789012");
    submit();
    expect(m.error).toHaveBeenCalledWith("All contact fields are required.");
    expect(m.invoke).not.toHaveBeenCalled();
  });

  it("requires bank details", () => {
    openForm();
    fill("op-business-name", "Asha Clinic");
    submit();
    expect(m.error).toHaveBeenCalledWith("Bank account details are required.");
    expect(m.invoke).not.toHaveBeenCalled();
  });

  it("rejects a too-short account number", () => {
    openForm();
    fill("op-business-name", "Asha Clinic");
    fill("op-acc", "123");
    fill("op-acc-confirm", "123");
    fill("op-ifsc", "SBIN0001234");
    submit();
    expect(m.error).toHaveBeenCalledWith(expect.stringMatching(/valid bank account number/));
    expect(m.invoke).not.toHaveBeenCalled();
  });

  it("rejects mismatched account number confirmation", () => {
    openForm();
    fillValid();
    fill("op-acc-confirm", "123456789999");
    submit();
    expect(m.error).toHaveBeenCalledWith(expect.stringMatching(/do not match/));
    expect(m.invoke).not.toHaveBeenCalled();
  });

  it("rejects an invalid IFSC", () => {
    openForm();
    fillValid();
    fill("op-ifsc", "BAD");
    submit();
    expect(m.error).toHaveBeenCalledWith(expect.stringMatching(/valid IFSC/));
    expect(m.invoke).not.toHaveBeenCalled();
  });

  it("submits trimmed, upper-cased data to onboard-doctor-payment and reports activation", async () => {
    m.invoke.mockResolvedValue({ data: { ok: true, status: "active" }, error: null });
    const cb = openForm();
    fillValid();
    submit();
    await waitFor(() => expect(m.invoke).toHaveBeenCalled());
    const [fn, opts] = m.invoke.mock.calls[0] as [string, any];
    expect(fn).toBe("onboard-doctor-payment");
    expect(opts.body).toMatchObject({
      business_name: "Asha Clinic",
      account_number: "123456789012",
      ifsc: "SBIN0001234",
      beneficiary_name: "Asha Rao",
      contact_email: "asha@clinic.in",
    });
    await waitFor(() => expect(m.success).toHaveBeenCalledWith(expect.stringMatching(/activated/), expect.anything()));
    expect(cb).toHaveBeenCalled();
  });

  it("non-active result says submitted for review", async () => {
    m.invoke.mockResolvedValue({ data: { ok: true, status: "processing" }, error: null });
    openForm();
    fillValid();
    submit();
    await waitFor(() => expect(m.success).toHaveBeenCalledWith("Account submitted to Razorpay for review.", expect.anything()));
  });

  it("a failed submission shows an error, keeps the form open and does not notify success", async () => {
    m.invoke.mockResolvedValue({ data: { ok: false }, error: null });
    const cb = openForm();
    fillValid();
    submit();
    await waitFor(() => expect(m.error).toHaveBeenCalledWith("Setup failed. Please try again.", expect.anything()));
    expect(m.success).not.toHaveBeenCalled();
    expect(cb).not.toHaveBeenCalled();
    expect(document.querySelector("form")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Submit for Activation" })).toBeEnabled();
  });
});
