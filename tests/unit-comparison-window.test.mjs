import assert from "node:assert/strict";
import test from "node:test";
import { comparisonWindowDays, getComparisonWindowStatus } from "../utils/comparison-window.ts";

test("comparison window reports ready when enough days are available", () => {
  const status = getComparisonWindowStatus(comparisonWindowDays + 2, "2026-03-20");

  assert.deepEqual(status, {
    activeDays: comparisonWindowDays + 2,
    targetDays: comparisonWindowDays,
    remainingDays: 0,
    readyByWindow: true,
    etaDate: "2026-03-20",
  });
});

test("comparison window reports remaining days and eta for incomplete history", () => {
  const status = getComparisonWindowStatus(3, "2026-03-05");

  assert.equal(status.activeDays, 3);
  assert.equal(status.targetDays, 14);
  assert.equal(status.remainingDays, 11);
  assert.equal(status.readyByWindow, false);
  assert.equal(status.etaDate, "2026-03-16");
});

test("comparison window clamps negative active days and handles missing latest date", () => {
  const status = getComparisonWindowStatus(-4, null);

  assert.equal(status.activeDays, 0);
  assert.equal(status.remainingDays, comparisonWindowDays);
  assert.equal(status.readyByWindow, false);
  assert.equal(status.etaDate, null);
});
