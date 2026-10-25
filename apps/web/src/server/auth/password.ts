import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

let dummyHash: Promise<string> | undefined;

/**
 * Compara com um hash descartável quando o e-mail não existe, para o login levar
 * o mesmo tempo e não revelar quais e-mails estão cadastrados.
 */
export async function burnPasswordCheck(plain: string): Promise<false> {
  dummyHash ??= bcrypt.hash("senha-que-nunca-vai-bater", COST);
  await bcrypt.compare(plain, await dummyHash);
  return false;
}
