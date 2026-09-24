import { logWorkItemHoursShape } from '../utils/validation.js';
import { todayIn, toolError, toolResult } from '../utils/format.js';
export function registerLogWorkItemHours(server, deps) {
    server.registerTool('logWorkItemHours', {
        title: 'Lançar horas em um work item',
        description: 'Soma as horas ao campo "Horas consumidas" de um work item do Azure DevOps e registra data, atividade e descrição no histórico. ' +
            'Se a task estiver em New, ela é movida para Active (com "Data de início" = date), pois o processo bloqueia horas em New.',
        inputSchema: logWorkItemHoursShape,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, async (args) => {
        try {
            const date = args.date ?? todayIn(deps.timezone);
            const r = await deps.workItems.addHours({ ...args, date });
            return toolResult({ success: true, status: 'success', date, ...r });
        }
        catch (err) {
            return toolError(err);
        }
    });
}
//# sourceMappingURL=logWorkItemHours.js.map