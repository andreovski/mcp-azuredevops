import { timingSafeEqual } from 'node:crypto';
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';
import { logger } from './utils/logger.js';
function safeEqual(a, b) {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && timingSafeEqual(ab, bb);
}
/** Aceita o segredo como Bearer token ou como último segmento do path (/mcp/<token>). */
function authMiddleware(authToken) {
    return (req, res, next) => {
        if (!authToken)
            return next();
        const header = req.headers.authorization ?? '';
        const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
        const pathToken = typeof req.params.token === 'string' ? req.params.token : '';
        if ((bearer && safeEqual(bearer, authToken)) || (pathToken && safeEqual(pathToken, authToken)))
            return next();
        res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Não autorizado: token do MCP ausente ou inválido.' }, id: null });
    };
}
export function createApp(deps, opts) {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json({ limit: '1mb' }));
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok' });
    });
    const handleMcp = async (req, res) => {
        // Modo stateless: um servidor + transporte por requisição.
        const server = createMcpServer(deps);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        res.on('close', () => {
            void transport.close();
            void server.close();
        });
        try {
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        }
        catch (err) {
            logger.error('Erro ao processar requisição MCP', { error: err.message });
            if (!res.headersSent) {
                res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Erro interno do servidor' }, id: null });
            }
        }
    };
    const methodNotAllowed = (_req, res) => {
        res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Método não permitido (servidor stateless: use POST).' }, id: null });
    };
    const auth = authMiddleware(opts.authToken);
    for (const path of ['/mcp', '/mcp/:token']) {
        app.post(path, auth, handleMcp);
        app.get(path, auth, methodNotAllowed);
        app.delete(path, auth, methodNotAllowed);
    }
    return app;
}
//# sourceMappingURL=app.js.map