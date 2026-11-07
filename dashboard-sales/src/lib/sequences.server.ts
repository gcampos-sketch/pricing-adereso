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
  "hs_sequences_actively_enrolled_count",
  "hs_sequences_enrolled_count",
];

async function load(dealIds: string[]): Promise<DealContactInfo[]> {
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
        gateway<{ results: { from: { id: string }; to: { toObjectId: string | number }[] }[] }>(
          "/crm/v4/associations/deals/contacts/batch/read",
          { method: "POST", body: JSON.stringify({ inputs: batch.map((id) => ({ id })) }) },
        ),
      ),
    );
    for (const data of batches) {
      for (const row of data.results ?? []) {
        const ids = (row.to ?? []).map((target) => String(target.toObjectId));
        if (ids.length) contactsOfDeal.set(row.from.id, ids);
      }
    }
  } catch (error) {
    console.warn("No pudimos leer asociaciones deal→contacto", error);
    return dealIds.map(empty);
  }

  const contactIds = [...new Set([...contactsOfDeal.values()].flat())];
  const contacts = new Map<string, Props>();
  if (contactIds.length) {
    try {
      const batches = await Promise.all(
        chunk(contactIds, 100).map((batch) =>
          gateway<{ results: { id: string; properties: Props }[] }>(
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
        for (const row of data.results ?? []) contacts.set(row.id, row.properties ?? {});
      }
    } catch (error) {
      console.warn("No pudimos leer contactos de los deals", error);
    }
  }

  return dealIds.map((dealId) => {
    const ids = contactsOfDeal.get(dealId) ?? [];
    if (!ids.length) return empty(dealId);
    const rows = ids.map((id) => contacts.get(id)).filter(Boolean) as Props[];
    if (!rows.length) return { ...empty(dealId), contactCount: ids.length };

    const enrolled = rows.map((p) => Number(p["hs_sequences_actively_enrolled_count"] ?? 0));
    const sequenceActive = enrolled.some((value) => Number.isFinite(value) && value > 0);
    const ever = rows.map((p) => Number(p["hs_sequences_enrolled_count"] ?? 0));
    const sequenceEver = ever.some((value) => Number.isFinite(value) && value > 0);
    // Contacto principal: el que ya está en secuencia (si hay) o el primero con correo.
    const primaryId =
      ids.find((id) => Number(contacts.get(id)?.["hs_sequences_actively_enrolled_count"] ?? 0) > 0) ??
      ids.find((id) => (contacts.get(id)?.["email"] ?? "").trim()) ??
      ids.find((id) => contacts.has(id)) ?? null;
    const primary =
      rows.find((p) => Number(p["hs_sequences_actively_enrolled_count"] ?? 0) > 0) ??
      rows.find((p) => (p["email"] ?? "").trim()) ??
      rows[0]!;
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
export function getDealContacts(dealIds: string[]): Promise<DealContactInfo[]> {
  const key = `deal-contacts:${[...dealIds].sort().join(",")}`;
  return getCached(key, TTL_SLOW, () => load(dealIds));
}
