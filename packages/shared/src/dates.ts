/** Datas de evento circulam como string "YYYY-MM-DD" (dia civil no Rio de Janeiro). */
export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDate(value: string): Date {
  if (!ISO_DATE_REGEX.test(value)) throw new Error(`Data inválida: ${value}`);
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw new Error(`Data inválida: ${value}`);
  }
  return d;
}

export function isValidIsoDate(value: string): boolean {
  try {
    parseIsoDate(value);
    return true;
  } catch {
    return false;
  }
}

/** 0 = domingo ... 5 = sexta, 6 = sábado. */
export function dayOfWeek(isoDate: string): number {
  return parseIsoDate(isoDate).getUTCDay();
}

/** RN07: sexta ou sábado. */
export function isWeekendRate(isoDate: string): boolean {
  const dow = dayOfWeek(isoDate);
  return dow === 5 || dow === 6;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
