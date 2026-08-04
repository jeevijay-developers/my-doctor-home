import { chromium } from "playwright";

const slug = process.argv[2] || "anmol-bohra";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 2000 } });
await page.goto(`http://localhost:8080/dr/${slug}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const about = page.locator("#about");
const services = page.locator("#services");
await about.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);

// Full region from top of About to bottom of Services
const aboutBox = await about.boundingBox();
const servicesBox = await services.boundingBox();
if (aboutBox && servicesBox) {
  const top = Math.min(aboutBox.y, servicesBox.y);
  const bottom = Math.max(aboutBox.y + aboutBox.height, servicesBox.y + servicesBox.height);
  await page.screenshot({
    path: "C:\\Users\\user\\Desktop\\my-doctor-home\\.scratch-verify\\about-services.png",
    clip: { x: 0, y: top, width: 1280, height: bottom - top },
  });
  console.log("Screenshot saved. about box:", aboutBox, "services box:", servicesBox);
} else {
  console.log("Could not locate sections", { aboutBox, servicesBox });
  await page.screenshot({ path: "C:\\Users\\user\\Desktop\\my-doctor-home\\.scratch-verify\\fallback.png", fullPage: true });
}

// Sanity check: is heading text actually visible/rendered (not hidden behind pattern)?
const headingVisible = await page.locator("#about h2").isVisible();
const cardVisible = await page.locator("#services .hover-lift").first().isVisible().catch(() => false);
console.log("About heading visible:", headingVisible, "Service card visible:", cardVisible);

await browser.close();
