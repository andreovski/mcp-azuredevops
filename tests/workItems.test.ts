import nock from 'nock';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureDevOpsClient } from '../src/azure-devops/client.js';
import { FieldResolver } from '../src/azure-devops/fields.js';
import { WorkItemService } from '../src/azure-devops/workItems.js';
import { runBatch } from '../src/tools/logBatchHours.js';
import { RateLimiter } from '../src/utils/rateLimiter.js';

const PAT = 'abcdefghijklmnopqrstuvwxyz0123456789';
const BASE = 'https://dev.azure.com';
const WI = '/myorg/My%20Project/_apis/wit/workitems';
const CUSTOM = 'Custom.HorasConsumidas';

function makeService(opts: { timeoutMs?: number } = {}) {
  const client = new AzureDevOpsClient(
    { org: 'myorg', project: 'My Project', pat: PAT },
    { rateLimiter: new RateLimiter(1000, 1000), retryBaseMs: 1, timeoutMs: opts.timeoutMs },
  );
  const fields = new FieldResolver(client);
  return new WorkItemService(client, fields);
}

function mockFields() {
  return nock(BASE)
    .get('/myorg/_apis/wit/fields')
    .query(true)
    .reply(200, {
      value: [
        { name: 'Completed Work', referenceName: 'Microsoft.VSTS.Scheduling.CompletedWork', type: 'double' },
        { name: 'Horas Consumidas', referenceName: CUSTOM, type: 'double' },
        { name: 'Horas estimadas', referenceName: 'Custom.HorasEstimadas', type: 'double' },
      ],
    });
}

function mockGet(id: number, rev: number, consumed?: number, status = 200) {
  return nock(BASE)
    .get(`${WI}/${id}`)
    .query(true)
    .reply(status, status === 200
      ? { id, rev, fields: { 'System.Title': `Item ${id}`, 'System.WorkItemType': 'Task', 'System.State': 'Active', ...(consumed !== undefined ? { [CUSTOM]: consumed } : {}) } }
      : { message: 'erro' });
}

beforeAll(() => nock.disableNetConnect());
beforeEach(() => vi.spyOn(process.stderr, 'write').mockImplementation(() => true));
afterEach(() => {
  nock.cleanAll();
  vi.restoreAllMocks();
});

describe('addHours', () => {
  it('descobre o campo "Horas consumidas", soma ao valor atual e grava histórico', async () => {
    mockFields();
    mockGet(12345, 7, 2.5);
    let body: any;
    let headers: any;
    nock(BASE)
      .patch(`${WI}/12345`, (b) => ((body = b), true))
      .query({ 'api-version': '7.1' })
      .reply(function () {
        headers = this.req.headers;
        return [200, { id: 12345, rev: 8 }];
      });

    const r = await makeService().addHours({ workItemId: 12345, hours: 4.5, date: '2026-09-24', activityType: 'Development', description: 'Feature <X>' });

    expect(r).toMatchObject({ previousHours: 2.5, newTotal: 7, hoursLogged: 4.5, field: CUSTOM });
    expect(body[0]).toEqual({ op: 'test', path: '/rev', value: 7 });
    expect(body[1]).toEqual({ op: 'add', path: `/fields/${CUSTOM}`, value: 7 });
    expect(body[2].path).toBe('/fields/System.History');
    expect(body[2].value).toContain('24/09/2026');
    expect(body[2].value).toContain('Development');
    expect(body[2].value).toContain('Feature &lt;X&gt;');
    expect(headers['content-type']).toBe('application/json-patch+json');
    expect(headers.authorization).toBe(`Basic ${Buffer.from(`:${PAT}`).toString('base64')}`);
  });

  it('trata campo vazio como 0 e não mexe em Remaining Work', async () => {
    mockFields();
    mockGet(1, 1);
    let body: any;
    nock(BASE).patch(`${WI}/1`, (b) => ((body = b), true)).query(true).reply(200, {});
    const r = await makeService().addHours({ workItemId: 1, hours: 1.25, date: '2026-09-24' });
    expect(r.newTotal).toBe(1.25);
    expect(JSON.stringify(body)).not.toContain('RemainingWork');
  });

  it('relê e tenta de novo quando o rev mudou (412)', async () => {
    mockFields();
    mockGet(5, 1, 1);
    nock(BASE).patch(`${WI}/5`).query(true).reply(412, { message: 'precondition failed' });
    mockGet(5, 2, 3);
    let body: any;
    nock(BASE).patch(`${WI}/5`, (b) => ((body = b), true)).query(true).reply(200, {});
    const r = await makeService().addHours({ workItemId: 5, hours: 1, date: '2026-09-24' });
    expect(r.newTotal).toBe(4);
    expect(body[0].value).toBe(2);
  });

  it.each([
    [401, 'PAT inválido'],
    [203, 'PAT inválido'],
    [403, 'Sem permissão'],
    [404, 'não existe'],
  ])('mapeia HTTP %i para mensagem clara', async (status, msg) => {
    mockFields();
    mockGet(99, 1, 0, status);
    await expect(makeService().addHours({ workItemId: 99, hours: 1, date: '2026-09-24' })).rejects.toThrow(msg);
  });

  it('mapeia 400 de campo inexistente no tipo do item', async () => {
    mockFields();
    mockGet(3, 1, 0);
    nock(BASE).patch(`${WI}/3`).query(true).reply(400, { message: `TF51535: Cannot find field ${CUSTOM}.` });
    await expect(makeService().addHours({ workItemId: 3, hours: 1, date: '2026-09-24' })).rejects.toThrow('não aceita o campo de horas');
  });

  it('mapeia timeout para erro de conexão amigável', async () => {
    mockFields();
    nock(BASE).get(`${WI}/8`).query(true).delay(200).reply(200, {});
    await expect(makeService({ timeoutMs: 50 }).addHours({ workItemId: 8, hours: 1, date: '2026-09-24' })).rejects.toThrow('Tempo esgotado');
  });

  it('refaz após 429 respeitando o limite de retries', async () => {
    mockFields();
    nock(BASE).get(`${WI}/4`).query(true).reply(429, {}, { 'Retry-After': '0' });
    mockGet(4, 1, 0);
    nock(BASE).patch(`${WI}/4`).query(true).reply(200, {});
    const r = await makeService().addHours({ workItemId: 4, hours: 2, date: '2026-09-24' });
    expect(r.newTotal).toBe(2);
  });

  it('usa CompletedWork quando não há campo "Horas consumidas"', async () => {
    nock(BASE).get('/myorg/_apis/wit/fields').query(true).reply(200, { value: [] });
    nock(BASE).get(`${WI}/6`).query(true).reply(200, { id: 6, rev: 1, fields: { 'Microsoft.VSTS.Scheduling.CompletedWork': 1 } });
    let body: any;
    nock(BASE).patch(`${WI}/6`, (b) => ((body = b), true)).query(true).reply(200, {});
    const r = await makeService().addHours({ workItemId: 6, hours: 1, date: '2026-09-24' });
    expect(r.field).toBe('Microsoft.VSTS.Scheduling.CompletedWork');
    expect(body[1].value).toBe(2);
  });
});

