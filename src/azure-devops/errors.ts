import { AxiosError } from 'axios';

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'CONNECTION'
  | 'VALIDATION'
  | 'UNKNOWN';

export class AzureDevOpsError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'AzureDevOpsError';
  }
}

function azureMessage(data: unknown): string | undefined {
  if (data && typeof data === 'object' && 'message' in data && typeof (data as { message: unknown }).message === 'string') {
    return (data as { message: string }).message;
  }
  return undefined;
}

/** Converte qualquer erro do axios numa mensagem clara em pt-BR (sem vazar headers). */
export function fromAxiosError(err: unknown, context: { workItemId?: number } = {}): AzureDevOpsError {
  if (err instanceof AzureDevOpsError) return err;
  const ax = err as AxiosError;
  if (!ax || !ax.isAxiosError) {
    return new AzureDevOpsError('UNKNOWN', `Erro inesperado: ${(err as Error)?.message ?? String(err)}`);
  }

  if (ax.code === 'ECONNABORTED' || ax.code === 'ETIMEDOUT' || /timeout/i.test(ax.message)) {
    return new AzureDevOpsError('TIMEOUT', 'Tempo esgotado ao falar com o Azure DevOps. Tente novamente em instantes.');
  }
  if (!ax.response) {
    return new AzureDevOpsError(
      'CONNECTION',
      `Erro de conexão com o Azure DevOps (${ax.code ?? 'sem resposta'}). Verifique a rede e o nome da organização.`,
    );
  }

  const status = ax.response.status;
  const detail = azureMessage(ax.response.data);
  const wi = context.workItemId ? `Work item ${context.workItemId}` : 'Recurso';

  switch (status) {
    case 203:
    case 302:
    case 401:
      return new AzureDevOpsError('UNAUTHORIZED', 'PAT inválido ou expirado. Gere um novo token no Azure DevOps e atualize AZURE_DEVOPS_PAT.', 401);
    case 403:
      return new AzureDevOpsError('FORBIDDEN', 'Sem permissão. Verifique se o PAT tem o scope "Work Items: Read & Write" e acesso ao projeto.', 403);
    case 404:
      return new AzureDevOpsError('NOT_FOUND', `${wi} não existe ou você não tem acesso a ele.`, 404);
    case 409:
    case 412:
      return new AzureDevOpsError('CONFLICT', `${wi} foi alterado por outra pessoa durante o lançamento.`, status);
    case 429:
      return new AzureDevOpsError('RATE_LIMITED', 'O Azure DevOps limitou as requisições. Aguarde alguns segundos e tente de novo.', 429);
    case 400:
      return new AzureDevOpsError('BAD_REQUEST', `Requisição inválida${detail ? `: ${detail}` : '.'}`, 400);
    default:
      if (status >= 500) {
        return new AzureDevOpsError('CONNECTION', `O Azure DevOps está instável (HTTP ${status}). Tente novamente em instantes.`, status);
      }
      return new AzureDevOpsError('UNKNOWN', `Erro HTTP ${status}${detail ? `: ${detail}` : ''}`, status);
  }
}

export function toUserMessage(err: unknown): string {
  if (err instanceof AzureDevOpsError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
