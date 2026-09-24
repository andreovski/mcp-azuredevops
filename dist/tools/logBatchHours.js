import { logBatchHoursShape } from '../utils/validation.js';
import { round2, todayIn, toolResult } from '../utils/format.js';
import { toUserMessage } from '../azure-devops/errors.js';
/**
 * Processa em sequência: IDs repetidos somam corretamente e o rate limit é
 * respeitado. Uma falha não interrompe os demais itens.
 */
export async function runBatch(service, input, timezone) {
    const date = input.date ?? todayIn(timezone);
    const results = [];
    for (const item of input.workItems) {
        try {
            const r = await service.addHours({ workItemId: item.id, hours: item.hours, date, description: item.description, activityType: item.activityType });
            results.push({
                workItemId: String(item.id),
                status: 'success',
                hoursLogged: r.hoursLogged,
                newTotal: r.newTotal,
                title: r.title,
                ...(r.activated ? { activated: true } : {}),
            });
        }
        catch (err) {
            results.push({ workItemId: String(item.id), status: 'failed', hoursLogged: 0, error: toUserMessage(err) });
        }
    }
    const ok = results.filter((r) => r.status === 'success');
    return {
        success: ok.length === results.length,
        date,
        summary: {
            total: round2(ok.reduce((sum, r) => sum + r.hoursLogged, 0)),
            successful: ok.length,
            failed: results.length - ok.length,
        },
        results,
    };
}
export function registerLogBatchHours(server, deps) {
    server.registerTool('logBatchHours', {
        title: 'Lançar horas em lote',
        description: 'Lança horas em vários work items de uma vez (mesma data). Cada item soma ao campo "Horas consumidas" e ganha um comentário no histórico. ' +
            'Tasks em New são movidas para Active (com "Data de início" = date) na mesma alteração, pois o processo bloqueia horas em New. ' +
            'Falhas em um item não impedem os outros; confira "results" para ver o status de cada um.',
        inputSchema: logBatchHoursShape,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, async (args) => {
        const result = await runBatch(deps.workItems, args, deps.timezone);
        return { ...toolResult(result), isError: result.summary.successful === 0 };
    });
}
//# sourceMappingURL=logBatchHours.js.map