const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function assertIsoDate(value, label = "date") {
  if (typeof value !== "string" || !ISO_DATE.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD format: ${String(value)}`);
  }

  const [, year, month, day] = value.match(ISO_DATE);
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new Error(`${label} is not a valid calendar date: ${value}`);
  }
  return value;
}

export function dateInTimezone(now, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function calendarDayDifference(fromIso, toIso) {
  assertIsoDate(fromIso, "from date");
  assertIsoDate(toIso, "to date");
  return (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000;
}

export function toSiteDate(isoDate) {
  return assertIsoDate(isoDate).replaceAll("-", "/");
}
