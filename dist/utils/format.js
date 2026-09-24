import { toUserMessage } from '../azure-devops/errors.js';
export const round2 = (n) => Math.round(n * 100) / 100;
/** "2026-09-24" → "24/09/2026" */
export function formatDateBR(isoDate) {
    const [y, m, d] = isoDate.split('-');
    return `${d}/${m}/${y}`;
}
/** Data de hoje (YYYY-MM-DD) no fuso informado. */
export function todayIn(timezone) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Comentário gravado em System.History (HTML). */
export function historyComment(input) {
    const parts = [`⏱ <b>${input.hours}h</b> lançadas em ${formatDateBR(input.date)}`];
    if (input.activityType)
        parts.push(escapeHtml(input.activityType));
    if (input.description)
        parts.push(escapeHtml(input.description));
    return parts.join(' · ');
}
export function toolResult(data) {
    return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        structuredContent: data,
    };
}
export function toolError(err) {
    return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: toUserMessage(err) }, null, 2) }],
    };
}
//# sourceMappingURL=format.js.map