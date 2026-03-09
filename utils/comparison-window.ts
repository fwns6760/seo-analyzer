export const comparisonWindowDays = 14;

type ComparisonWindowStatus = {
  activeDays: number;
  targetDays: number;
  remainingDays: number;
  readyByWindow: boolean;
  etaDate: string | null;
};

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function addDaysToDateString(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day + days));

  return `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}-${padDatePart(
    date.getUTCDate(),
  )}`;
}

export function getComparisonWindowStatus(
  activeDays: number | null | undefined,
  latestDate: string | null | undefined,
): ComparisonWindowStatus {
  const normalizedActiveDays = Math.max(0, Math.floor(activeDays ?? 0));
  const readyByWindow = normalizedActiveDays >= comparisonWindowDays;
  const remainingDays = readyByWindow ? 0 : Math.max(comparisonWindowDays - normalizedActiveDays, 0);

  return {
    activeDays: normalizedActiveDays,
    targetDays: comparisonWindowDays,
    remainingDays,
    readyByWindow,
    etaDate: latestDate ? addDaysToDateString(latestDate, remainingDays) : null,
  };
}
