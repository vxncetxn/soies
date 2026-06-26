export const toISODate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export const todayISO = (): string => {
  return toISODate(new Date());
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
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};
