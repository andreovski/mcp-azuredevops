import type { AzureDevOpsClient } from './client.js';
import { logger } from '../utils/logger.js';

export const COMPLETED_WORK = 'Microsoft.VSTS.Scheduling.CompletedWork';
export const ORIGINAL_ESTIMATE = 'Microsoft.VSTS.Scheduling.OriginalEstimate';

export type HoursFields = {
  /** Campo onde as horas são somadas ("Horas consumidas"). */
  consumed: string;
  /** Campo lido como estimativa ("Horas estimadas"). */
  estimate: string;
};

type FieldDef = { name: string; referenceName: string; type?: string };

export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

const CONSUMED_NAMES = ['horas consumidas'];
const ESTIMATE_NAMES = ['horas estimadas'];

function findByName(fields: FieldDef[], names: string[]): string | undefined {
  const wanted = names.map(normalize);
  const numeric = fields.filter((f) => !f.type || f.type === 'double' || f.type === 'integer');
  return numeric.find((f) => wanted.includes(normalize(f.name)))?.referenceName;
}

/**
 * Resolve (uma vez, com cache) os reference names dos campos de horas.
 * Ordem: env explícita → campo com nome "Horas consumidas"/"Horas estimadas" → campos padrão do Azure.
 */
export class FieldResolver {
  private cached?: Promise<HoursFields>;

  constructor(
    private readonly client: AzureDevOpsClient,
    private readonly overrides: { hoursField?: string; estimateField?: string } = {},
  ) {}

  resolve(): Promise<HoursFields> {
    if (!this.cached) {
      this.cached = this.discover().catch((err) => {
        this.cached = undefined; // permite tentar de novo na próxima chamada
        throw err;
      });
    }
    return this.cached;
  }

  private async discover(): Promise<HoursFields> {
    const { hoursField, estimateField } = this.overrides;
    if (hoursField && estimateField) return { consumed: hoursField, estimate: estimateField };

    const data = await this.client.request<{ value: FieldDef[] }>({ method: 'get', url: this.client.orgPath('/wit/fields') });
    const fields = data?.value ?? [];
    const result: HoursFields = {
      consumed: hoursField ?? findByName(fields, CONSUMED_NAMES) ?? COMPLETED_WORK,
      estimate: estimateField ?? findByName(fields, ESTIMATE_NAMES) ?? ORIGINAL_ESTIMATE,
    };
    logger.info('Campos de horas resolvidos', result);
    return result;
  }
}
