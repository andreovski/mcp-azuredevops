import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logWorkItemHoursShape } from '../utils/validation.js';
import { todayIn, toolError, toolResult } from '../utils/format.js';
import type { ToolDeps } from './types.js';

export function registerLogWorkItemHours(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'logWorkItemHours',
    {
      title: 'Lançar horas em um work item',
      description:
        'Soma as horas ao campo "Horas consumidas" de um work item do Azure DevOps e registra data, atividade e descrição no histórico. ' +
        'Se a task estiver em New, ela é movida para Active (com "Data de início" = date), pois o processo bloqueia horas em New.',
      inputSchema: logWorkItemHoursShape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) => {
      try {
        const date = args.date ?? todayIn(deps.timezone);
        const r = await deps.workItems.addHours({ ...args, date });
        return toolResult({ success: true, status: 'success', date, ...r });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
