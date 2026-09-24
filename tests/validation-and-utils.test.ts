import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { logBatchHoursShape, logWorkItemHoursShape } from '../src/utils/validation.js';
import { RateLimiter } from '../src/utils/rateLimiter.js';
import { redact, registerSecret } from '../src/utils/logger.js';
import { loadConfig } from '../src/config.js';

const single = z.object(logWorkItemHoursShape);
const batch = z.object(logBatchHoursShape);

describe('validação', () => {
  it('aceita o exemplo do enunciado e converte ID string em número', () => {
    const r = single.parse({ workItemId: '12345', hours: 4.5, description: 'X', activityType: 'Development', date: '2026-09-24' });
    expect(r.workItemId).toBe(12345);
  });

  it.each([
    [{ workItemId: '12345', hours: 0 }, 'maiores que zero'],
    [{ workItemId: '12345', hours: -1 }, 'maiores que zero'],
    [{ workItemId: '12345', hours: 25 }, '24h'],
    [{ workItemId: 'abc', hours: 1 }, 'apenas números'],
    [{ workItemId: -3, hours: 1 }, 'positivo'],
    [{ workItemId: '1', hours: 1, date: '24/09/2026' }, 'YYYY-MM-DD'],
    [{ workItemId: '1', hours: 1, date: '2026-02-30' }, 'inexistente'],
  ])('rejeita %j', (input, msg) => {
    const r = single.safeParse(input);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain(msg);
  });

  it('rejeita lote vazio', () => {
    expect(batch.safeParse({ workItems: [] }).success).toBe(false);
  });

  it('gera JSON Schema para o MCP', () => {
    const schema = z.toJSONSchema(batch, { io: 'input' }) as any;
    expect(schema.properties.workItems.type).toBe('array');
  });
});

describe('RateLimiter', () => {
  it('11 chamadas com limite 10/s levam pelo menos ~1s', async () => {
    const limiter = new RateLimiter(10, 1000);
    const start = Date.now();
    await Promise.all(Array.from({ length: 11 }, () => limiter.acquire()));
    expect(Date.now() - start).toBeGreaterThanOrEqual(990);
  });
});

describe('logger', () => {
  it('mascara segredos registrados e headers Authorization', () => {
    registerSecret('supersecretpat1234567890');
    expect(redact('token=supersecretpat1234567890')).toBe('token=***');
    expect(redact('{"authorization":"Basic Zm9vYmFy"}')).toBe('{"authorization":"Basic ***"}');
  });
});

describe('config', () => {
  const base = { AZURE_DEVOPS_ORG: 'org', AZURE_DEVOPS_PROJECT: 'proj', AZURE_DEVOPS_PAT: 'a'.repeat(52) };

  it('carrega valores e defaults', () => {
    const c = loadConfig({ ...base, AZURE_DEVOPS_HOURS_FIELD: '' });
    expect(c).toMatchObject({ port: 3000, timezone: 'America/Sao_Paulo', hoursField: undefined });
  });

  it('decodifica nome de projeto copiado da URL', () => {
    expect(loadConfig({ ...base, AZURE_DEVOPS_PROJECT: 'Plataforma%20Super%20App' }).project).toBe('Plataforma Super App');
    expect(loadConfig({ ...base, AZURE_DEVOPS_PROJECT: 'Plataforma Super App' }).project).toBe('Plataforma Super App');
  });

  it('falha sem PAT sem expor valores', () => {
    expect(() => loadConfig({ ...base, AZURE_DEVOPS_PAT: '' })).toThrow('AZURE_DEVOPS_PAT');
  });
});
