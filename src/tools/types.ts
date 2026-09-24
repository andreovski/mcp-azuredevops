import type { WorkItemService } from '../azure-devops/workItems.js';

export type ToolDeps = {
  workItems: WorkItemService;
  timezone: string;
};
