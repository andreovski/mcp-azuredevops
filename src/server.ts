import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGetWorkItem } from './tools/getWorkItem.js';
import { registerListWorkItems } from './tools/listWorkItems.js';
import { registerLogBatchHours } from './tools/logBatchHours.js';
import { registerLogWorkItemHours } from './tools/logWorkItemHours.js';
import type { ToolDeps } from './tools/types.js';

export function createMcpServer(deps: ToolDeps): McpServer {
  const server = new McpServer(
    { name: 'azure-devops-hours', version: '1.0.0' },
    {
      instructions:
        'Lança horas em work items do Azure DevOps. Para vários itens use logBatchHours; para um só, logWorkItemHours. ' +
        'Use getWorkItem para confirmar o item e listWorkItems para descobrir IDs. As horas são SOMADAS ao total já consumido. ' +
        'Não repita um lançamento que já retornou success: isso duplicaria as horas.',
    },
  );
  registerLogBatchHours(server, deps);
  registerLogWorkItemHours(server, deps);
  registerGetWorkItem(server, deps);
  registerListWorkItems(server, deps);
  return server;
}
