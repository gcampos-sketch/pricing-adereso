import { load } from "cheerio";
import {
  gateway,
  getOwners,
  getCached,
  invalidateCache,
  COMMERCIAL_PIPELINE,
  type RawDeal,
} from "./hubspot.server";
import { AE_OWNER_IDS, KAM_OWNER_IDS } from "./owner-roles";
import {
  CONTACT_CHANNELS,
  callOutcome,
  whatsappOutcome,
  type ContactActivity,
  type ContactabilityReport,
  type ContactChannel,
} from "./contactability";

const OWNER_IDS = [...AE_OWNER_IDS, ...KAM_OWNER_IDS];
const CACHE_KEY = "contactability:v1";
const DAY = 86_400_000;
type Paging = { next?: { after?: string } };
type Target = { toObjectId: string | number };
type Page<T> = { results: T[]; paging?: Paging };
type Association = { from: { id: string }; to: Target[]; paging?: Paging };
type Batch<T> = {
  status?: string;
  results: T[];
  numErrors?: number;
  errors?: {
    subCategory?: string;
    context?: { fromObjectId?: string[]; fromObjectType?: string[]; toObjectType?: string[] };
  }[];
};

const objects = { calls: "calls", whatsapp: "communications", emails: "emails" } as const;
type ActivityObject = (typeof objects)[ContactChannel];
const properties = {
  calls: ["hs_call_direction", "hs_call_status", "hs_call_disposition"],
  whatsapp: ["hs_communication_channel_type", "hs_communication_body"],
  emails: ["hs_email_direction", "hs_email_status"],
};
const filters = {
  calls: [
    {
      propertyName: "hs_call_status",
      operator: "IN",
      values: ["COMPLETED", "NO_ANSWER", "BUSY", "MISSED"],
    },
  ],
  whatsapp: [
    {
      propertyName: "hs_communication_channel_type",
      operator: "IN",
      values: ["WHATS_APP", "WHATSAPP"],
    },
  ],
  emails: [
    { propertyName: "hs_email_direction", operator: "EQ", value: "EMAIL" },
    { propertyName: "hs_email_status", operator: "EQ", value: "SENT" },
  ],
};

const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });
const inputs = (ids: string[]) => ids.map((id) => ({ id }));
const chunks = (ids: string[]) =>
  Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, i * 100 + 100));

async function searchChannel(
  channel: ContactChannel,
  start: number,
  end: number,
): Promise<RawDeal[]> {
  const rows = new Map<string, RawDeal>();
  let after: string | undefined;
  const cursors = new Set<string>();
  let total = 0;
  do {
    const page: Page<RawDeal> & { total: number } = await gateway(
      `/crm/v3/objects/${objects[channel]}/search`,
      post({
        limit: 200,
        after,
        properties: ["hs_timestamp", "hubspot_owner_id", ...properties[channel]],
        filterGroups: [
          {
            filters: [
              { propertyName: "hs_timestamp", operator: "GTE", value: String(start) },
              { propertyName: "hs_timestamp", operator: "LT", value: String(end) },
              { propertyName: "hubspot_owner_id", operator: "IN", values: OWNER_IDS },
              ...filters[channel],
            ],
          },
        ],
      }),
    );
    if (!Number.isInteger(page.total) || page.total < 0)
      throw Error("Conteo de actividades inválido");
    if (page.total >= 10_000) {
      const middle = Math.floor((start + end) / 2);
      if (middle === start) throw Error("Ventana de actividades por encima del límite");
      const left = await searchChannel(channel, start, middle);
      return left.concat(await searchChannel(channel, middle, end));
    }
    if (after && total !== page.total)
      throw Error("La búsqueda de actividades cambió durante la lectura");
    total = page.total;
    for (const row of page.results) rows.set(row.id, row);
    after = page.paging?.next?.after;
    if (after && cursors.has(after)) throw Error("La paginación de actividades no avanzó");
    if (after) cursors.add(after);
  } while (after);
  if (rows.size !== total) throw Error("Lectura incompleta de actividades");
  return [...rows.values()];
}

async function associatedDeals(object: ActivityObject, ids: string[]) {
  const links = new Map<string, string[]>();
  const singular = { calls: "call", communications: "communication", emails: "email" }[object];
  for (const batch of chunks(ids)) {
    const page = await gateway<Batch<Association>>(
      `/crm/v4/associations/${object}/deals/batch/read`,
      post({ inputs: inputs(batch) }),
    );
    if ((page.status && page.status !== "COMPLETE") || (page.numErrors && !page.errors?.length))
      throw Error("Lectura incompleta de asociaciones");
    for (const error of page.errors ?? []) {
      const context = error.context;
      if (
        error.subCategory !== "crm.associations.NO_ASSOCIATIONS_FOUND" ||
        context?.fromObjectType?.[0] !== singular ||
        context.toObjectType?.[0] !== "deal" ||
        !context.fromObjectId?.length ||
        !context.fromObjectId.every((id) => batch.includes(id))
      )
        throw Error("HubSpot no confirmó todas las asociaciones");
      for (const id of context.fromObjectId) links.set(id, []);
    }
    for (const row of page.results) {
      if (!batch.includes(row.from.id) || links.has(row.from.id))
        throw Error("Asociación de actividad inesperada");
      const dealIds = row.to.map(({ toObjectId }) => String(toObjectId));
      let after = row.paging?.next?.after;
      const cursors = new Set<string>();
      while (after) {
        if (cursors.has(after)) throw Error("La paginación de asociaciones no avanzó");
        cursors.add(after);
        const tail: Page<Target> = await gateway(
          `/crm/v4/objects/${object}/${row.from.id}/associations/deals?limit=500&after=${encodeURIComponent(after)}`,
        );
        dealIds.push(...tail.results.map(({ toObjectId }) => String(toObjectId)));
        after = tail.paging?.next?.after;
      }
      if (dealIds.some((id) => !/^\d+$/.test(id))) throw Error("ID de deal inválido");
      links.set(row.from.id, [...new Set(dealIds)]);
    }
    if (batch.some((id) => !links.has(id))) throw Error("Faltan asociaciones de actividades");
  }
  return links;
}

