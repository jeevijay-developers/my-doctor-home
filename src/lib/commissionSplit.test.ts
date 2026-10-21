import { describe, expect, it } from "vitest";
import {
  calculateCommissionSplit,
  isAmountMatchingServerPrice,
  resolveAuthoritativePrice,
  resolveCommissionPercent,
} from "./commissionSplit";

describe("calculateCommissionSplit", () => {
  it("keeps the full amount with the doctor at 0%", () => {
    const split = calculateCommissionSplit(250, 0, 10);
    expect(split).toMatchObject({
      commissionPercent: 0,
      grossPaise: 25000,
      commissionPaise: 0,
      doctorNetPaise: 25000,
      grossAmount: 250,
      commissionAmount: 0,
      doctorShare: 250,
    });
    expect(split.commissionPaise + split.doctorNetPaise).toBe(split.grossPaise);
  });

  it("splits 10% of ₹500 into exact paise", () => {
    const split = calculateCommissionSplit(500, 10);
    expect(split).toMatchObject({
      commissionPercent: 10,
      grossPaise: 50000,
      commissionPaise: 5000,
      doctorNetPaise: 45000,
      grossAmount: 500,
      commissionAmount: 50,
      doctorShare: 450,
    });
    expect(split.commissionPaise + split.doctorNetPaise).toBe(split.grossPaise);
  });

  it("splits 12.5% of ₹800 into exact paise", () => {
    const split = calculateCommissionSplit(800, "12.5", 10);
    expect(split).toMatchObject({
      commissionPercent: 12.5,
      grossPaise: 80000,
      commissionPaise: 10000,
      doctorNetPaise: 70000,
      grossAmount: 800,
      commissionAmount: 100,
      doctorShare: 700,
    });
    expect(split.commissionPaise + split.doctorNetPaise).toBe(split.grossPaise);
  });

  it("routes the full amount to the platform at 100%", () => {
    const split = calculateCommissionSplit(120, 100, 10);
    expect(split).toMatchObject({
      commissionPercent: 100,
      grossPaise: 12000,
      commissionPaise: 12000,
      doctorNetPaise: 0,
      grossAmount: 120,
      commissionAmount: 120,
      doctorShare: 0,
    });
    expect(split.commissionPaise + split.doctorNetPaise).toBe(split.grossPaise);
  });

  it("rounds uneven paise splits so the two shares still sum to the gross", () => {
    // 1001 paise * 10% = 100.1 → 100 paise platform, 901 paise doctor.
    const tenPercent = calculateCommissionSplit(10.01, 10);
    expect(tenPercent).toMatchObject({
      grossPaise: 1001,
      commissionPaise: 100,
      doctorNetPaise: 901,
    });
    expect(tenPercent.commissionPaise + tenPercent.doctorNetPaise).toBe(tenPercent.grossPaise);

    // 100 paise * 12.5% = 12.5 → half rounds away from zero to 13.
    const halfUp = calculateCommissionSplit(1, 12.5);
    expect(halfUp).toMatchObject({
      grossPaise: 100,
      commissionPaise: 13,
      doctorNetPaise: 87,
    });
    expect(halfUp.commissionPaise + halfUp.doctorNetPaise).toBe(halfUp.grossPaise);
  });

  it("treats a non-positive gross as zero paise", () => {
    expect(calculateCommissionSplit(0, 10).grossPaise).toBe(0);
    expect(calculateCommissionSplit(-40, 10).doctorNetPaise).toBe(0);
  });
});

