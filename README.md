# Azure DevOps Hours MCP

Servidor **MCP** (Model Context Protocol) que lança horas em work items do Azure DevOps. Você manda um JSON com as horas para o Claude (Cowork), e ele chama as ferramentas deste servidor.

- **Transporte:** Streamable HTTP (stateless) em `POST /mcp`
- **Stack:** Node.js 18+, TypeScript, Express, `@modelcontextprotocol/sdk`, axios, zod
- **URL pública:** `https://<seu-app>.up.railway.app/mcp/<MCP_AUTH_TOKEN>` _(preencha depois do deploy)_

## Como o lançamento funciona

Para cada lançamento, o servidor:

1. Lê o work item e o valor atual de **"Horas consumidas"** (seção _Esforço (horas)_).
2. Faz um `PATCH /wit/workitems/{id}` que:
   - **soma** as horas ao valor atual (ex.: 2,5h + 4,5h = 7h);
   - adiciona no **histórico/discussão** um comentário com a data, a atividade e a descrição: `⏱ 4.5h lançadas em 24/09/2026 · Development · Implementação da feature X`;
   - inclui `test /rev`: se alguém editar o item no meio do lançamento, o servidor relê o item e tenta de novo (até 3x), sem perder horas.
3. **Não altera** Remaining Work nem "Horas estimadas".

### Tasks em "New"

O processo da organização tem a regra **"Travar apontamento no status new"**: enquanto a task está em _New_, "Horas Consumidas" fica somente leitura. Para ir a _Active_, o campo **"Data de início"** é obrigatório.

Por isso, quando a task está em _New_, o servidor faz tudo **na mesma alteração**, do mesmo jeito que é feito à mão:

- muda o estado para **Active**;
- preenche **"Data de início"** com a data do lançamento, só se o campo estiver vazio;
- soma as horas.

O resultado traz `"activated": true` para avisar que a task foi ativada. Tasks em _Active_ ou _Closed_ não têm o estado alterado.

> O Azure DevOps nativo não guarda horas por data: o campo é cumulativo. Por isso a data e a descrição ficam no histórico do item.

### Qual campo é "Horas consumidas"?

O servidor descobre o campo sozinho no primeiro uso:

1. Se `AZURE_DEVOPS_HOURS_FIELD` estiver definido, usa esse reference name.
2. Senão, procura um campo chamado **"Horas consumidas"** na organização (ignora maiúsculas e acentos).
3. Se não achar, usa `Microsoft.VSTS.Scheduling.CompletedWork` (o "Completed Work"/"Concluído" padrão).

"Horas estimadas" é resolvido do mesmo jeito (`AZURE_DEVOPS_ESTIMATE_FIELD`, depois o nome, depois `OriginalEstimate`). Esse campo é só lido.

Para conferir qual campo será usado, rode o script abaixo com o ID de uma task real:

```bash
npm run discover-fields -- 12345
```

## Ferramentas (tools)

| Tool | Para quê |
|---|---|
| `logBatchHours` | Lança horas em vários work items de uma vez (principal) |
| `logWorkItemHours` | Lança horas em um work item |
| `getWorkItem` | Mostra título, tipo, estado, responsável e horas estimadas/consumidas |
| `listWorkItems` | Lista work items para achar IDs (padrão: suas Tasks, mais recentes primeiro) |

### `logBatchHours`

```json
{
  "date": "2026-09-24",
  "workItems": [
    { "id": "12345", "hours": 4.5, "description": "Implementação da feature X", "activityType": "Development" },
    { "id": "12346", "hours": 2, "description": "Code review", "activityType": "Development" }
  ]
}
```

Resposta:

```json
{
  "success": true,
  "date": "2026-09-24",
  "summary": { "total": 6.5, "successful": 2, "failed": 0 },
  "results": [
    { "workItemId": "12345", "status": "success", "hoursLogged": 4.5, "newTotal": 7, "title": "Feature X" },
    { "workItemId": "12346", "status": "success", "hoursLogged": 2, "newTotal": 2, "title": "Review" }
  ]
}
```

Comportamento do lote:

