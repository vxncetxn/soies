export const toISODate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export const todayISO = (): string => {
  return toISODate(new Date());
};

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Validate a canonical local calendar Day without allowing Date normalization. */
export const isValidISODate = (value: string): boolean => {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) {
    return false;
  }

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
};

/** Resolve untrusted route/deep-link input to one canonical Day. */
export const validISODateOr = (value: unknown, fallback: string): string => {
  return typeof value === "string" && isValidISODate(value) ? value : fallback;
};

export const parseISO = (iso: string): Date => {
  const [year, month, day] = iso.split("-").map(Number);

  return new Date(year, month - 1, day);
};

export const addDaysISO = (iso: string, days: number): string => {
  const date = parseISO(iso);

  date.setDate(date.getDate() + days);

  return toISODate(date);
};

export const formatDisplayDate = (iso: string): string => {
  return parseISO(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};
