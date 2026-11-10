/**
 * Contactos y secuencias por deal: el panel Fix necesita saber si el deal tiene
 * a alguien inscrito en una secuencia activa (para no duplicar el seguimiento)
 * y quién es el contacto principal para redactar el FUP.
 */

import { gateway, getCached, TTL_SLOW, type Props } from "./hubspot.server";

export type DealContactInfo = {
  dealId: string;
  contactCount: number;
  contactId: string | null;
  /** null cuando no pudimos leer el dato de secuencias */
  sequenceActive: boolean | null;
  /** true si algún contacto del deal estuvo alguna vez inscrito en una secuencia */
  sequenceEver: boolean | null;
  contactName: string | null;
  contactEmail: string | null;
  contactTitle: string | null;
};

const chunk = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const CONTACT_PROPS = [
  "firstname",
  "lastname",
  "email",
  "jobtitle",
  "titular_para_reuniones",
  "hs_sequences_actively_enrolled_count",
  "hs_sequences_enrolled_count",
];

export async function loadDealContacts(dealIds: string[], request: typeof gateway = gateway, preferMeetingOwner = true): Promise<DealContactInfo[]> {
  const empty = (dealId: string): DealContactInfo => ({
    dealId,
    contactCount: 0,
    contactId: null,
    sequenceActive: null,
    sequenceEver: null,
    contactName: null,
    contactEmail: null,
    contactTitle: null,
  });
  if (!dealIds.length) return [];

  const contactsOfDeal = new Map<string, string[]>();
  try {
    const batches = await Promise.all(
      chunk(dealIds, 100).map((batch) =>
        request<{ results: { from: { id: string }; to: { toObjectId: string | number }[]; paging?: { next?: { after?: string } } }[]; errors?: { subCategory?: string; context?: { fromObjectId?: string[] } }[] }>(
          "/crm/v4/associations/deals/contacts/batch/read",
          { method: "POST", body: JSON.stringify({ inputs: batch.map((id) => ({ id })) }) },
        ),
      ),
    );
    for (const data of batches) {
      for (const error of data.errors ?? []) {
        // HubSpot returns 207 + this exact error for a confirmed empty association.
        const ids = error.context?.fromObjectId;
        if (error.subCategory !== "crm.associations.NO_ASSOCIATIONS_FOUND" || !ids?.length || ids.some(id => !dealIds.includes(String(id)))) {
          throw new Error("Lectura incompleta de asociaciones de contactos");
        }
        for (const id of ids) contactsOfDeal.set(String(id), []);
      }
      for (const row of data.results ?? []) {
        const ids = (row.to ?? []).map((target) => String(target.toObjectId));
        let after = row.paging?.next?.after;
        const seen = new Set<string>();
        while (after) {
          if (seen.has(after)) throw new Error("Paginación repetida de contactos");
          seen.add(after);
          const page = await request<{ results: { toObjectId: string | number }[]; paging?: { next?: { after?: string } } }>(
            `/crm/v4/objects/deals/${encodeURIComponent(row.from.id)}/associations/contacts?limit=500&after=${encodeURIComponent(after)}`,
          );
          ids.push(...page.results.map(target => String(target.toObjectId)));
          after = page.paging?.next?.after;
        }
        contactsOfDeal.set(String(row.from.id), [...new Set(ids)]);
      }
    }
    if (dealIds.some(id => !contactsOfDeal.has(id))) throw new Error("Faltan asociaciones de contactos por leer");
  } catch (error) {
    console.warn("No pudimos leer asociaciones deal→contacto", error);
    throw error;
  }

  const contactIds = [...new Set([...contactsOfDeal.values()].flat())];
  const contacts = new Map<string, Props>();
  if (contactIds.length) {
    try {
      const batches = await Promise.all(
        chunk(contactIds, 100).map((batch) =>
          request<{ results: { id: string; properties: Props }[]; errors?: unknown[] }>(
            "/crm/v3/objects/contacts/batch/read",
            {
              method: "POST",
              body: JSON.stringify({
                properties: CONTACT_PROPS,
                inputs: batch.map((id) => ({ id })),
              }),
            },
          ),
        ),
      );
      for (const data of batches) {
        if (data.errors?.length) throw new Error("Lectura incompleta de contactos");
        for (const row of data.results ?? []) contacts.set(String(row.id), row.properties ?? {});
      }
    } catch (error) {
      console.warn("No pudimos leer contactos de los deals", error);
      throw error;
    }
  }

  return dealIds.map((dealId) => {
    const ids = contactsOfDeal.get(dealId) ?? [];
    if (!ids.length) return empty(dealId);
    const rows = ids.map((id) => contacts.get(id)).filter(Boolean) as Props[];
    if (rows.length !== ids.length) throw new Error("Faltan contactos asociados por leer");

    const enrolled = rows.map((p) => Number(p["hs_sequences_actively_enrolled_count"] ?? 0));
    const sequenceActive = enrolled.some((value) => Number.isFinite(value) && value > 0);
    const ever = rows.map((p) => Number(p["hs_sequences_enrolled_count"] ?? 0));
    const sequenceEver = ever.some((value) => Number.isFinite(value) && value > 0);
    // The meeting owner wins over sequence enrollment or association order.
    const primaryId =
      (preferMeetingOwner ? ids.find(id => contacts.get(id)?.["titular_para_reuniones"] === "true") : undefined) ??
      ids.find(id => Number(contacts.get(id)?.["hs_sequences_actively_enrolled_count"] ?? 0) > 0) ??
      ids.find(id => (contacts.get(id)?.["email"] ?? "").trim()) ?? ids[0]!;
    const primary = contacts.get(primaryId)!;
    const name = [primary["firstname"], primary["lastname"]].filter(Boolean).join(" ").trim();
    return {
      dealId,
      contactCount: ids.length,
      contactId: primaryId,
      sequenceActive,
      sequenceEver,
      contactName: name || null,
      contactEmail: primary["email"] || null,
      contactTitle: primary["jobtitle"] || null,
    };
  });
}

/** Contactos + estado de secuencia por deal (cacheado 10 min). */
export function getDealContacts(dealIds: string[], options: { preferMeetingOwner?: boolean } = {}): Promise<DealContactInfo[]> {
  const preferMeetingOwner = options.preferMeetingOwner !== false;
  const key = `deal-contacts:meeting-owner-v2:${preferMeetingOwner}:${[...dealIds].sort().join(",")}`;
  return getCached(key, TTL_SLOW, () => loadDealContacts(dealIds, gateway, preferMeetingOwner));
}