- Os itens são processados em sequência. Se o mesmo ID aparecer duas vezes, as horas somam corretamente.
- Uma falha num item não impede os outros. O item com falha vem com `"status": "failed"` e `"error"`.
- `summary.total` conta só as horas lançadas com sucesso.
- `date` é opcional; o padrão é hoje em `America/Sao_Paulo`.

### `logWorkItemHours`

```json
{ "workItemId": "12345", "hours": 4.5, "description": "Implementação da feature X", "activityType": "Development", "date": "2026-09-24" }
```

### `getWorkItem`

```json
{ "workItemId": "12345" }
```

### `listWorkItems`

```json
{ "state": "In Progress", "assignedTo": "André", "limit": 20 }
```

Filtros:

- `assignedTo`: busca parcial por nome ou e-mail. Se omitido, usa o dono do PAT (`@Me`); `"*"` traz todos.
- `workItemType`: o padrão é `Task`; `"*"` traz todos os tipos.
- `limit`: de 1 a 200.

### Validações e erros

| Situação | Mensagem |
|---|---|
| `hours` ≤ 0 ou > 24 | "As horas devem ser maiores que zero" / "…mais de 24h…" |
| ID não numérico | "O ID do work item deve conter apenas números" |
| Data inválida | "A data deve estar no formato YYYY-MM-DD" / "Data inexistente no calendário" |
| 401 / PAT expirado | "PAT inválido ou expirado…" |
| 403 | "Sem permissão. Verifique o scope do PAT…" |
| 404 | "Work item X não existe ou você não tem acesso a ele." |
| Item sem o campo de horas (ex.: User Story) | "O work item X (User Story) não aceita o campo de horas…" |
| Timeout (15s) / rede | "Tempo esgotado…" / "Erro de conexão com o Azure DevOps…" |
| 429 do Azure | Espera o tempo do `Retry-After` e tenta de novo (até 2x) |

Outras garantias:

- **Rate limit:** no máximo **10 requisições/segundo** ao Azure DevOps.
- **PAT:** vai só no header `Authorization: Basic`. Os logs passam por um filtro que mascara o PAT e qualquer header de autorização.

## Instalação local

```bash
git clone <url-do-repo> azure-devops-hours-mcp
cd azure-devops-hours-mcp
npm install
cp .env.example .env
```

### Configurar o `.env`

| Variável | Obrigatória | Descrição |
|---|---|---|
| `AZURE_DEVOPS_ORG` | ✅ | A organização, ou seja, o trecho depois de `https://dev.azure.com/` |
| `AZURE_DEVOPS_PROJECT` | ✅ | O nome do projeto |
| `AZURE_DEVOPS_PAT` | ✅ | O Personal Access Token |
| `MCP_AUTH_TOKEN` | ✅ em produção | Segredo que protege o endpoint. Gere com `openssl rand -hex 32` |
| `AZURE_DEVOPS_HOURS_FIELD` | – | Reference name de "Horas consumidas" (senão é descoberto automaticamente) |
| `AZURE_DEVOPS_ESTIMATE_FIELD` | – | Reference name de "Horas estimadas" |
| `AZURE_DEVOPS_START_DATE_FIELD` | – | Reference name de "Data de início", preenchido ao ativar uma task em New (senão é descoberto pelo nome) |
| `PORT` | – | Porta do servidor (padrão `3000`) |
| `TIMEZONE` | – | Fuso usado quando `date` é omitido (padrão `America/Sao_Paulo`) |

**Como gerar o PAT:**

1. Abra `https://dev.azure.com/{org}/_usersSettings/tokens` e clique em **New Token**.
2. Em **Scopes**, escolha _Custom defined_ e marque **Work Items → Read & Write**.
3. Escolha a validade e copie o token para o `.env`.

> Não existe um scope "Time Tracking" nativo no Azure DevOps. "Work Items: Read & Write" é suficiente.

### Rodar

```bash
npm run dev
```

O comando acima sobe em modo desenvolvimento, com hot reload. Para produção, compile e inicie:

```bash
npm run build
```

```bash
npm start
```

Teste rápido:

```bash
curl http://localhost:3000/health
```

Para inspecionar as tools de forma interativa:

```bash
npx @modelcontextprotocol/inspector
```

