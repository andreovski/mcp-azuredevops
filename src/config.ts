import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

/** Aceita nomes copiados da URL do navegador ("Meu%20Projeto") e os decodifica. */
const urlDecoded = (v: unknown) => {
  if (typeof v !== 'string') return v;
  try {
    return decodeURIComponent(v.trim());
  } catch {
    return v.trim();
  }
};

const EnvSchema = z.object({
  AZURE_DEVOPS_ORG: z.preprocess(urlDecoded, z.string().min(1, 'AZURE_DEVOPS_ORG não configurado')),
  AZURE_DEVOPS_PROJECT: z.preprocess(urlDecoded, z.string().min(1, 'AZURE_DEVOPS_PROJECT não configurado')),
  AZURE_DEVOPS_PAT: z
    .string()
    .trim()
    .min(20, 'AZURE_DEVOPS_PAT ausente ou curto demais')
    .regex(/^[A-Za-z0-9]+$/, 'AZURE_DEVOPS_PAT contém caracteres inválidos'),
  AZURE_DEVOPS_HOURS_FIELD: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  AZURE_DEVOPS_ESTIMATE_FIELD: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  MCP_AUTH_TOKEN: z.preprocess(emptyToUndefined, z.string().min(16, 'MCP_AUTH_TOKEN deve ter ao menos 16 caracteres').optional()),
  PORT: z.coerce.number().int().positive().default(3000),
  TIMEZONE: z.preprocess(emptyToUndefined, z.string().default('America/Sao_Paulo')),
  NODE_ENV: z.preprocess(emptyToUndefined, z.string().default('development')),
});

export type Config = {
  org: string;
  project: string;
  pat: string;
  hoursField?: string;
  estimateField?: string;
  authToken?: string;
  port: number;
  timezone: string;
  isProduction: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.message}`).join('\n');
    throw new Error(`Configuração inválida (.env):\n${problems}`);
  }
  const e = parsed.data;
  return {
    org: e.AZURE_DEVOPS_ORG,
    project: e.AZURE_DEVOPS_PROJECT,
    pat: e.AZURE_DEVOPS_PAT,
    hoursField: e.AZURE_DEVOPS_HOURS_FIELD,
    estimateField: e.AZURE_DEVOPS_ESTIMATE_FIELD,
    authToken: e.MCP_AUTH_TOKEN,
    port: e.PORT,
    timezone: e.TIMEZONE,
    isProduction: e.NODE_ENV === 'production',
  };
}
