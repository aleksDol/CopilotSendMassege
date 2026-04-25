import { DateTime } from "luxon";

export type SalesDashboardPeriod = "day" | "week" | "month";

export type PeriodRange = {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
};

export type SalesRanges = {
  timezone: string;
  current: PeriodRange;
  previous: PeriodRange;
  comparisonLabelRu: string;
};

const toRange = (start: DateTime, end: DateTime): PeriodRange => ({
  start: start.toUTC().toJSDate(),
  end: end.toUTC().toJSDate(),
  startIso: start.toISO() ?? start.toUTC().toISO() ?? start.toJSDate().toISOString(),
  endIso: end.toISO() ?? end.toUTC().toISO() ?? end.toJSDate().toISOString()
});

const safeZone = (timezone: string | null | undefined) => {
  const tz = (timezone ?? "").trim();
  return tz.length ? tz : "UTC";
};

const startOfIsoWeek = (dt: DateTime) => {
  // Luxon weekday: 1=Monday ... 7=Sunday
  const startOfDay = dt.startOf("day");
  return startOfDay.minus({ days: startOfDay.weekday - 1 });
};

export const getSalesDashboardRanges = (params: {
  period: SalesDashboardPeriod;
  timezone: string;
  now?: Date;
}): SalesRanges => {
  const tz = safeZone(params.timezone);
  const now = DateTime.fromJSDate(params.now ?? new Date(), { zone: tz });

  if (!now.isValid) {
    // Fallback: treat as UTC
    return getSalesDashboardRanges({ period: params.period, timezone: "UTC", now: params.now });
  }

  if (params.period === "day") {
    const start = now.startOf("day");
    const end = start.plus({ days: 1 });
    const prevStart = start.minus({ days: 1 });
    const prevEnd = start;
    return {
      timezone: tz,
      current: toRange(start, end),
      previous: toRange(prevStart, prevEnd),
      comparisonLabelRu: "к прошлому дню"
    };
  }

  if (params.period === "week") {
    const start = startOfIsoWeek(now);
    const end = start.plus({ weeks: 1 });
    const prevStart = start.minus({ weeks: 1 });
    const prevEnd = start;
    return {
      timezone: tz,
      current: toRange(start, end),
      previous: toRange(prevStart, prevEnd),
      comparisonLabelRu: "к прошлой неделе"
    };
  }

  const start = now.startOf("month");
  const end = start.plus({ months: 1 });
  const prevStart = start.minus({ months: 1 });
  const prevEnd = start;
  return {
    timezone: tz,
    current: toRange(start, end),
    previous: toRange(prevStart, prevEnd),
    comparisonLabelRu: "к прошлому месяцу"
  };
};

export type MetricDirection = "positive" | "negative" | "neutral";

export type CountMetric = {
  label: string;
  value: number;
  previousValue: number;
  deltaValue: number;
  deltaPercent: number | null;
  deltaIsInfinite: boolean;
  direction: MetricDirection;
  deltaLabel: string;
};

export type TimeMetric = {
  label: string;
  value: number;
  previousValue: number;
  deltaValue: number;
  direction: MetricDirection;
  deltaLabel: string;
};

export type RateMetric = {
  label: string;
  value: number; // 0..100
  previousValue: number; // 0..100
  deltaValue: number; // percentage points
  direction: MetricDirection;
  deltaLabel: string;
};

const toDirection = (delta: number): MetricDirection => (delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral");

const formatSignedInt = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `-${Math.abs(n)}` : "0");

export const buildCountMetric = (params: {
  label: string;
  value: number;
  previousValue: number;
}): CountMetric => {
  const value = Math.trunc(params.value);
  const previousValue = Math.trunc(params.previousValue);
  const deltaValue = value - previousValue;

  let deltaPercent: number | null = null;
  let deltaIsInfinite = false;
  let deltaLabel = "0%";

  if (previousValue > 0) {
    deltaPercent = ((deltaValue / previousValue) * 100);
    const rounded = Math.round(deltaPercent);
    deltaLabel = `${rounded > 0 ? "+" : rounded < 0 ? "-" : ""}${Math.abs(rounded)}%`;
  } else if (previousValue === 0 && value === 0) {
    deltaPercent = 0;
    deltaLabel = "0%";
  } else if (previousValue === 0 && value > 0) {
    deltaPercent = null;
    deltaIsInfinite = true;
    deltaLabel = "+∞%";
  }

  return {
    label: params.label,
    value,
    previousValue,
    deltaValue,
    deltaPercent,
    deltaIsInfinite,
    direction: toDirection(deltaValue),
    deltaLabel
  };
};

export const buildTimeMetricMinutesLowerIsBetter = (params: {
  label: string;
  value: number;
  previousValue: number;
}): TimeMetric => {
  const value = Math.max(0, Math.round(params.value));
  const previousValue = Math.max(0, Math.round(params.previousValue));
  const deltaValue = value - previousValue;

  // Lower time is better: invert direction vs delta sign.
  const direction: MetricDirection =
    deltaValue < 0 ? "positive" : deltaValue > 0 ? "negative" : "neutral";

  return {
    label: params.label,
    value,
    previousValue,
    deltaValue,
    direction,
    deltaLabel: `${formatSignedInt(deltaValue)} мин`
  };
};

export const buildRateMetricPp = (params: {
  label: string;
  value: number; // 0..100
  previousValue: number; // 0..100
}): RateMetric => {
  const value = Math.max(0, Math.min(100, Math.round(params.value)));
  const previousValue = Math.max(0, Math.min(100, Math.round(params.previousValue)));
  const deltaValue = value - previousValue;
  const sign = deltaValue > 0 ? "+" : deltaValue < 0 ? "-" : "";
  return {
    label: params.label,
    value,
    previousValue,
    deltaValue,
    direction: toDirection(deltaValue),
    deltaLabel: `${sign}${Math.abs(deltaValue)} п.п.`
  };
};

