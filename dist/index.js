import { loadConfig } from './config.js';
import { AzureDevOpsClient } from './azure-devops/client.js';
import { FieldResolver } from './azure-devops/fields.js';
import { WorkItemService } from './azure-devops/workItems.js';
import { toUserMessage } from './azure-devops/errors.js';
import { createApp } from './app.js';
import { logger, registerSecret } from './utils/logger.js';
async function main() {
    const config = loadConfig();
    registerSecret(config.pat);
    registerSecret(config.authToken);
    if (!config.authToken) {
        if (config.isProduction) {
            throw new Error('MCP_AUTH_TOKEN é obrigatório em produção: sem ele qualquer pessoa com a URL poderia lançar horas.');
        }
        logger.warn('MCP_AUTH_TOKEN não configurado: endpoint /mcp sem proteção (aceitável só em desenvolvimento local).');
    }
    const client = new AzureDevOpsClient(config);
    const fields = new FieldResolver(client, { hoursField: config.hoursField, estimateField: config.estimateField });
    const workItems = new WorkItemService(client, fields);
    // Valida o PAT sem derrubar o servidor (o Azure pode estar fora do ar no boot).
    client
        .validateToken()
        .then(({ user }) => {
        logger.info('PAT válido', { user, org: config.org, project: config.project });
        return fields.resolve();
    })
        .catch((err) => logger.warn('Não foi possível validar o PAT/campos no startup', { error: toUserMessage(err) }));
    const app = createApp({ workItems, timezone: config.timezone }, { authToken: config.authToken });
    const server = app.listen(config.port, '0.0.0.0', () => {
        logger.info(`MCP server ouvindo na porta ${config.port}`, { endpoint: '/mcp' });
    });
    const shutdown = (signal) => {
        logger.info(`Recebido ${signal}, encerrando`);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}
main().catch((err) => {
    logger.error('Falha ao iniciar', { error: err.message });
    process.exit(1);
});
//# sourceMappingURL=index.js.map