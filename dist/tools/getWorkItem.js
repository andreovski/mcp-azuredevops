import { getWorkItemShape } from '../utils/validation.js';
import { toolError, toolResult } from '../utils/format.js';
export function registerGetWorkItem(server, deps) {
    server.registerTool('getWorkItem', {
        title: 'Consultar work item',
        description: 'Busca título, tipo, estado, responsável e horas (estimadas/consumidas) de um work item. Útil para validar antes de lançar.',
        inputSchema: getWorkItemShape,
        annotations: { readOnlyHint: true, openWorldHint: true },
    }, async ({ workItemId }) => {
        try {
            return toolResult(await deps.workItems.get(workItemId));
        }
        catch (err) {
            return toolError(err);
        }
    });
}
//# sourceMappingURL=getWorkItem.js.map