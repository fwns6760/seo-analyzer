export function todayInTokyo() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

export function daysAgo(dateText, days) {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function resolveBatchDateRange({
  startDate = process.env.START_DATE,
  endDate = process.env.END_DATE,
  defaultDelayDays = Number(process.env.DEFAULT_DELAY_DAYS || 3),
  defaultWindowDays = Number(process.env.DEFAULT_WINDOW_DAYS || 1),
} = {}) {
  const tokyoToday = todayInTokyo();
  const resolvedEndDate = endDate || daysAgo(tokyoToday, defaultDelayDays);
  const resolvedStartDate = startDate || daysAgo(resolvedEndDate, defaultWindowDays - 1);

  if (resolvedStartDate > resolvedEndDate) {
    throw new Error(`Invalid date range: START_DATE ${resolvedStartDate} is after END_DATE ${resolvedEndDate}.`);
  }

  return {
    startDate: resolvedStartDate,
    endDate: resolvedEndDate,
    defaultDelayDays,
    defaultWindowDays,
  };
}
