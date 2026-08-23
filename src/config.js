import { readFile } from "node:fs/promises";
import { assertIsoDate, calendarDayDifference, dateInTimezone } from "./date.js";

export async function loadConfig(path, targetDateOverride) {
  const raw = JSON.parse(await readFile(path, "utf8"));
  const requiredStrings = ["siteUrl", "timezone", "mapId", "mapName", "seatId", "period"];
  for (const key of requiredStrings) {
    if (typeof raw[key] !== "string" || raw[key].trim() === "") {
      throw new Error(`config.${key} must be a non-empty string`);
    }
  }
  if (raw.period !== "all-day") {
    throw new Error('config.period must be "all-day"');
  }
  if (!Number.isInteger(raw.maxAdvanceDays) || raw.maxAdvanceDays < 0) {
    throw new Error("config.maxAdvanceDays must be a non-negative integer");
  }
  if (!Array.isArray(raw.dates)) {
    throw new Error("config.dates must be an array");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(raw.seatId)) {
    throw new Error("config.seatId contains unsupported characters");
  }

  const dates = targetDateOverride ? [targetDateOverride] : raw.dates;
  raw.dates = [...new Set(dates.map((date, index) => assertIsoDate(date, `config.dates[${index}]`)))].sort();
  return raw;
}

export function classifyDates(config, now = new Date()) {
  const today = dateInTimezone(now, config.timezone);
  return config.dates.map((date) => {
    const daysAhead = calendarDayDifference(today, date);
    let status = "eligible";
    if (daysAhead < 0) status = "past";
    if (daysAhead > config.maxAdvanceDays) status = "not-open";
    return { date, daysAhead, status };
  });
}
