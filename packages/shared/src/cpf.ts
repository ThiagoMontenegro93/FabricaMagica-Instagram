/** Remove tudo que não for dígito. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function checkDigit(digits: number[], weightStart: number): number {
  const sum = digits.reduce((acc, d, i) => acc + d * (weightStart - i), 0);
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

/** RN04: valida CPF pelos dígitos verificadores. Aceita com ou sem máscara. */
export function isValidCPF(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  // Sequências repetidas (000.000.000-00, 111...) passam no cálculo mas são inválidas.
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const nums = cpf.split("").map(Number);
  const d1 = checkDigit(nums.slice(0, 9), 10);
  const d2 = checkDigit(nums.slice(0, 10), 11);
  return d1 === nums[9] && d2 === nums[10];
}

/** Formata 11 dígitos como 000.000.000-00. */
export function formatCPF(value: string): string {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return value;
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}