No inspector, escolha _Streamable HTTP_ e use a URL `http://localhost:3000/mcp/<MCP_AUTH_TOKEN>`.

### Testes

```bash
npm test
```

Os testes (vitest + nock) não chamam o Azure de verdade. Eles cobrem a soma de horas, os retries por conflito de revisão, lotes com falha parcial, o mapeamento de 401/203/403/404/400/timeout/429, a validação, o rate limit e a ausência do PAT nos logs.

## Deploy

### Railway (recomendado)

1. Suba este repositório no GitHub.
2. No [Railway](https://railway.com): **New Project → Deploy from GitHub repo** e escolha o repositório. O `railway.json` faz o build pelo `Dockerfile` e configura o health check em `/health`.
3. Em **Variables**, adicione `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PROJECT`, `AZURE_DEVOPS_PAT` e `MCP_AUTH_TOKEN` (e `AZURE_DEVOPS_HOURS_FIELD`, se precisar).
4. Em **Settings → Networking → Generate Domain**, gere o domínio público (ex.: `azure-devops-hours.up.railway.app`).
5. Confira se está no ar:

```bash
curl https://azure-devops-hours.up.railway.app/health
```

Nos logs do deploy deve aparecer `PAT válido` e `Campos de horas resolvidos`.

O Railway injeta `PORT` automaticamente, e o servidor respeita esse valor.

### Render

1. **New → Blueprint** apontando para o repositório (usa o `render.yaml`), ou **New → Web Service** com runtime _Docker_.
2. Preencha as variáveis de ambiente. O `MCP_AUTH_TOKEN` é gerado automaticamente pelo blueprint.
3. Use um plano pago (ex.: _Starter_). No plano _Free_ o serviço hiberna após inatividade, e a primeira chamada demora ~1 min.

### Docker (qualquer lugar)

```bash
docker build -t azure-devops-hours-mcp .
```

```bash
docker run -p 3000:3000 --env-file .env azure-devops-hours-mcp
```

## Conectar no Cowork / Claude

1. Em **Settings → Connectors → Add custom connector**, informe:
   - **Nome:** Azure DevOps Horas
   - **URL:** `https://<seu-app>.up.railway.app/mcp/<MCP_AUTH_TOKEN>`
2. Salve e ative o conector na conversa.

Se o cliente permitir headers customizados, prefira a URL `https://<seu-app>.up.railway.app/mcp` com o header `Authorization: Bearer <MCP_AUTH_TOKEN>`.

> A URL com o token dá acesso ao lançamento de horas. Trate-a como uma senha. Se ela vazar, troque o `MCP_AUTH_TOKEN` no Railway.

Exemplo de uso numa conversa:

> Lança essas horas:
> ```json
> { "date": "2026-09-24", "workItems": [{ "id": "12345", "hours": 4.5, "description": "Feature X", "activityType": "Development" }] }
> ```

## Troubleshooting

| Sintoma | O que fazer |
|---|---|
| "PAT inválido ou expirado" | Gere um novo PAT e atualize `AZURE_DEVOPS_PAT` |
| Horas caíram no campo errado / "não aceita o campo de horas" | Rode `npm run discover-fields -- <id>` e defina `AZURE_DEVOPS_HOURS_FIELD` |
| 401 ao conectar o MCP | O token na URL/header não bate com o `MCP_AUTH_TOKEN` |
| Servidor não sobe em produção | Falta o `MCP_AUTH_TOKEN` (é obrigatório quando `NODE_ENV=production`) |

> ⚠️ As horas são **somadas**. Se você repetir um lançamento que já retornou `success`, as horas serão duplicadas. Para corrigir, edite o campo manualmente no Azure DevOps.

## Estrutura

```
src/
  index.ts              # bootstrap: config, validação do PAT, HTTP server
  app.ts                # Express + Streamable HTTP + autenticação do endpoint
  server.ts             # McpServer e registro das tools
  config.ts             # leitura/validação do .env
  azure-devops/         # cliente HTTP (auth, rate limit, retries), erros, campos, work items
  tools/                # uma tool por arquivo
  utils/                # validação (zod), formatação, rate limiter, logger com redaction
scripts/discover-fields.ts
tests/
dist/                   # JS compilado
```
