import { z } from 'zod';

export const workItemIdSchema = z
  .union([
    z.number().int('O ID do work item deve ser um número inteiro').positive('O ID do work item deve ser positivo'),
    z.string().trim().regex(/^\d+$/, 'O ID do work item deve conter apenas números (ex.: "12345")'),
  ])
  .transform((v) => Number(v))
  .refine((v) => v > 0 && Number.isSafeInteger(v), 'ID de work item inválido')
  .describe('ID numérico do work item (ex.: "12345")');

export const hoursSchema = z
  .number({ error: 'Informe as horas como número (ex.: 4.5)' })
  .gt(0, 'As horas devem ser maiores que zero')
  .lte(24, 'Não é possível lançar mais de 24h em um único lançamento')
  .describe('Horas trabalhadas (> 0 e ≤ 24). Ex.: 4.5');

function isRealDate(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'A data deve estar no formato YYYY-MM-DD (ex.: 2026-09-24)')
  .refine(isRealDate, 'Data inexistente no calendário')
  .describe('Data do trabalho no formato YYYY-MM-DD. Se omitida, usa hoje.');

export const descriptionSchema = z
  .string()
  .trim()
  .max(500, 'A descrição pode ter no máximo 500 caracteres')
  .describe('O que foi feito (vai para o histórico do work item)');

export const activityTypeSchema = z
  .string()
  .trim()
  .max(100, 'O tipo de atividade pode ter no máximo 100 caracteres')
  .describe('Tipo de atividade, ex.: Development, Testing, Design, Documentation');

export const logWorkItemHoursShape = {
  workItemId: workItemIdSchema,
  hours: hoursSchema,
  description: descriptionSchema.optional(),
  activityType: activityTypeSchema.optional(),
  date: dateSchema.optional(),
};

export const batchItemSchema = z.object({
  id: workItemIdSchema,
  hours: hoursSchema,
  description: descriptionSchema.optional(),
  activityType: activityTypeSchema.optional(),
});

export const logBatchHoursShape = {
  date: dateSchema.optional(),
  workItems: z
    .array(batchItemSchema)
    .min(1, 'Envie pelo menos um work item')
    .max(50, 'Máximo de 50 work items por lote')
    .describe('Lista de lançamentos'),
};

export const getWorkItemShape = {
  workItemId: workItemIdSchema,
};

export const listWorkItemsShape = {
  state: z.string().trim().max(100).optional().describe('Estado, ex.: "In Progress", "Active", "To Do"'),
  assignedTo: z
    .string()
    .trim()
    .max(200)
    .optional()
    .describe('Nome ou e-mail do responsável (busca parcial). Padrão: o dono do PAT (@Me). Use "*" para qualquer pessoa.'),
  workItemType: z.string().trim().max(100).optional().describe('Tipo do work item. Padrão: Task. Use "*" para todos.'),
  limit: z.number().int().min(1).max(200).default(20).describe('Máximo de itens (1 a 200, padrão 20)'),
};
