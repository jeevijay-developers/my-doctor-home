import { test, expect } from "../playwright-fixture";
import type { Page } from "@playwright/test";

const SUPABASE_URL = "https://atmelijhxsjzjixhdfcu.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0bWVsaWpoeHNqemppeGhkZmN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMjEzODQsImV4cCI6MjEwMDg5NzM4NH0.T8TUu7sIkfsU0GCsl80Na-nWC5ie1YHNdLFpkJ4DAe8";

async function loginAs(page: Page, email: string, landingPath: string) {
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
  await page.evaluate((data) => {
    localStorage.setItem("sb-atmelijhxsjzjixhdfcu-auth-token", JSON.stringify(data));
  }, sessionData);
  await page.goto(landingPath);
  await page.waitForLoadState("networkidle");
}

test("Gender auto-fills from the linked patient record on the downloaded slip", async ({ page }) => {
  await loginAs(page, "utkarshvijay.it26@gmail.com", "/admin/prescriptions");
  await page.click("text=Gender link test");
  await page.click("button:has-text('Download')");
  await expect(page.getByText("male", { exact: true })).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: "test-results/slip-gender-autofill.png" });
});
