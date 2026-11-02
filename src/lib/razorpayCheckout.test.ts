import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const scripts = () => Array.from(document.querySelectorAll<HTMLScriptElement>('script[src*="checkout.razorpay.com"]'));

describe("loadRazorpayCheckout", () => {
  beforeEach(() => {
    vi.resetModules();
    delete (window as any).Razorpay;
    scripts().forEach((s) => s.remove());
  });
  afterEach(() => {
    delete (window as any).Razorpay;
    scripts().forEach((s) => s.remove());
  });

  it("resolves immediately without injecting a script when Razorpay is already present", async () => {
    (window as any).Razorpay = function () {};
    const { loadRazorpayCheckout } = await import("./razorpayCheckout");
    await expect(loadRazorpayCheckout()).resolves.toBeUndefined();
    expect(scripts()).toHaveLength(0);
  });

  it("injects one async script, shares the promise across callers, resolves on load", async () => {
    const { loadRazorpayCheckout } = await import("./razorpayCheckout");
    const p1 = loadRazorpayCheckout();
    const p2 = loadRazorpayCheckout();
    expect(p1).toBe(p2);
    expect(scripts()).toHaveLength(1);
    const s = scripts()[0];
    expect(s.src).toBe("https://checkout.razorpay.com/v1/checkout.js");
    expect(s.async).toBe(true);
    s.onload?.(new Event("load"));
    await expect(p1).resolves.toBeUndefined();
  });

  it("rejects on load error and allows a retry with a fresh script", async () => {
    const { loadRazorpayCheckout } = await import("./razorpayCheckout");
    const p1 = loadRazorpayCheckout();
    scripts()[0].onerror?.(new Event("error"));
    await expect(p1).rejects.toThrow(/payment gateway/i);

    const p2 = loadRazorpayCheckout();
    expect(p2).not.toBe(p1);
    expect(scripts()).toHaveLength(2);
    scripts()[1].onload?.(new Event("load"));
    await expect(p2).resolves.toBeUndefined();
  });
});
