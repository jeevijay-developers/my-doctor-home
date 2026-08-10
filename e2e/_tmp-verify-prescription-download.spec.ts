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
  if (!sessionData || !sessionData.access_token) {
    throw new Error(`Failed to create E2E session: ${JSON.stringify(sessionData)}`);
  }
  await page.evaluate((data) => {
    localStorage.setItem("sb-atmelijhxsjzjixhdfcu-auth-token", JSON.stringify(data));
  }, sessionData);
  await page.goto(landingPath);
  await page.waitForLoadState("networkidle");
}

test("prescription slip auto-opens after creation, shows fields, and downloads a real PDF", async ({ page }) => {
  await loginAs(page, "utkarshvijay.it26@gmail.com", "/admin/prescriptions");

  await page.click("button:has-text('New Prescription')");
  const dialog = page.getByRole("dialog");
  await dialog.locator("input").nth(0).fill("Slip Verify Patient");
  // Age / Weight are the 3rd and 4th text inputs in the form (after Patient Name, Date)
  const numberInputs = dialog.locator("input[type='number']");
  await numberInputs.nth(0).fill("45");
  await numberInputs.nth(1).fill("68.5");
  await dialog.getByPlaceholder("e.g. Acute bronchitis").fill("Test diagnosis");
  await dialog.getByPlaceholder("List medications, dosage, frequency...").fill("Test med 500mg\nTwice daily");
  await dialog.getByRole("button", { name: "Save Prescription" }).click();

  await expect(page.getByText("Prescription added")).toBeVisible({ timeout: 10000 });

  // Slip should auto-open
  await expect(page.getByText("Slip Verify Patient")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("45")).toBeVisible();
  await expect(page.getByText("68.5 kg")).toBeVisible();
  await expect(page.getByText("Test diagnosis")).toBeVisible();
  await expect(page.getByText(/Test med 500mg/)).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 10000 }),
    page.click("button:has-text('Download PDF')"),
  ]);
  console.log("PRESCRIPTION_PDF_FILENAME:", download.suggestedFilename());
  expect(download.suggestedFilename()).toMatch(/^prescription-.*\.pdf$/);
  await page.screenshot({ path: "test-results/prescription-slip-new.png", fullPage: true });
});
