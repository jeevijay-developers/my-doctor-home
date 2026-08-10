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

test("inspect computed color of Rx body text vs info row text", async ({ page }) => {
  await loginAs(page, "utkarshvijay.it26@gmail.com", "/admin/prescriptions");
  await page.click("text=Slip Verify Patient");
  await page.click("button:has-text('Download')");
  await page.waitForTimeout(500);

  const colors = await page.evaluate(() => {
    const infoValue = document.querySelector("[data-prescription-slip-print-root] .font-medium.text-foreground");
    const rxText = document.querySelector("[data-prescription-slip-print-root] p.whitespace-pre-line");
    return {
      infoValueColor: infoValue ? getComputedStyle(infoValue).color : null,
      rxTextColor: rxText ? getComputedStyle(rxText).color : null,
      infoValueText: infoValue?.textContent,
      rxText: rxText?.textContent,
    };
  });
  console.log("COLOR_CHECK:", JSON.stringify(colors, null, 2));

  const slipCard = page.locator("[data-prescription-slip-print-root] .slip-card");
  await slipCard.screenshot({ path: "test-results/slip-card-closeup.png" });
});
