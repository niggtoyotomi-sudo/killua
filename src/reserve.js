import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import { classifyDates, loadConfig } from "./config.js";
import { toSiteDate } from "./date.js";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = process.env.RESERVATION_CONFIG || path.join(rootDirectory, "config", "reservations.json");
const dryRun = /^true$/i.test(process.env.DRY_RUN || "false");

function requiredSecret(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function signIn(page, config, email, password) {
  await page.goto(config.siteUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  if (new URL(page.url()).hostname === new URL(config.siteUrl).hostname) {
    await page.goto(new URL("/Reservation", config.siteUrl).href, {
      waitUntil: "domcontentloaded",
      timeout: 60_000
    });
    return;
  }

  const emailInput = page.locator('input[name="signInName"], input[type="email"], input[autocomplete="username"]').first();
  const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
  await emailInput.waitFor({ state: "visible", timeout: 30_000 });
  await emailInput.fill(email);
  await passwordInput.fill(password);

  const signInButton = page.getByRole("button", { name: /サインイン|sign in/i }).first();
  await Promise.all([
    page.waitForURL((url) => url.hostname === new URL(config.siteUrl).hostname, { timeout: 60_000 }),
    signInButton.click()
  ]);

  await page.goto(new URL("/Reservation", config.siteUrl).href, {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });
}

async function setMap(page, config) {
  const mapSelect = page.locator("#selectMap");
  await mapSelect.waitFor({ state: "attached", timeout: 30_000 });
  const option = mapSelect.locator(`option[value="${config.mapId}"]`);
  if ((await option.count()) !== 1) {
    throw new Error(`Map ID ${config.mapId} (${config.mapName}) was not found`);
  }
  if ((await mapSelect.inputValue()) !== config.mapId) {
    await mapSelect.selectOption(config.mapId);
  }
}

async function moveToDate(page, targetDate, daysAhead) {
  const expectedSiteDate = toSiteDate(targetDate);
  const displayedDate = page.locator("#inputSearchDate");
  await displayedDate.waitFor({ state: "attached", timeout: 30_000 });

  for (let index = 0; index < daysAhead; index += 1) {
    const nextButton = page.locator(".js-increment-date:visible").first();
    await nextButton.click({ timeout: 20_000 });
    const expectedStepDate = toSiteDate(
      new Date(Date.parse(`${targetDate}T00:00:00Z`) - (daysAhead - index - 1) * 86_400_000)
        .toISOString()
        .slice(0, 10)
    );
    await page.waitForFunction(
      (value) => document.querySelector("#inputSearchDate")?.value === value,
      expectedStepDate,
      { timeout: 20_000 }
    );
  }

  const actual = await displayedDate.inputValue();
  if (actual !== expectedSiteDate) {
    throw new Error(`Date navigation failed: expected ${expectedSiteDate}, got ${actual}`);
  }
}

function normalize(value) {
  return value.replaceAll(/\s/g, "").toLowerCase();
}

function existingReservationState(tooltipHtml, email) {
  if (!/mailto:/i.test(tooltipHtml)) return "free";
  if (!normalize(tooltipHtml).includes(normalize(email))) return "occupied-by-other";
  if (/09:00\s*-\s*17:30/.test(tooltipHtml)) return "already-reserved-all-day";
  return "reserved-by-self-partially";
}

async function reserveDate(page, config, email, entry) {
  await page.goto(new URL("/Reservation", config.siteUrl).href, {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });
  await setMap(page, config);
  await moveToDate(page, entry.date, entry.daysAhead);

  const seat = page.locator(`[data-seat-id="${config.seatId}"]`);
  await seat.waitFor({ state: "visible", timeout: 30_000 });
  const tooltip = (await seat.getAttribute("data-original-title")) || "";
  const existing = existingReservationState(tooltip, email);
  if (existing === "already-reserved-all-day") {
    console.log(`[${entry.date}] ${config.seatId} is already reserved all day by this account.`);
    return "already-reserved";
  }
  if (existing === "occupied-by-other") {
    throw new Error(`[${entry.date}] ${config.seatId} is already occupied by another user.`);
  }
  if (existing === "reserved-by-self-partially") {
    throw new Error(`[${entry.date}] This account already has a partial reservation on ${config.seatId}; refusing to create an overlapping all-day reservation.`);
  }

  await seat.click();
  const form = page.locator("#formAddRsv");
  await form.waitFor({ state: "visible", timeout: 20_000 });

  const values = await form.evaluate((element) => Object.fromEntries(new FormData(element).entries()));
  const expected = {
    reservationDate: toSiteDate(entry.date),
    reservationTimeFrom: "09:00",
    reservationTimeTo: "17:30",
    reservationSeatId: config.seatId,
    reservationMapId: config.mapId
  };
  for (const [key, value] of Object.entries(expected)) {
    if (values[key] !== value) {
      throw new Error(`[${entry.date}] Form verification failed for ${key}: expected ${value}, got ${values[key]}`);
    }
  }

  if (dryRun) {
    console.log(`[${entry.date}] DRY RUN: ready to reserve ${config.mapName} / ${config.seatId} / 09:00-17:30.`);
    return "dry-run";
  }

  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && /\/api\/reservation(?:\?|$)/i.test(response.url()),
    { timeout: 30_000 }
  );
  await form.locator("#btnAddRsv").click();
  const response = await responsePromise;
  const responseBody = await response.text();
  await page.waitForTimeout(500);

  const alert = page.locator("#alertAddRsv");
  if (await alert.isVisible()) {
    const message = (await page.locator("#alertMsgAddRsv").innerText()).trim();
    throw new Error(`[${entry.date}] Reservation was rejected: ${message || `HTTP ${response.status()}`}`);
  }
  if (!response.ok()) {
    throw new Error(`[${entry.date}] Reservation API returned HTTP ${response.status()}: ${responseBody.slice(0, 300)}`);
  }

  console.log(`[${entry.date}] Reserved ${config.mapName} / ${config.seatId} / 09:00-17:30.`);
  return "reserved";
}

export async function main() {
  const config = await loadConfig(configPath, process.env.TARGET_DATE || undefined);
  const classified = classifyDates(config);
  const eligible = classified.filter(({ status }) => status === "eligible");

  for (const entry of classified.filter(({ status }) => status === "past")) {
    console.log(`[${entry.date}] Skipped: date is in the past.`);
  }
  for (const entry of classified.filter(({ status }) => status === "not-open")) {
    console.log(`[${entry.date}] Waiting: reservation opens ${config.maxAdvanceDays} days before the target date.`);
  }
  if (eligible.length === 0) {
    console.log("No reservation dates are currently eligible.");
    return;
  }

  const email = requiredSecret("DESK_MOSAIC_EMAIL");
  const password = requiredSecret("DESK_MOSAIC_PASSWORD");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "ja-JP",
    timezoneId: config.timezone,
    viewport: { width: 1440, height: 1200 }
  });
  const page = await context.newPage();
  const failures = [];

  try {
    await signIn(page, config, email, password);
    for (const entry of eligible) {
      try {
        await reserveDate(page, config, email, entry);
      } catch (error) {
        failures.push(error);
        console.error(error.message);
      }
    }
  } finally {
    await browser.close();
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, `${failures.length} reservation(s) failed`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { existingReservationState };
