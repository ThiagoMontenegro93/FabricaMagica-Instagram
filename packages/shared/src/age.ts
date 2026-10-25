/**
 * Calcula idade em anos completos comparando ano/mês/dia em UTC,
 * para não sofrer com fuso horário (datas de nascimento vêm como YYYY-MM-DD).
 */
export function calculateAge(birthDate: Date, today: Date = new Date()): number {
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < birthDate.getUTCDate())) {
    age--;
  }
  return age;
}

/** RN01: maior de idade (18+). */
export function isAdult(birthDate: Date, today: Date = new Date()): boolean {
  return calculateAge(birthDate, today) >= 18;
}
