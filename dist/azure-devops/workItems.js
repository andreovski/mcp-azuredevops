import { AzureDevOpsError } from './errors.js';
import { historyComment, round2 } from '../utils/format.js';
import { logger } from '../utils/logger.js';
const MAX_CONFLICT_RETRIES = 3;
function asNumber(v) {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function assignedName(v) {
    if (!v)
        return null;
    if (typeof v === 'string')
        return v;
    if (typeof v === 'object' && v !== null && 'displayName' in v)
        return String(v.displayName);
    return null;
}
function isRevConflict(err) {
    if (!(err instanceof AzureDevOpsError))
        return false;
    if (err.code === 'CONFLICT')
        return true;
    // O Azure responde 400 quando a operação "test" em /rev falha.
    return err.code === 'BAD_REQUEST' && /\brev\b|test operation|TF26071|VS403691/i.test(err.message);
}
/** Escapa um literal de string para WIQL. */
export const wiqlString = (s) => `'${s.replace(/'/g, "''")}'`;
export class WorkItemService {
    client;
    fields;
    constructor(client, fields) {
        this.client = client;
        this.fields = fields;
    }
    async fetchRaw(id) {
        return this.client.request({ method: 'get', url: this.client.projectPath(`/wit/workitems/${id}`) }, { workItemId: id });
    }
    summarize(raw, f) {
        return {
            id: raw.id,
            title: String(raw.fields['System.Title'] ?? ''),
            type: String(raw.fields['System.WorkItemType'] ?? ''),
            state: String(raw.fields['System.State'] ?? ''),
            assignedTo: assignedName(raw.fields['System.AssignedTo']),
            estimatedHours: asNumber(raw.fields[f.estimate]),
            consumedHours: asNumber(raw.fields[f.consumed]),
            url: this.client.webUrl(raw.id),
        };
    }
    async get(id) {
        const [raw, f] = await Promise.all([this.fetchRaw(id), this.fields.resolve()]);
        return this.summarize(raw, f);
    }
    /** Soma `hours` ao campo "Horas consumidas" e registra data/descrição no histórico. */
    async addHours(input) {
        const f = await this.fields.resolve();
        for (let attempt = 1;; attempt++) {
            const raw = await this.fetchRaw(input.workItemId);
            const previous = asNumber(raw.fields[f.consumed]) ?? 0;
            const newTotal = round2(previous + input.hours);
            try {
                await this.client.request({
                    method: 'patch',
                    url: this.client.projectPath(`/wit/workitems/${input.workItemId}`),
                    headers: { 'Content-Type': 'application/json-patch+json' },
                    data: [
                        { op: 'test', path: '/rev', value: raw.rev },
                        { op: 'add', path: `/fields/${f.consumed}`, value: newTotal },
                        { op: 'add', path: '/fields/System.History', value: historyComment(input) },
                    ],
                }, { workItemId: input.workItemId });
            }
            catch (err) {
                if (isRevConflict(err) && attempt < MAX_CONFLICT_RETRIES) {
                    logger.warn('Work item mudou durante o lançamento; relendo', { workItemId: input.workItemId, attempt });
                    continue;
                }
                if (err instanceof AzureDevOpsError && err.code === 'BAD_REQUEST' && err.message.includes(f.consumed)) {
                    throw new AzureDevOpsError('BAD_REQUEST', `O work item ${input.workItemId} (${String(raw.fields['System.WorkItemType'])}) não aceita o campo de horas "${f.consumed}". ` +
                        'Lance as horas numa Task ou ajuste AZURE_DEVOPS_HOURS_FIELD.', 400);
                }
                throw err;
            }
            return {
                workItemId: input.workItemId,
                title: String(raw.fields['System.Title'] ?? ''),
                hoursLogged: input.hours,
                previousHours: previous,
                newTotal,
                field: f.consumed,
                url: this.client.webUrl(input.workItemId),
            };
        }
    }
    async list(filters) {
        const where = [`[System.TeamProject] = @project`];
        const type = filters.workItemType ?? 'Task';
        if (type !== '*')
            where.push(`[System.WorkItemType] = ${wiqlString(type)}`);
        if (filters.state)
            where.push(`[System.State] = ${wiqlString(filters.state)}`);
        const assigned = filters.assignedTo ?? '@Me';
        if (assigned === '@Me')
            where.push('[System.AssignedTo] = @Me');
        else if (assigned !== '*')
            where.push(`[System.AssignedTo] CONTAINS ${wiqlString(assigned)}`);
        const query = `SELECT [System.Id] FROM WorkItems WHERE ${where.join(' AND ')} ORDER BY [System.ChangedDate] DESC`;
        const wiql = await this.client.request({
            method: 'post',
            url: this.client.projectPath('/wit/wiql'),
            params: { $top: filters.limit },
            data: { query },
        });
        const ids = (wiql.workItems ?? []).slice(0, filters.limit).map((w) => w.id);
        if (ids.length === 0)
            return [];
        const f = await this.fields.resolve();
        const batch = await this.client.request({
            method: 'post',
            url: this.client.projectPath('/wit/workitemsbatch'),
            data: {
                ids,
                fields: ['System.Id', 'System.Title', 'System.WorkItemType', 'System.State', 'System.AssignedTo', f.consumed, f.estimate],
                errorPolicy: 'Omit',
            },
        });
        return (batch.value ?? []).filter(Boolean).map((raw) => this.summarize(raw, f));
    }
}
//# sourceMappingURL=workItems.js.map