import test from "node:test";
import assert from "node:assert/strict";
import { existingReservationState } from "../src/reserve.js";

test("recognizes free and occupied seats", () => {
  assert.equal(existingReservationState("<p>S o 02</p>", "me@example.com"), "free");
  assert.equal(existingReservationState("<a href='mailto:other@example.com'>x</a>", "me@example.com"), "occupied-by-other");
  assert.equal(existingReservationState("<span>09:00-12:00</span><a href='mailto:me@example.com'>x</a>", "me@example.com"), "reserved-by-self-partially");
  assert.equal(existingReservationState("<span>09:00-17:30</span><a href='mailto:ME@example.com'>x</a>", "me@example.com"), "already-reserved-all-day");
});
