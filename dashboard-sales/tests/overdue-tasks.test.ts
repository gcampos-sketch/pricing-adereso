import { expect, test } from "bun:test";
import { createOverdueTaskService, validateTaskScope } from "../src/lib/overdue-tasks.server";
import { isOverduePendingTask, overdueTaskExposure } from "../src/lib/overdue-tasks";
const now = Date.parse("2026-11-12T14:00:00Z");
const scope = validateTaskScope({
  dealIds: ["100", "200"],
  owner: "331766554",
  role: "AE",
  type: "all",
  stages: [],
});
const deal = (id: string, amount: string) => ({
  id,
  properties: {
    pipeline: "93085851",
    dealstage: "171385867",
    hubspot_owner_id: "331766554",
    dealname: `Deal ${id}`,
    amount,
    dealtype: "newbusiness",
  },
});
function fixture(
  options: {
    status?: string;
    badAssociation?: boolean;
    badReadback?: boolean;
    today?: boolean;
    partial?: boolean;
    changedOwner?: boolean;
    emptyDeal?: boolean;
    missingTask?: boolean;
    missingAssociationList?: boolean;
  } = {},
) {
  const calls: { path: string; method: string; body: unknown }[] = [];
  let status = options.status ?? "NOT_STARTED";
  let invalidated = 0;
  const task = (id: string) => ({
    id,
    properties: {
      hs_task_subject: `Tarea ${id}`,
      hs_task_status: id === "13" ? "COMPLETED" : status,
      hs_timestamp: options.today ? "2026-11-12T15:00:00Z" : "2026-11-10T15:00:00Z",
      hubspot_owner_id: "331766554",
    },
  });
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, method: init?.method ?? "GET", body });
    if (path === "/crm/v3/objects/deals/batch/read")
      return {
        status: "COMPLETE",
        results: body.inputs.map((x: { id: string }) => {
          const row = deal(x.id, x.id === "100" ? "500" : "900");
          if (options.changedOwner) row.properties.hubspot_owner_id = "93662868";
          return row;
        }),
      } as T;
    if (path === "/crm/v4/associations/deals/tasks/batch/read" && options.missingAssociationList)
      return {status:"COMPLETE", results:[{from:{id:"100"}},{from:{id:"200"},to:[]}]} as T;
    if (path === "/crm/v4/associations/deals/tasks/batch/read" && options.emptyDeal)
      return {
        status: "COMPLETE",
        results: [
          {
            from: { id: "100" },
            to: [{ toObjectId: 11 }, { toObjectId: 13 }],
            paging: { next: { after: "next" } },
          },
        ],
        errors: [
          {
            subCategory: "crm.associations.NO_ASSOCIATIONS_FOUND",
            context: { fromObjectId: ["200"], fromObjectType: ["deal"], toObjectType: ["task"] },
          },
        ],
      } as T;
    if (path === "/crm/v4/associations/deals/tasks/batch/read")
      return {
        status: "COMPLETE",
        results: [
          {
            from: { id: "100" },
            to: [{ toObjectId: 11 }, { toObjectId: 13 }],
            paging: { next: { after: "next" } },
          },
          { from: { id: "200" }, to: [{ toObjectId: 11 }] },
        ],
      } as T;
    if (path.startsWith("/crm/v4/objects/deals/100/associations/tasks"))
      return { results: [{ toObjectId: 12 }] } as T;
    if (path === "/crm/v3/objects/tasks/batch/read" && options.missingTask)
      return { status: "COMPLETE", results: [] } as T;
    if (path === "/crm/v3/objects/tasks/batch/read")
      return options.partial
        ? ({ errors: [{ status: "error" }], results: [] } as T)
        : ({
            status: "COMPLETE",
            results: body.inputs.map((x: { id: string }) => task(x.id)),
          } as T);
    if (path.startsWith("/crm/v4/objects/tasks/11/associations/deals"))
      return { results: [{ toObjectId: options.badAssociation ? "999" : "100" }] } as T;
    if (path === "/crm/v3/objects/tasks/11" && init?.method === "PATCH") {
      if (!options.badReadback) status = "COMPLETED";
      return task("11") as T;
    }
    if (path.startsWith("/crm/v3/objects/tasks/11?")) return task("11") as T;
    throw Error(`Unexpected native call ${path}`);
  };
  const service = createOverdueTaskService({
    request,
    owners: async () => [{ id: "331766554", firstName: "Gonzalo", lastName: "Campos" }],
    now: () => now,
    invalidate: () => {
      invalidated++;
    },
  });
  return {
    service,
    calls,
    get invalidated() {
      return invalidated;
    },
  };
}
test("task and MRR counts deduplicate independently, including shared tasks and paginated associations", async () => {
  const f = fixture();
  const report = await f.service.read(scope);
  expect(report.tasks.map((task) => task.id)).toEqual(["11", "12"]);
  expect(report.tasks[0]!.dealIds.sort()).toEqual(["100", "200"]);
  expect(overdueTaskExposure(report)).toEqual({ tasks: 2, deals: 2, mrr: 1400, unvalued: 0 });
  report.tasks.push(report.tasks[0]!);
  report.deals.push(report.deals[0]!);
  expect(overdueTaskExposure(report).mrr).toBe(1400);
  report.tasks = report.tasks.filter((task) => task.id !== "11");
  expect(overdueTaskExposure(report)).toEqual({ tasks: 1, deals: 1, mrr: 500, unvalued: 0 });
});
test("every native pending status counts, today/completed do not; business-day boundary is Coyhaique", () => {
  for (const status of ["NOT_STARTED", "WAITING", "IN_PROGRESS", "DEFERRED"])
    expect(isOverduePendingTask(status, "2026-11-10T12:00:00Z", now)).toBe(true);
  expect(isOverduePendingTask("COMPLETED", "2026-11-10T12:00:00Z", now)).toBe(false);
  expect(isOverduePendingTask("WAITING", "2026-11-12T02:59:00Z", now)).toBe(true);
  expect(isOverduePendingTask("WAITING", "2026-11-12T03:00:00Z", now)).toBe(false);
  expect(isOverduePendingTask("WAITING", null, now)).toBe(false);
});
test("completes only the checked task status and confirms via a separate native read", async () => {
  const f = fixture();
  expect(await f.service.complete("11", scope)).toEqual({ taskId: "11", status: "COMPLETED" });
  const writes = f.calls.filter((call) => call.method === "PATCH");
  expect(writes).toHaveLength(1);
  expect(writes[0]!.body).toEqual({ properties: { hs_task_status: "COMPLETED" } });
  expect(f.calls.at(-1)!.path).toContain("?properties=hs_task_status");
  expect(f.invalidated).toBe(1);
});
test("completed task is idempotent, no reopening or second mutation", async () => {
  const f = fixture({ status: "COMPLETED" });
  await f.service.complete("11", scope);
  expect(f.calls.some((call) => call.method === "PATCH")).toBe(false);
});
test("association or fresh owner outside scope prevents any write", async () => {
  for (const options of [{ badAssociation: true }, { changedOwner: true }, { today: true }]) {
    const f = fixture(options);
    await expect(f.service.complete("11", scope)).rejects.toThrow();
    expect(f.calls.some((call) => call.method === "PATCH")).toBe(false);
  }
});
test("failed readback is never reported as completed", async () => {
  const f = fixture({ badReadback: true });
  await expect(f.service.complete("11", scope)).rejects.toThrow("no confirmó");
});
test("partial reads fail explicitly rather than claiming zero overdue tasks", async () => {
  await expect(fixture({ partial: true }).service.read(scope)).rejects.toThrow("lectura parcial");
});
test("malformed CRM IDs and scopes are rejected", () => {
  expect(() => validateTaskScope({ ...scope, dealIds: ["123/../../tasks"] })).toThrow();
  expect(() => validateTaskScope({ ...scope, role: "unknown" })).toThrow();
});

