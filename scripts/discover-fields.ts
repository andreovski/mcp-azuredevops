/**
 * Lista os campos de um work item (reference name, nome exibido e valor) e
 * mostra quais campos de horas o servidor vai usar.
 *
 *   npm run discover-fields -- 12345
 */
import { loadConfig } from '../src/config.js';
import { AzureDevOpsClient } from '../src/azure-devops/client.js';
import { FieldResolver, normalize } from '../src/azure-devops/fields.js';
import { toUserMessage } from '../src/azure-devops/errors.js';

async function main() {
  const id = Number(process.argv[2]);
  if (!Number.isInteger(id) || id <= 0) {
    console.error('Uso: npm run discover-fields -- <workItemId>');
    process.exit(1);
  }
  const config = loadConfig();
  const client = new AzureDevOpsClient(config);

  const { user } = await client.validateToken();
  console.log(`PAT válido (usuário: ${user})\n`);

  const [defs, item] = await Promise.all([
    client.request<{ value: { name: string; referenceName: string }[] }>({ method: 'get', url: client.orgPath('/wit/fields') }),
    client.request<{ fields: Record<string, unknown> }>({ method: 'get', url: client.projectPath(`/wit/workitems/${id}`) }, { workItemId: id }),
  ]);
  const nameOf = new Map(defs.value.map((f) => [f.referenceName, f.name]));

  console.log(`Campos do work item ${id}:`);
  for (const [ref, value] of Object.entries(item.fields)) {
    const name = nameOf.get(ref) ?? '';
    const hint = /hora|work|estim|effort|esfor/.test(normalize(`${name} ${ref}`)) ? '  <-- possível campo de horas' : '';
    const shown = typeof value === 'object' ? JSON.stringify(value)?.slice(0, 60) : String(value).slice(0, 60);
    console.log(`  ${ref.padEnd(50)} ${name.padEnd(30)} ${shown}${hint}`);
  }

  const resolved = await new FieldResolver(client, { hoursField: config.hoursField, estimateField: config.estimateField, startDateField: config.startDateField }).resolve();
  console.log(`\nO servidor vai SOMAR horas em: ${resolved.consumed}`);
  console.log(`e ler a estimativa de:        ${resolved.estimate}`);
  console.log(`Data de início (ao ativar):   ${resolved.startDate ?? '(não encontrado)'}`);
  console.log('\nSe estiver errado, defina AZURE_DEVOPS_HOURS_FIELD / AZURE_DEVOPS_ESTIMATE_FIELD / AZURE_DEVOPS_START_DATE_FIELD no .env.');
}

main().catch((err) => {
  console.error(`Erro: ${toUserMessage(err)}`);
  process.exit(1);
});
