import test from "node:test";
import assert from "node:assert/strict";
import { assertIsoDate, calendarDayDifference, dateInTimezone, toSiteDate } from "../src/date.js";

test("validates ISO calendar dates", () => {
  assert.equal(assertIsoDate("2026-08-30"), "2026-08-30");
  assert.throws(() => assertIsoDate("2026-02-29"), /valid calendar date/);
  assert.throws(() => assertIsoDate("2026\/08\/30"), /YYYY-MM-DD/);
});

test("uses Japan calendar date at the UTC boundary", () => {
  assert.equal(dateInTimezone(new Date("2026-08-23T15:00:00Z"), "Asia/Tokyo"), "2026-08-24");
});

test("calculates calendar-day differences", () => {
  assert.equal(calendarDayDifference("2026-08-23", "2026-08-30"), 7);
  assert.equal(calendarDayDifference("2026-08-23", "2026-08-22"), -1);
  assert.equal(toSiteDate("2026-08-30"), "2026/08/30");
});
