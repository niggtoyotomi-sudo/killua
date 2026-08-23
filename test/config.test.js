import test from "node:test";
import assert from "node:assert/strict";
import { classifyDates } from "../src/config.js";

const config = {
  timezone: "Asia/Tokyo",
  maxAdvanceDays: 7,
  dates: ["2026-08-22", "2026-08-23", "2026-08-30", "2026-08-31"]
};

test("classifies target dates using Japan time", () => {
  const result = classifyDates(config, new Date("2026-08-23T09:00:00Z"));
  assert.deepEqual(result.map(({ status }) => status), ["past", "eligible", "eligible", "not-open"]);
});
