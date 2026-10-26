/** "850,00" ou "850" -> 85000 centavos. Retorna NaN se inválido. */
export function reaisToCents(value: string): number {
  const clean = value.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(clean);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export function centsToReais(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
