import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listWorkItemsShape } from '../utils/validation.js';
import { toolError, toolResult } from '../utils/format.js';
import type { ToolDeps } from './types.js';

export function registerListWorkItems(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'listWorkItems',
    {
      title: 'Listar work items',
      description:
        'Lista work items do projeto para encontrar IDs. Por padrão: Tasks atribuídas ao dono do PAT, mais recentes primeiro. ' +
        'Filtros: state, assignedTo (nome parcial, "*" = todos), workItemType ("*" = todos), limit.',
      inputSchema: listWorkItemsShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const items = await deps.workItems.list(args);
        return toolResult({ count: items.length, workItems: items });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
