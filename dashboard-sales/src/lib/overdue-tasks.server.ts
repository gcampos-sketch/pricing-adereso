import {
  gateway,
  getOwners,
  getCached,
  invalidateCache,
  COMMERCIAL_PIPELINE,
  type RawDeal,
  type Props,
} from "./hubspot.server";
import { roleOfOwner } from "./owner-roles";
import { segmentOf } from "./deal-segment";
import {
  TASK_OPEN_STAGES,
  isOverduePendingTask,
  taskBusinessDay,
  taskDueTime,
  type TaskScope,
  type OverdueTaskReport,
  type TaskDeal,
} from "./overdue-tasks";
type NativeTask = { id: string; archived?: boolean; properties: Props };
type Page = { results?: { toObjectId: string | number }[]; paging?: { next?: { after?: string } } };
type AssocRow = {
  from: { id: string };
  to?: { toObjectId: string | number }[];
  paging?: { next?: { after?: string } };
};
type Batch<T> = { results?: T[]; errors?: unknown[]; status?: string };
type TaskIO = {
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  owners: () => Promise<{ id: string; firstName?: string; lastName?: string; email?: string }[]>;
  now: () => number;
  invalidate: () => void;
};
const chunks = <T>(values: T[], size = 100) =>
  Array.from({ length: Math.ceil(values.length / size) }, (_, i) =>
    values.slice(i * size, (i + 1) * size),
  );
