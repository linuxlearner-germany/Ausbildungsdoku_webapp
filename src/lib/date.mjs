function pad(value) {
  return String(value).padStart(2, "0");
}

export function createLocalDate(year, monthIndex, day) {
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

export function parseLocalDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return createLocalDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return createLocalDate(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function toLocalDateString(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getTodayLocalDateString() {
  return toLocalDateString(new Date());
}

export function addDaysToLocalDate(date, amount) {
  const next = createLocalDate(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + amount);
  return createLocalDate(next.getFullYear(), next.getMonth(), next.getDate());
}

export function getMondayBasedDayIndex(date) {
  return (date.getDay() + 6) % 7;
}

export function startOfLocalWeek(date) {
  return addDaysToLocalDate(date, -getMondayBasedDayIndex(date));
}

export function startOfLocalMonth(date) {
  return createLocalDate(date.getFullYear(), date.getMonth(), 1);
}

export function buildLocalWeekDates(value) {
  const date = value instanceof Date ? value : parseLocalDate(value);
  if (!date) return [];

  const monday = startOfLocalWeek(date);
  return Array.from({ length: 7 }, (_, index) => toLocalDateString(addDaysToLocalDate(monday, index)));
}

export function buildCalendarGridDates(value) {
  const date = value instanceof Date ? value : parseLocalDate(value);
  if (!date) return [];

  const monthStart = startOfLocalMonth(date);
  const firstGridDay = addDaysToLocalDate(monthStart, -getMondayBasedDayIndex(monthStart));
  return Array.from({ length: 42 }, (_, index) => toLocalDateString(addDaysToLocalDate(firstGridDay, index)));
}

export function formatLocalDate(value, options) {
  const date = value instanceof Date ? value : parseLocalDate(value);
  if (!date) return "";
  return date.toLocaleDateString("de-DE", options);
}
