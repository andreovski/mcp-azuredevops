import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import type { Config } from '../config.js';
import { RateLimiter } from '../utils/rateLimiter.js';
import { logger, registerSecret } from '../utils/logger.js';
import { AzureDevOpsError, fromAxiosError } from './errors.js';

const API_VERSION = '7.1';
const MAX_RETRIES = 2;

export type ClientOptions = {
  timeoutMs?: number;
  rateLimiter?: RateLimiter;
  /** Espera entre retries de 429/503 quando o Azure não manda Retry-After. */
  retryBaseMs?: number;
};

export class AzureDevOpsClient {
  readonly org: string;
  readonly project: string;
  private readonly http: AxiosInstance;
  private readonly limiter: RateLimiter;
  private readonly retryBaseMs: number;

  constructor(config: Pick<Config, 'org' | 'project' | 'pat'>, options: ClientOptions = {}) {
    this.org = config.org;
    this.project = config.project;
    this.limiter = options.rateLimiter ?? new RateLimiter(10, 1000);
    this.retryBaseMs = options.retryBaseMs ?? 1000;
    registerSecret(config.pat);

    this.http = axios.create({
      baseURL: `https://dev.azure.com/${encodeURIComponent(config.org)}`,
      timeout: options.timeoutMs ?? 15_000,
      // Com PAT inválido o Azure responde 203 (página de login) ou 302; tratamos como erro.
      maxRedirects: 0,
      validateStatus: (s) => s >= 200 && s < 300 && s !== 203,
      headers: {
        Authorization: `Basic ${Buffer.from(`:${config.pat}`).toString('base64')}`,
        Accept: 'application/json',
      },
      params: { 'api-version': API_VERSION },
    });
  }

  /** Caminho relativo ao projeto: /{project}/_apis/... */
  projectPath(path: string): string {
    return `/${encodeURIComponent(this.project)}/_apis${path}`;
  }

  /** Caminho relativo à organização: /_apis/... */
  orgPath(path: string): string {
    return `/_apis${path}`;
  }

  webUrl(workItemId: number): string {
    return `https://dev.azure.com/${encodeURIComponent(this.org)}/${encodeURIComponent(this.project)}/_workitems/edit/${workItemId}`;
  }

  async request<T>(config: AxiosRequestConfig, context: { workItemId?: number } = {}): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      await this.limiter.acquire();
      try {
        const res = await this.http.request<T>(config);
        return res.data;
      } catch (err) {
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        if ((status === 429 || status === 503) && attempt < MAX_RETRIES) {
          const retryAfter = Number(axios.isAxiosError(err) ? err.response?.headers?.['retry-after'] : NaN);
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : this.retryBaseMs * (attempt + 1);
          logger.warn('Azure DevOps pediu para desacelerar; tentando de novo', { status, waitMs, attempt: attempt + 1 });
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        const mapped = fromAxiosError(err, context);
        logger.error('Falha na chamada ao Azure DevOps', {
          method: config.method ?? 'get',
          url: config.url,
          status: mapped.status,
          code: mapped.code,
        });
        throw mapped;
      }
    }
  }

  /** Valida o PAT chamando connectionData. Lança AzureDevOpsError se inválido. */
  async validateToken(): Promise<{ user: string }> {
    const data = await this.request<{ authenticatedUser?: { providerDisplayName?: string } }>({
      method: 'get',
      url: this.orgPath('/connectionData'),
      params: { 'api-version': '7.1-preview' },
    });
    const user = data?.authenticatedUser?.providerDisplayName;
    if (!user) throw new AzureDevOpsError('UNAUTHORIZED', 'PAT inválido ou expirado.', 401);
    return { user };
  }
}
