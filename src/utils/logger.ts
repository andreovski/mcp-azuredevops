/**
 * Logger mínimo em stderr. Tudo passa por redact(): o PAT e headers de
 * Authorization nunca chegam aos logs.
 */
const secrets = new Set<string>();

export function registerSecret(value: string | undefined): void {
  if (!value) return;
  secrets.add(value);
  secrets.add(Buffer.from(`:${value}`).toString('base64'));
}

export function redact(text: string): string {
  let out = text;
  for (const s of secrets) out = out.split(s).join('***');
  return out.replace(/(authorization["']?\s*[:=]\s*["']?)(basic|bearer)\s+[^\s"',}]+/gi, '$1$2 ***');
}

function write(level: string, msg: string, meta?: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta });
  process.stderr.write(redact(line) + '\n');
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => write('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write('error', msg, meta),
};
