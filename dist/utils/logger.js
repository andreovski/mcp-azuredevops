/**
 * Logger mínimo em stderr. Tudo passa por redact(): o PAT e headers de
 * Authorization nunca chegam aos logs.
 */
const secrets = new Set();
export function registerSecret(value) {
    if (!value)
        return;
    secrets.add(value);
    secrets.add(Buffer.from(`:${value}`).toString('base64'));
}
export function redact(text) {
    let out = text;
    for (const s of secrets)
        out = out.split(s).join('***');
    return out.replace(/(authorization["']?\s*[:=]\s*["']?)(basic|bearer)\s+[^\s"',}]+/gi, '$1$2 ***');
}
function write(level, msg, meta) {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta });
    process.stderr.write(redact(line) + '\n');
}
export const logger = {
    info: (msg, meta) => write('info', msg, meta),
    warn: (msg, meta) => write('warn', msg, meta),
    error: (msg, meta) => write('error', msg, meta),
};
//# sourceMappingURL=logger.js.map