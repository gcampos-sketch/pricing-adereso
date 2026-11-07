import { gateway } from "./hubspot.server";
import { markdownToHubspotHtml } from "./markdown";

/** Crea una tarea en HubSpot y la asocia al deal (association type task→deal = 216). */
export async function createDealTask(
  dealId: string,
  subject: string,
  body: string,
  dueDate: string | null,
  opts?: { ownerId?: string | null; type?: string },
) {
  const due = dueDate ? new Date(`${dueDate}T12:00:00.000Z`) : new Date();
  const html = markdownToHubspotHtml(body);
  const properties: Record<string, string> = {
    hs_timestamp: (Number.isNaN(due.getTime()) ? new Date() : due).toISOString(),
    hs_task_subject: subject,
    hs_task_body: html,
    hs_task_status: "NOT_STARTED",
    hs_task_priority: "MEDIUM",
    hs_task_type: opts?.type ?? "TODO",
  };
  if (opts?.ownerId) properties["hubspot_owner_id"] = opts.ownerId;
  const payload = {
    properties,
    associations: [
      {
        to: { id: dealId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 216 }],
      },
    ],
  };
  const created = await gateway<{ id: string }>("/crm/v3/objects/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { id: created.id };
}
