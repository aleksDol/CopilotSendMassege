import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCountMetric,
  buildRateMetricPp,
  buildTimeMetricMinutesLowerIsBetter,
  getSalesDashboardRanges
} from "./sales-utils.js";

test("getSalesDashboardRanges(day) returns previous day range", () => {
  const ranges = getSalesDashboardRanges({
    period: "day",
    timezone: "UTC",
    now: new Date("2026-04-25T12:00:00Z")
  });

  assert.equal(ranges.current.start.toISOString(), "2026-04-25T00:00:00.000Z");
  assert.equal(ranges.current.end.toISOString(), "2026-04-26T00:00:00.000Z");
  assert.equal(ranges.previous.start.toISOString(), "2026-04-24T00:00:00.000Z");
  assert.equal(ranges.previous.end.toISOString(), "2026-04-25T00:00:00.000Z");
});

test("buildCountMetric handles previous=0 current>0 as infinite", () => {
  const m = buildCountMetric({ label: "X", value: 5, previousValue: 0 });
  assert.equal(m.deltaPercent, null);
  assert.equal(m.deltaIsInfinite, true);
  assert.equal(m.direction, "positive");
  assert.equal(m.deltaLabel, "+∞%");
});

test("buildCountMetric handles neutral 0/0", () => {
  const m = buildCountMetric({ label: "X", value: 0, previousValue: 0 });
  assert.equal(m.deltaPercent, 0);
  assert.equal(m.deltaIsInfinite, false);
  assert.equal(m.direction, "neutral");
  assert.equal(m.deltaLabel, "0%");
});

test("buildTimeMetricMinutesLowerIsBetter inverts direction", () => {
  const better = buildTimeMetricMinutesLowerIsBetter({ label: "T", value: 10, previousValue: 20 });
  assert.equal(better.deltaValue, -10);
  assert.equal(better.direction, "positive");
  assert.equal(better.deltaLabel, "-10 мин");

  const worse = buildTimeMetricMinutesLowerIsBetter({ label: "T", value: 30, previousValue: 20 });
  assert.equal(worse.deltaValue, 10);
  assert.equal(worse.direction, "negative");
  assert.equal(worse.deltaLabel, "+10 мин");
});

test("buildRateMetricPp uses percentage points label", () => {
  const m = buildRateMetricPp({ label: "R", value: 40, previousValue: 30 });
  assert.equal(m.deltaValue, 10);
  assert.equal(m.direction, "positive");
  assert.equal(m.deltaLabel, "+10 п.п.");
});

