/** Inscripción masiva en la secuencia «Touchpoint seguimiento II» de HubSpot. */
import { gateway, getOwners, invalidateCache, type Props } from "./hubspot.server";
import { getDealContacts } from "./sequences.server";

export const TOUCHPOINT_SEQUENCE_ID = "303700573";

export type EnrollResult = {
  dealId: string;
  status: "ok" | "skipped" | "error";
  detail: string;
};

export async function enrollDealsInTouchpoint(dealIds: string[]): Promise<EnrollResult[]> {
  const [owners, contacts, dealsRes] = await Promise.all([
    getOwners(),
    getDealContacts(dealIds),
    gateway<{ results: { id: string; properties: Props }[] }>("/crm/v3/objects/deals/batch/read", {
      method: "POST",
      body: JSON.stringify({ properties: ["hubspot_owner_id"], inputs: dealIds.map((id) => ({ id })) }),
    }),
  ]);
  const ownerOf = new Map(dealsRes.results.map((d) => [d.id, d.properties["hubspot_owner_id"] ?? ""]));
  const contactOf = new Map(contacts.map((c) => [c.dealId, c]));
  const done = new Set<string>();
  const results: EnrollResult[] = [];

  for (const dealId of dealIds) {
    const info = contactOf.get(dealId);
    const owner = owners.find((o) => o.id === ownerOf.get(dealId));
    if (!info?.contactId || !info.contactEmail) {
      results.push({ dealId, status: "skipped", detail: "sin contacto con correo" });
      continue;
    }
    if (info.sequenceActive) {
      results.push({ dealId, status: "skipped", detail: "ya está en una secuencia" });
      continue;
    }
    if (done.has(info.contactId)) {
      results.push({ dealId, status: "skipped", detail: "contacto ya inscrito en este envío" });
      continue;
    }
    if (!owner?.userId || !owner.email) {
      results.push({ dealId, status: "skipped", detail: "el deal no tiene dueño en HubSpot" });
      continue;
    }
    try {
      await gateway(`/automation/v4/sequences/enrollments?userId=${owner.userId}`, {
        method: "POST",
        body: JSON.stringify({
          sequenceId: TOUCHPOINT_SEQUENCE_ID,
          contactId: info.contactId,
          senderEmail: owner.email,
        }),
      });
      done.add(info.contactId);
      results.push({ dealId, status: "ok", detail: `${info.contactName ?? info.contactEmail} · envía ${owner.firstName ?? owner.email}` });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const detail = /inbox|sender|connected/i.test(msg)
        ? "el dueño no tiene su correo conectado a HubSpot"
        : /scope|permission|403/i.test(msg)
          ? "la conexión de HubSpot no tiene permiso para inscribir"
          : "HubSpot rechazó la inscripción";
      console.error("Enroll failed", dealId, msg);
      results.push({ dealId, status: "error", detail });
    }
  }
  invalidateCache("deal-contacts:");
  return results;
}