test("native NO_ASSOCIATIONS_FOUND proves an empty deal rather than a failed read", async () => {
  const report = await fixture({ emptyDeal: true }).service.read(scope);
  expect(overdueTaskExposure(report)).toEqual({ tasks: 2, deals: 1, mrr: 500, unvalued: 0 });
});
test("missing batch rows cannot become an empty confirmed report", async () => {
  await expect(fixture({ missingTask: true }).service.read(scope)).rejects.toThrow(
    "Faltan registros",
  );
});

test("owner, role, type and stage filters use current native deal properties", async () => {
  for (const other of [
    { ...scope, owner: "93662868" },
    { ...scope, role: "KAM" as const },
    { ...scope, type: "upsell" },
    { ...scope, stages: ["E4"] },
  ]) {
    const report = await fixture().service.read(other);
    expect(report.tasks).toHaveLength(0);
    expect(overdueTaskExposure(report).mrr).toBe(0);
  }
});
test("when the last pending task is gone, no residual MRR or deal count remains", async () => {
  const report = await fixture({ status: "COMPLETED" }).service.read(scope);
  expect(overdueTaskExposure(report)).toEqual({ tasks: 0, deals: 0, mrr: 0, unvalued: 0 });
});

test("a missing association list is incomplete, never a confirmed empty report", async () => {
  await expect(fixture({ missingAssociationList: true }).service.read(scope)).rejects.toThrow("lectura parcial");
});
