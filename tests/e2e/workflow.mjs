// End-to-end browser test for the critical engineer workflow.
// Requires the API and web app to be running, and Playwright installed:
//   npm install --no-save playwright && npx playwright install chromium
// Run:  BASE_URL=http://localhost:3000 node tests/e2e/workflow.mjs
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const IMAGE = process.env.IMAGE_PATH ?? path.resolve(here, "../../sample-data/images/SIM-ECO-TUBE-024_INS-2026-0044.png");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const problems = [];
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });

try {
  // Sign in as an inspection engineer.
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("input[type=email]", "engineer@boilerguard.demo");
  await page.fill("input[type=password]", "Engineer@12345");
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard");

  // 1. Create an inspection.
  await page.goto(`${BASE}/inspections`, { waitUntil: "networkidle" });
  await page.locator("form select").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: "Create inspection" }).click();
  await page.waitForURL(/\/inspections\/\d+/);
  console.log("1. inspection created");

  // 2. Upload evidence linked to a component.
  await page.getByRole("button", { name: /^Evidence/ }).click();
  await page.locator("input[type=file][accept*=jpeg]").setInputFiles(IMAGE);
  await page.locator("form select").first().selectOption({ label: "ECO-TUBE-025 · Economiser tube row 25" });
  await page.getByRole("button", { name: "Upload evidence" }).click();
  await page.getByText("Evidence uploaded").waitFor({ timeout: 15000 });
  console.log("2. evidence uploaded");

  // 3. Run the demonstration analysis.
  await page.getByRole("button", { name: "Run demonstration analysis" }).first().click();
  await page.getByText(/Demonstration analysis complete/).waitFor({ timeout: 20000 });
  console.log("3. analysis run");

  // 4. Verify a suspected finding with the analyzer's suggested severity.
  await page.getByRole("button", { name: /^Findings/ }).click();
  const verify = page.getByRole("button", { name: "Verify" });
  if ((await verify.count()) === 0) throw new Error("expected at least one AI-suspected finding to verify");
  await verify.first().click();
  await page.getByText(/updated: verify/).waitFor({ timeout: 15000 });
  console.log("4. finding verified");

  // 5. Generate the PDF engineering report.
  await page.getByRole("button", { name: "Overview" }).click();
  const download = page.waitForEvent("download", { timeout: 30000 });
  await page.getByRole("button", { name: "Generate PDF report" }).click();
  const file = await download;
  if (!file.suggestedFilename().endsWith(".pdf")) throw new Error("report download was not a PDF");
  console.log(`5. report downloaded: ${file.suggestedFilename()}`);

  if (problems.length) throw new Error(`browser problems:\n${problems.join("\n")}`);
  console.log("PASS: critical workflow completed without browser errors");
} catch (err) {
  console.error("FAIL:", err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
