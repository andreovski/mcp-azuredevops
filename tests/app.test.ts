import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { WorkItemService } from '../src/azure-devops/workItems.js';

const TOKEN = 'test-token-1234567890abcdef';
let server: Server;
let base: string;

const addHours = vi.fn(async (i: { workItemId: number; hours: number }) => ({
  workItemId: i.workItemId, title: 'T', hoursLogged: i.hours, previousHours: 0, newTotal: i.hours, field: 'F', url: 'u',
}));
const fakeService = { addHours, get: vi.fn(), list: vi.fn() } as unknown as WorkItemService;

const rpc = (method: string, params: unknown = {}) => ({ jsonrpc: '2.0', id: 1, method, params });
const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };

async function call(path: string, body: unknown, extra: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as any };
}

beforeAll(async () => {
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const app = createApp({ workItems: fakeService, timezone: 'America/Sao_Paulo' }, { authToken: TOKEN });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

describe('HTTP / MCP', () => {
  it('/health responde ok', async () => {
    const res = await fetch(`${base}/health`);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('recusa sem token', async () => {
    expect((await call('/mcp', rpc('tools/list'))).status).toBe(401);
    expect((await call('/mcp/errado', rpc('tools/list'))).status).toBe(401);
  });

  it('lista as 4 tools com token no path ou Bearer', async () => {
    const viaPath = await call(`/mcp/${TOKEN}`, rpc('tools/list'));
    expect(viaPath.status).toBe(200);
    expect(viaPath.json.result.tools.map((t: any) => t.name).sort()).toEqual(['getWorkItem', 'listWorkItems', 'logBatchHours', 'logWorkItemHours']);
    const viaBearer = await call('/mcp', rpc('tools/list'), { Authorization: `Bearer ${TOKEN}` });
    expect(viaBearer.status).toBe(200);
  });

  it('logBatchHours devolve o formato esperado', async () => {
    const { json } = await call(
      `/mcp/${TOKEN}`,
      rpc('tools/call', { name: 'logBatchHours', arguments: { date: '2026-09-24', workItems: [{ id: '12345', hours: 4.5, description: 'X', activityType: 'Development' }] } }),
    );
    expect(json.result.structuredContent).toMatchObject({
      success: true,
      summary: { total: 4.5, successful: 1, failed: 0 },
      results: [{ workItemId: '12345', status: 'success', hoursLogged: 4.5 }],
    });
  });

  it('input inválido vira erro legível, sem chamar o Azure', async () => {
    addHours.mockClear();
    const { json } = await call(`/mcp/${TOKEN}`, rpc('tools/call', { name: 'logWorkItemHours', arguments: { workItemId: '12345', hours: 0 } }));
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toContain('maiores que zero');
    expect(addHours).not.toHaveBeenCalled();
  });
});
