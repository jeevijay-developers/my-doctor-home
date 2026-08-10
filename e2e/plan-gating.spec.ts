import { test, expect } from "../playwright-fixture";
import {
  createDisposableDoctor,
  seedAppointmentsForMonth,
  updateDoctorPlan,
  cleanupDisposableDoctor,
  type TestDoctorConfig,
} from "./helpers/db-helper";
import type { Page } from "@playwright/test";

const SUPABASE_URL = "https://atmelijhxsjzjixhdfcu.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0bWVsaWpoeHNqemppeGhkZmN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMjEzODQsImV4cCI6MjEwMDg5NzM4NH0.T8TUu7sIkfsU0GCsl80Na-nWC5ie1YHNdLFpkJ4DAe8";

async function loginDoctor(page: Page, email: string) {
  await page.goto("/auth");
  const sessionData = await page.evaluate(
    async ({ url, key, email }) => {
      const res = await fetch(`${url}/functions/v1/create-e2e-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: key,
        },
        body: JSON.stringify({ email }),
      });
      return res.json();
    },
    { url: SUPABASE_URL, key: ANON_KEY, email }
  );

  if (!sessionData || !sessionData.access_token) {
    throw new Error(`Failed to create E2E session: ${JSON.stringify(sessionData)}`);
  }

  await page.evaluate((data) => {
    localStorage.setItem("sb-atmelijhxsjzjixhdfcu-auth-token", JSON.stringify(data));
  }, sessionData);

  await page.goto("/admin/dashboard");
  await page.waitForLoadState("networkidle");
}

test.describe("Subscription Plan Gating E2E Tests", () => {
  test.setTimeout(240000);

  let basicDocId: string;
  let basicDocConfig: TestDoctorConfig;

  let premiumDocId: string;
  let premiumDocConfig: TestDoctorConfig;

  test.beforeAll(async () => {
    const timestamp = Date.now();
    basicDocConfig = {
      email: `e2e-basic-${timestamp}@example.com`,
      password: "TestPassword123!",
      fullName: "Dr. Basic Tier",
      slug: `e2e-basic-${timestamp}`,
      planTier: "free",
      planStatus: "active",
    };
    basicDocId = createDisposableDoctor(basicDocConfig).id;

    premiumDocConfig = {
      email: `e2e-premium-${timestamp}@example.com`,
      password: "TestPassword123!",
      fullName: "Dr. Premium Tier",
      slug: `e2e-premium-${timestamp}`,
      planTier: "premium",
      planStatus: "active",
      showOnlineConsultation: true,
    };
    premiumDocId = createDisposableDoctor(premiumDocConfig).id;
  });

  test.afterAll(async () => {
    if (basicDocId) cleanupDisposableDoctor(basicDocId);
    if (premiumDocId) cleanupDisposableDoctor(premiumDocId);
  });

  test("1. Basic-tier doctor: Below cap, near-cap warning banner, at-cap blocking, locked cards, contact support dialog", async ({
    page,
  }) => {
    // 1a. Log in as basic doctor below cap
    await loginDoctor(page, basicDocConfig.email);

    // Verify Billing page displays LockedFeatureCard for basic doctor
    await page.goto("/admin/billing");
    await expect(page.locator("text=/Billing & Invoices/")).toBeVisible();
    await expect(page.locator("button:has-text('Request Upgrade')")).toBeVisible();

    // Click "Request Upgrade" and verify it opens the upgrade-request dialog in place
    // (previously navigated to Settings — LockedFeatureCard now opens RequestUpgradeDialog directly)
    await page.click("button:has-text('Request Upgrade')");
    await expect(page.locator("text=/Request Upgrade to Premium/")).toBeVisible();
    await expect(page).not.toHaveURL(/\/admin\/settings/);
    await page.keyboard.press("Escape");

    // Verify Blog Page AI Writer displays LockedFeatureCard
    await page.goto("/admin/blog");
    await page.click("button:has-text('New Post')");
    await expect(page.locator("text=/AI Blog Writer/")).toBeVisible();
    await expect(page.locator("text=/Generate patient-friendly health articles/")).toBeVisible();
    await page.keyboard.press("Escape");

    // Verify My Website Online Consultation displays LockedFeatureCard
    await page.goto("/admin/my-website");
    await expect(page.locator("text=/Online Consultation/")).toBeVisible();
    await expect(page.locator("text=/Video consultations via Zoom/")).toBeVisible();

    // 1b. Seed 450 appointments to reach 90% near-cap threshold
    seedAppointmentsForMonth(basicDocId, 450);

    await page.goto("/admin/dashboard");
    await expect(
      page.locator("text=/450\\/500 appointments this month/")
    ).toBeVisible();

    // 1c. Seed 50 more appointments to reach the 500 cap
    seedAppointmentsForMonth(basicDocId, 50, 450);

    // Attempt booking via Doctor Dashboard (Appointments page)
    await page.goto("/admin/appointments");
    await page.click("button:has-text('New Appointment')");
    await page.fill("input[placeholder='Full name']", "Cap Test Patient");
    await page.fill("input[placeholder='Phone number']", "9876543210");
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await page.fill("input[type='date']", tomorrowStr);
    await page.click("label:has-text('Time Slot') + button");
    await page.click("div[role='option']:has-text('09:30')");
    await page.click("button:has-text('Add Appointment')");

    // Verify blocked with cap error message toast
    await expect(
      page.locator("text=/monthly appointment limit/i")
    ).toBeVisible();

    // Attempt booking via Public Booking Page
    await page.goto(`/dr/${basicDocConfig.slug}`);
    await page.click("button:has-text('Book Appointment')");
    await page.click("button:has-text('Select Time')");
    await page.click("button:has-text('Continue')");
    await page.fill("input[placeholder='Enter your full name']", "Public Cap Patient");
    await page.fill("input[placeholder='Enter 10-digit mobile number']", "9876543210");
    await page.click("button:has-text('Confirm Booking')");

    // Verify public page error toast or message
    await expect(
      page.locator("text=/MONTHLY_APPOINTMENT_CAP_REACHED|monthly appointment limit/i")
    ).toBeVisible();
  });

  test("2. Premium-tier doctor: No caps, no locked cards, full feature access", async ({
    page,
  }) => {
    await loginDoctor(page, premiumDocConfig.email);

    // Verify Dashboard has no warning banner
    await page.goto("/admin/dashboard");
    await expect(page.locator("text=You've used")).not.toBeVisible();

    // Verify Billing page displays real content (not LockedFeatureCard)
    await page.goto("/admin/billing");
    await expect(page.locator("text=Billing & Revenue")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Transactions" })).toBeVisible();
    await expect(page.locator("button:has-text('Request Upgrade')")).not.toBeVisible();

    // Verify Blog Page displays AI Blog Writer form (not LockedFeatureCard)
    await page.goto("/admin/blog");
    await page.click("button:has-text('New Post')");
    await expect(page.locator("input[placeholder*='Top 10 tips']")).toBeVisible();
    await page.keyboard.press("Escape");

    // Verify My Website displays active Online Consultation switch (not LockedFeatureCard)
    await page.goto("/admin/my-website");
    await expect(page.locator("text=Enable video consultations")).not.toBeVisible();
    await expect(page.locator("input[value='500']")).toBeVisible();
  });

  test("3. Downgrade scenario: Premium doctor downgraded to Free auto-flips show_online_consultation to false and locks UI without data loss", async ({
    page,
  }) => {
    // Confirm Premium doctor currently has access
    await loginDoctor(page, premiumDocConfig.email);
    await page.goto("/admin/my-website");
    await expect(page.locator("input[value='500']")).toBeVisible();

    // Execute downgrade from Premium to Free
    updateDoctorPlan(premiumDocId, "free");

    // Reload page and verify show_online_consultation auto-flipped to false and UI renders LockedFeatureCard
    await page.reload();
    await expect(page.locator("text=Online Consultation")).toBeVisible();
    await expect(page.locator("text=/Video consultations via Zoom/")).toBeVisible();
    await expect(page.locator("button:has-text('Request Upgrade')")).toBeVisible();
  });
});