describe("resolveCommissionPercent", () => {
  it("uses the platform default when the doctor override is null or blank", () => {
    expect(resolveCommissionPercent(null, 7.5)).toBe(7.5);
    expect(resolveCommissionPercent(undefined, "15")).toBe(15);
    expect(resolveCommissionPercent("", 8)).toBe(8);
  });

  it("falls back to 10% when neither value is set", () => {
    expect(resolveCommissionPercent(null, null)).toBe(10);
    expect(resolveCommissionPercent()).toBe(10);
  });

  it("keeps an explicit 0% doctor override instead of the default", () => {
    expect(resolveCommissionPercent(0, 10)).toBe(0);
  });

  it("clamps the resolved percentage to 0–100 and rounds to 2 decimals", () => {
    expect(resolveCommissionPercent(150, 10)).toBe(100);
    expect(resolveCommissionPercent(-3, 10)).toBe(0);
    expect(resolveCommissionPercent("12.345", 10)).toBe(12.35);
    expect(resolveCommissionPercent(null, 250)).toBe(100);
    expect(resolveCommissionPercent(null, -1)).toBe(0);
  });
});

describe("resolveAuthoritativePrice", () => {
  const clinicService = {
    id: "svc-1",
    price: 750,
    type: "clinic",
    active: true,
  };

  it("uses the service price when it is greater than 0", () => {
    const result = resolveAuthoritativePrice({
      appointmentType: "clinic",
      consultationFee: 400,
      service: clinicService,
    });
    expect(result).toEqual({ ok: true, serverPrice: 750, serverPaise: 75000 });
  });

  it("falls back to the consultation fee when the service price is missing or zero", () => {
    expect(
      resolveAuthoritativePrice({
        appointmentType: "clinic",
        consultationFee: 400,
        service: { ...clinicService, price: 0 },
      }),
    ).toEqual({ ok: true, serverPrice: 400, serverPaise: 40000 });

    expect(
      resolveAuthoritativePrice({
        appointmentType: "clinic",
        consultationFee: "650",
        service: { ...clinicService, price: null },
      }),
    ).toEqual({ ok: true, serverPrice: 650, serverPaise: 65000 });
  });

  it("uses the online fee for online bookings and falls back to the consultation fee", () => {
    expect(
      resolveAuthoritativePrice({
        appointmentType: "online",
        consultationFee: 400,
        onlineFee: 900,
      }),
    ).toEqual({ ok: true, serverPrice: 900, serverPaise: 90000 });

    expect(
      resolveAuthoritativePrice({
        appointmentType: "online",
        consultationFee: 400,
        onlineFee: 0,
      }),
    ).toEqual({ ok: true, serverPrice: 400, serverPaise: 40000 });

    expect(
      resolveAuthoritativePrice({
        appointmentType: "clinic",
        consultationFee: 400,
        onlineFee: 900,
      }),
    ).toEqual({ ok: true, serverPrice: 400, serverPaise: 40000 });
  });

  it("rejects a service whose type does not match the appointment", () => {
    const result = resolveAuthoritativePrice({
      appointmentType: "online",
      consultationFee: 400,
      service: clinicService,
    });
    expect(result).toEqual({
      ok: false,
      error: "SERVICE_TYPE_MISMATCH",
      message: "This service is not available for online consultations.",
    });
  });

  it("accepts a service typed as both and rejects an inactive service", () => {
    expect(
      resolveAuthoritativePrice({
        appointmentType: "online",
        consultationFee: 400,
        service: { ...clinicService, type: "both", price: "1250.5" },
      }),
    ).toEqual({ ok: true, serverPrice: 1250.5, serverPaise: 125050 });

    const inactive = resolveAuthoritativePrice({
      appointmentType: "clinic",
      consultationFee: 400,
      service: { ...clinicService, active: false },
    });
    expect(inactive).toEqual({
      ok: false,
      error: "INVALID_SERVICE",
      message: "The selected service is no longer active.",
    });
  });
});

describe("isAmountMatchingServerPrice", () => {
  it("compares client and server amounts in integer paise", () => {
    expect(isAmountMatchingServerPrice(500, 500)).toBe(true);
    expect(isAmountMatchingServerPrice(500.004, 500)).toBe(true);
    expect(isAmountMatchingServerPrice(499.99, 500)).toBe(false);
    expect(isAmountMatchingServerPrice(Number.NaN, 500)).toBe(false);
  });
});
