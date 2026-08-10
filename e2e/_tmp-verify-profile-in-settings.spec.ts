import { test, expect } from "../playwright-fixture";
import { cleanupDisposableDoctor, runSqlQuery } from "./helpers/db-helper";
import type { Page } from "@playwright/test";

const SUPABASE_URL = "https://atmelijhxsjzjixhdfcu.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0bWVsaWpoeHNqemppeGhkZmN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMjEzODQsImV4cCI6MjEwMDg5NzM4NH0.T8TUu7sIkfsU0GCsl80Na-nWC5ie1YHNdLFpkJ4DAe8";

// Fixtures were pre-seeded directly via verified individual `supabase db
// query --linked` calls (not in beforeAll) because that CLI has an infra
// flakiness unrelated to this feature: it sometimes reports a client-side
// error even though the statement executed successfully server-side,
// which made in-test multi-step fixture creation unreliable. Cleanup still
// runs normally.
const DOCTOR_ID = "00000000-0000-4000-a000-606324597683";
const DOCTOR_EMAIL = "e2e-profsettings-1786361406296@example.com";
const STAFF_WITH_EMAIL = "e2e-staffwith-verify@example.com";
const STAFF_WITH_ID = "00000000-0000-4000-b000-111111111111";
const STAFF_WITHOUT_EMAIL = "e2e-staffwithout-verify@example.com";
const STAFF_WITHOUT_ID = "00000000-0000-4000-b000-222222222222";

async function loginAs(page: Page, email: string, landingPath = "/admin/dashboard") {
  await page.goto("/auth");
  const sessionData = await page.evaluate(
    async ({ url, key, email }) => {
      const res = await fetch(`${url}/functions/v1/create-e2e-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key },
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
  await page.goto(landingPath);
  await page.waitForLoadState("networkidle");
}

function cleanupStaff(staffId: string) {
  try {
    runSqlQuery(`DELETE FROM public.staff_members WHERE id = '${staffId}';`);
    runSqlQuery(`DELETE FROM auth.identities WHERE user_id = '${staffId}';`);
    runSqlQuery(`DELETE FROM auth.users WHERE id = '${staffId}';`);
  } catch (err: any) {
    console.warn("Staff cleanup warning:", err.message);
  }
}

test.describe("Profile moved into Settings", () => {
  test.setTimeout(240000);

  test.afterAll(async () => {
    cleanupStaff(STAFF_WITH_ID);
    cleanupStaff(STAFF_WITHOUT_ID);
    cleanupDisposableDoctor(DOCTOR_ID);
  });

  test("doctor sees Profile as a tab inside Settings, old URL redirects, sidebar/avatar updated", async ({ page }) => {
    await loginAs(page, DOCTOR_EMAIL);

    // Sidebar: no standalone "Profile" item, "Settings" item present
    await expect(page.locator("nav, aside").getByText("Profile", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Settings$/ })).toBeVisible();

    // Go to Settings, verify 3 tabs
    await page.goto("/admin/settings");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("tab", { name: /Subscription/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Account/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Profile/ })).toBeVisible();

    // Click Profile tab, verify real ProfilePage content renders
    await page.getByRole("tab", { name: /Profile/ }).click();
    await expect(page.getByRole("heading", { name: "Doctor Profile" })).toBeVisible();
    await expect(page.getByText("Your Details")).toBeVisible();
    await expect(page.getByText("Clinic Details")).toBeVisible();

    // Old /admin/profile URL redirects into the Settings Profile tab
    await page.goto("/admin/profile");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/admin\/settings\?tab=profile/);
    await expect(page.getByRole("heading", { name: "Doctor Profile" })).toBeVisible();

    // Header avatar click navigates to Settings' Profile tab
    await page.goto("/admin/dashboard");
    await page.waitForLoadState("networkidle");
    await page.locator("header a[href='/admin/settings?tab=profile']").click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/admin\/settings\?tab=profile/);
    await expect(page.getByRole("heading", { name: "Doctor Profile" })).toBeVisible();
  });

  test("staff WITH profile.view can reach Settings and sees only the Profile tab (no Subscription/Account)", async ({ page }) => {
    await loginAs(page, STAFF_WITH_EMAIL);

    await expect(page.getByRole("link", { name: /^Settings$/ })).toBeVisible();

    await page.goto("/admin/settings");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Doctor Profile" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Subscription/ })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: /Account/ })).toHaveCount(0);
  });

  test("staff WITHOUT profile.view cannot see or reach Settings", async ({ page }) => {
    await loginAs(page, STAFF_WITHOUT_EMAIL);

    await expect(page.getByRole("link", { name: /^Settings$/ })).toHaveCount(0);

    await page.goto("/admin/settings");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/access denied/i)).toBeVisible();
  });
});