const body = (values: string[]) => JSON.stringify({ inputs: values.map((id) => ({ id })) });
const taskProps = [
  "hs_task_status",
  "hs_timestamp",
  "hs_task_subject",
  "hs_task_priority",
  "hs_task_type",
  "hubspot_owner_id",
];
const dealProps = [
  "pipeline",
  "dealstage",
  "dealname",
  "amount",
  "hubspot_owner_id",
  "dealtype",
  "negocio_inbound",
];
function results<T>(batch: Batch<T>) {
  if (
    batch.errors?.length ||
    (batch.status && batch.status !== "COMPLETE") ||
    !Array.isArray(batch.results)
  )
    throw Error("HubSpot devolvió una lectura parcial de tareas. Vuelve a actualizar.");
  return batch.results;
}
function recordResults<T extends { id: string }>(batch: Batch<T>, ids: string[]) {
  const rows = results(batch);
  if (ids.some((id) => !rows.some((row) => row.id === id)))
    throw Error("Faltan registros de HubSpot; no se confirmó el total de tareas.");
  return rows;
}
/** HubSpot reports an exact empty association as NO_ASSOCIATIONS_FOUND, not an unread page. */
function associationResults(batch: Batch<AssocRow>, expected: string[]): AssocRow[] {
  const rows = [...(batch.results ?? [])];
  for (const raw of batch.errors ?? []) {
    const error = raw as {
      subCategory?: string;
      context?: { fromObjectId?: string[]; fromObjectType?: string[]; toObjectType?: string[] };
    };
    const ids = error.context?.fromObjectId;
    if (
      error.subCategory !== "crm.associations.NO_ASSOCIATIONS_FOUND" ||
      !ids?.length ||
      !ids.every((id) => expected.includes(id)) ||
      error.context?.fromObjectType?.[0] !== "deal" ||
      error.context?.toObjectType?.[0] !== "task"
    )
      throw Error("HubSpot devolvió una lectura parcial de asociaciones de tareas.");
    for (const id of ids) rows.push({ from: { id }, to: [] });
  }
  const complete = results({ ...batch, errors: [], results: rows });
  if (complete.some(row => !expected.includes(row.from?.id) || !Array.isArray(row.to)))
    throw Error("HubSpot devolvió una lectura parcial de asociaciones de tareas.");
  return complete;
}
export function validateTaskScope(input: {
  dealIds?: unknown;
  owner?: unknown;
  role?: unknown;
  type?: unknown;
  stages?: unknown;
}) {
  if (
    !input ||
    !Array.isArray(input.dealIds) ||
    input.dealIds.length > 2000 ||
    input.dealIds.some((id) => typeof id !== "string" || !/^\d+$/.test(id))
  )
    throw Error("Alcance de deals inválido.");
  const owner = String(input.owner ?? "team");
  if (owner !== "team" && !/^\d+$/.test(owner)) throw Error("Comercial inválido.");
  const type = String(input.type ?? "all");
  if (!["all", "inbound", "outbound", "upsell", "crossSell"].includes(type))
    throw Error("Tipo de deal inválido.");
  if (!["all", "AE", "KAM"].includes(String(input.role ?? "all"))) throw Error("Rol inválido.");
  const role: TaskScope["role"] = input.role === "AE" || input.role === "KAM" ? input.role : "all";
  const stages = [...new Set(Array.isArray(input.stages) ? input.stages.map(String) : [])].sort();
  if (stages.some((stage) => !Object.values(TASK_OPEN_STAGES).includes(stage)))
    throw Error("Etapas inválidas.");
  return { dealIds: [...new Set(input.dealIds as string[])].sort(), owner, role, type, stages };
}
export function createOverdueTaskService(io: TaskIO) {
  const assocPage = async (from: string, id: string, to: string, after?: string) =>
    io.request<Page>(
      `/crm/v4/objects/${from}/${id}/associations/${to}?limit=500${after ? `&after=${encodeURIComponent(after)}` : ""}`,
    );
  async function tail(from: string, id: string, to: string, after: string | undefined) {
    const ids: string[] = [];
    const seen = new Set<string>();
    while (after) {
      if (seen.has(after)) throw Error("La paginación de tareas no avanzó.");
      seen.add(after);
      const page = await assocPage(from, id, to, after);
      if (!Array.isArray(page.results)) throw Error("Asociaciones incompletas.");
      ids.push(...page.results.map((row) => String(row.toObjectId)));
      after = page.paging?.next?.after;
    }
    return ids;
  }
  async function eligibleDeals(ids: string[], scope: TaskScope) {
    const list: RawDeal[] = [];
    for (const batch of chunks(ids))
      list.push(
        ...recordResults(
          await io.request<Batch<RawDeal>>("/crm/v3/objects/deals/batch/read", {
            method: "POST",
            body: JSON.stringify({ inputs: batch.map((id) => ({ id })), properties: dealProps }),
          }),
          batch,
        ),
      );
    const target: Record<string, string> = {
      inbound: "Inbound",
      outbound: "Outbound",
      upsell: "Upsell",
      crossSell: "Cross sell",
    };
    return list.filter(
      (deal) =>
        deal.properties["pipeline"] === COMMERCIAL_PIPELINE &&
        TASK_OPEN_STAGES[deal.properties["dealstage"] ?? ""] &&
        (scope.owner === "team" || deal.properties["hubspot_owner_id"] === scope.owner) &&
        (scope.role === "all" ||
          roleOfOwner(deal.properties["hubspot_owner_id"] ?? "") === scope.role) &&
        (!scope.stages.length ||
          scope.stages.includes(TASK_OPEN_STAGES[deal.properties["dealstage"] ?? ""]!)) &&
        (scope.type === "all" || segmentOf(deal.properties) === target[scope.type]),
    );
  }
  async function read(input: ReturnType<typeof validateTaskScope>): Promise<OverdueTaskReport> {
    const now = io.now(),
      deals = await eligibleDeals(input.dealIds, input);
    const assignments = new Map<string, Set<string>>();
    for (const batch of chunks(deals.map((deal) => deal.id))) {
      const rows = associationResults(
        await io.request<Batch<AssocRow>>("/crm/v4/associations/deals/tasks/batch/read", {
          method: "POST",
          body: body(batch),
        }),
        batch,
      );
      if (batch.some((id) => !rows.some((row) => row.from.id === id)))
        throw Error("Faltan asociaciones de tareas; no se confirmó el total.");
      for (const row of rows) {
        const ids = [
          ...(row.to ?? []).map((target) => String(target.toObjectId)),
          ...(await tail("deals", row.from.id, "tasks", row.paging?.next?.after)),
        ];
        for (const id of ids) {
          if (!assignments.has(id)) assignments.set(id, new Set());
          assignments.get(id)!.add(row.from.id);
        }
      }
    }
    const native: NativeTask[] = [];
    for (const batch of chunks([...assignments.keys()]))
      native.push(
        ...recordResults(
          await io.request<Batch<NativeTask>>("/crm/v3/objects/tasks/batch/read", {
            method: "POST",
            body: JSON.stringify({ inputs: batch.map((id) => ({ id })), properties: taskProps }),
          }),
          batch,
        ),
      );
    const ownerNames = new Map(
      (await io.owners()).map((owner) => [
        owner.id,
        [owner.firstName, owner.lastName].filter(Boolean).join(" ") ||
          owner.email ||
          "Sin responsable",
      ]),
    );
    const tasks = native
      .filter(
        (task) =>
          !task.archived &&
          isOverduePendingTask(
            task.properties["hs_task_status"],
            task.properties["hs_timestamp"],
            now,
          ),
      )
      .map((task) => ({
        id: task.id,
        subject: task.properties["hs_task_subject"] || "Tarea sin título",
        dueAt: new Date(taskDueTime(task.properties["hs_timestamp"])!).toISOString(),
        assignedTo: ownerNames.get(task.properties["hubspot_owner_id"] ?? "") || "Sin responsable",
        priority: task.properties["hs_task_priority"] || "NONE",
        type: task.properties["hs_task_type"] || "TODO",
        dealIds: [...assignments.get(task.id)!],
      }))
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    const involved = new Set(tasks.flatMap((task) => task.dealIds));
    const included: TaskDeal[] = deals
      .filter((deal) => involved.has(deal.id))
      .map((deal) => ({
        id: deal.id,
        name: deal.properties["dealname"] || "Sin nombre",
        url: `https://app.hubspot.com/contacts/23480943/deal/${deal.id}`,
        owner: ownerNames.get(deal.properties["hubspot_owner_id"] ?? "") || "Sin comercial",
        amount: Number(deal.properties["amount"]) || 0,
      }));
    return {
      readAt: new Date(now).toISOString(),
      businessDay: taskBusinessDay(now),
      tasks: [...new Map(tasks.map((task) => [task.id, task])).values()],
      deals: included,
    };
  }
  async function complete(taskId: string, input: ReturnType<typeof validateTaskScope>) {
    if (!/^\d+$/.test(taskId)) throw Error("Tarea inválida.");
    const task = await io.request<NativeTask>(
      `/crm/v3/objects/tasks/${taskId}?properties=${taskProps.join(",")}`,
    );
    if (task.archived) throw Error("La tarea está archivada; actualiza la lista.");
    const first = await assocPage("tasks", taskId, "deals");
    if (!Array.isArray(first.results)) throw Error("No se pudo verificar el deal asociado.");
    const linked = new Set([
      ...first.results.map((row) => String(row.toObjectId)),
      ...(await tail("tasks", taskId, "deals", first.paging?.next?.after)),
    ]);
    const allowed = await eligibleDeals(
      input.dealIds.filter((id) => linked.has(id)),
      input,
    );
    if (!allowed.length)
      throw Error("La tarea ya no pertenece a un deal activo de este filtro. Actualiza la lista.");
    if (task.properties["hs_task_status"] === "COMPLETED") {
      io.invalidate();
      return { taskId, status: "COMPLETED" as const };
    }
    if (
      !isOverduePendingTask(
        task.properties["hs_task_status"],
        task.properties["hs_timestamp"],
        io.now(),
      )
    )
      throw Error("La tarea ya no está vencida; actualiza la lista.");
    await io.request(`/crm/v3/objects/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: { hs_task_status: "COMPLETED" } }),
    });
    io.invalidate();
    const verified = await io.request<NativeTask>(
      `/crm/v3/objects/tasks/${taskId}?properties=hs_task_status`,
    );
    if (verified.properties["hs_task_status"] !== "COMPLETED")
      throw Error(
        "HubSpot no confirmó que la tarea esté completada. Actualiza antes de volver a intentar.",
      );
    return { taskId, status: "COMPLETED" as const };
  }
  return { read, complete };
}
const service = () =>
  createOverdueTaskService({
    request: gateway,
    owners: getOwners,
    now: Date.now,
    invalidate: () => {
      invalidateCache("pending-tasks:");
      invalidateCache("overdue-tasks:");
    },
  });
export const readOverdueTasks = (input: ReturnType<typeof validateTaskScope>) =>
  getCached(
    "overdue-tasks:" + taskBusinessDay(Date.now()) + ":" + JSON.stringify(input),
    30_000,
    () => service().read(input),
  );
export const completeOverdueTask = (taskId: string, input: ReturnType<typeof validateTaskScope>) =>
  service().complete(taskId, input);