describe('runBatch', () => {
  it('continua após falha e soma IDs repetidos', async () => {
    mockFields();
    mockGet(10, 1, 0);
    nock(BASE).patch(`${WI}/10`).query(true).reply(200, {});
    mockGet(404, 1, 0, 404);
    mockGet(10, 2, 3);
    let lastBody: any;
    nock(BASE).patch(`${WI}/10`, (b) => ((lastBody = b), true)).query(true).reply(200, {});

    const result = await runBatch(
      makeService(),
      { date: '2026-09-24', workItems: [{ id: 10, hours: 3 }, { id: 404, hours: 2 }, { id: 10, hours: 1.5 }] },
      'America/Sao_Paulo',
    );

    expect(result.success).toBe(false);
    expect(result.summary).toEqual({ total: 4.5, successful: 2, failed: 1 });
    expect(result.results[1]).toMatchObject({ workItemId: '404', status: 'failed' });
    expect(result.results[1]).toHaveProperty('error', expect.stringContaining('não existe'));
    expect(lastBody[1].value).toBe(4.5);
  });
});

describe('list', () => {
  it('monta WIQL com filtros escapados e busca os campos', async () => {
    mockFields();
    let wiql: any;
    nock(BASE)
      .post('/myorg/My%20Project/_apis/wit/wiql', (b) => ((wiql = b), true))
      .query({ 'api-version': '7.1', $top: '20' })
      .reply(200, { workItems: [{ id: 1 }, { id: 2 }] });
    nock(BASE)
      .post('/myorg/My%20Project/_apis/wit/workitemsbatch')
      .query(true)
      .reply(200, {
        value: [
          { id: 1, rev: 1, fields: { 'System.Title': 'A', 'System.AssignedTo': { displayName: "André D'Ávila" }, [CUSTOM]: 3, 'Custom.HorasEstimadas': 8 } },
          { id: 2, rev: 1, fields: { 'System.Title': 'B' } },
        ],
      });

    const items = await makeService().list({ state: 'In Progress', assignedTo: "D'Ávila", limit: 20 });
    expect(wiql.query).toContain("[System.AssignedTo] CONTAINS 'D''Ávila'");
    expect(wiql.query).toContain("[System.State] = 'In Progress'");
    expect(wiql.query).toContain("[System.WorkItemType] = 'Task'");
    expect(items[0]).toMatchObject({ id: 1, assignedTo: "André D'Ávila", consumedHours: 3, estimatedHours: 8 });
  });
});

describe('segurança', () => {
  it('nunca escreve o PAT nos logs', async () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockFields();
    mockGet(77, 1, 0, 401);
    await expect(makeService().addHours({ workItemId: 77, hours: 1, date: '2026-09-24' })).rejects.toThrow();
    const logged = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged.length).toBeGreaterThan(0);
    expect(logged).not.toContain(PAT);
    expect(logged).not.toContain(Buffer.from(`:${PAT}`).toString('base64'));
  });
});
