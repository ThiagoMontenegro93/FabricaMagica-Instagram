/** Logs JSON estruturados (Logtail/Sentry leem stdout). Nunca logar senha, token ou documento. */
type Level = "info" | "warn" | "error";

export interface LogFields {
  action: string;
  tenantId?: string;
  userId?: string;
  target?: string;
  [key: string]: unknown;
}

export function log(level: Level, fields: LogFields) {
  const line = JSON.stringify({ level, time: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (process.env.NODE_ENV !== "test") console.log(line);
}
