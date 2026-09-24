import { listWorkItemsShape } from '../utils/validation.js';
import { toolError, toolResult } from '../utils/format.js';
export function registerListWorkItems(server, deps) {
    server.registerTool('listWorkItems', {
        title: 'Listar work items',
        description: 'Lista work items do projeto para encontrar IDs. Por padrão: Tasks atribuídas ao dono do PAT, mais recentes primeiro. ' +
            'Filtros: state, assignedTo (nome parcial, "*" = todos), workItemType ("*" = todos), limit.',
        inputSchema: listWorkItemsShape,
        annotations: { readOnlyHint: true, openWorldHint: true },
    }, async (args) => {
        try {
            const items = await deps.workItems.list(args);
            return toolResult({ count: items.length, workItems: items });
        }
        catch (err) {
            return toolError(err);
        }
    });
}
//# sourceMappingURL=listWorkItems.js.map