async function commercialDeals(ids: string[]) {
  const deals = new Map<string, string>();
  for (const batch of chunks(ids)) {
    const page = await gateway<Batch<RawDeal>>(
      "/crm/v3/objects/deals/batch/read",
      post({ inputs: inputs(batch), properties: ["pipeline", "dealname"] }),
    );
    const found = new Map(page.results.map((row) => [row.id, row.properties]));
    if (
      page.errors?.length ||
      page.numErrors ||
      (page.status && page.status !== "COMPLETE") ||
      batch.some((id) => !found.has(id))
    )
      throw Error("No se confirmó el pipeline de todos los deals");
    for (const id of batch) {
      const p = found.get(id)!;
      if (p["pipeline"] === COMMERCIAL_PIPELINE) deals.set(id, p["dealname"] || "Deal sin nombre");
    }
  }
  return deals;
}

async function readChannel(channel: ContactChannel, now: number): Promise<ContactActivity[]> {
  const records = await searchChannel(channel, now - 30 * DAY, now);
  const links = await associatedDeals(
    objects[channel],
    records.map((row) => row.id),
  );
  const deals = await commercialDeals([...new Set([...links.values()].flat())]);
  const connected =
    channel === "calls" && records.length
      ? new Set(
          (await gateway<{ id: string; label: string }[]>("/calling/v1/dispositions"))
            .filter((row) => /^(conectado|connected)$/i.test(row.label))
            .map((row) => row.id),
        )
      : new Set<string>();
  const activities: ContactActivity[] = [];
  for (const { id, properties: p } of records) {
    const linked = links
      .get(id)!
      .flatMap((dealId) => (deals.has(dealId) ? [{ id: dealId, name: deals.get(dealId)! }] : []));
    if (!linked.length) continue;
    const at = Date.parse(p["hs_timestamp"] ?? "");
    const ownerId = p["hubspot_owner_id"] ?? "";
    if (!Number.isFinite(at) || !OWNER_IDS.includes(ownerId))
      throw Error("Actividad sin fecha o comercial verificable");
    const outcome =
      channel === "whatsapp"
        ? whatsappOutcome(
            load(
              (p["hs_communication_body"] ?? "").replace(/<(?:br\b[^>]*|\/p|\/div|\/li)>/gi, "\n"),
              {},
              false,
            ).text(),
          )
        : channel === "emails"
          ? "Enviado"
          : callOutcome(p["hs_call_status"], connected.has(p["hs_call_disposition"] ?? ""));
    const direction = channel === "calls" ? p["hs_call_direction"] : null;
    if (outcome)
      activities.push({
        id,
        at: new Date(at).toISOString(),
        ownerId,
        outcome,
        deals: linked,
        direction:
          direction === "OUTBOUND" ? "Saliente" : direction === "INBOUND" ? "Entrante" : null,
      });
  }
  return activities.sort((a, b) => b.at.localeCompare(a.at));
}

export async function readContactability(fresh: boolean): Promise<ContactabilityReport> {
  if (fresh) invalidateCache(CACHE_KEY);
  return getCached(CACHE_KEY, 90_000, async () => {
    const now = Date.now();
    const [owners, ...channels] = await Promise.all([
      getOwners(),
      ...CONTACT_CHANNELS.map((channel) =>
        readChannel(channel, now).catch((error: unknown) => {
          console.warn(
            `Lectura de contactabilidad incompleta (${channel})`,
            error instanceof Error ? error.message : "",
          );
          return null;
        }),
      ),
    ]);
    const names = new Map(
      owners.map((owner) => [
        owner.id,
        [owner.firstName, owner.lastName].filter(Boolean).join(" "),
      ]),
    );
    return {
      generatedAt: new Date(now).toISOString(),
      owners: OWNER_IDS.map((id) => ({ id, name: names.get(id) || `Comercial ${id}` })).sort(
        (a, b) => a.name.localeCompare(b.name, "es"),
      ),
      channels: {
        calls: channels[0] ?? null,
        whatsapp: channels[1] ?? null,
        emails: channels[2] ?? null,
      },
    };
  });
}
