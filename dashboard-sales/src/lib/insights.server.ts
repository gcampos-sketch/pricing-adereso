import {countDealWhatsApp} from "./whatsapp-count";
import {
  getCached,
  getCommercialDeals,
  getOwners as fetchOwners,
  getQuotas as fetchQuotasCached,
  TTL_SLOW,
} from "./hubspot.server";

type GhostCounts = { emails: number; calls: number; whatsapp: number | null };

/** IDs de objetos asociados por deal, vía batch read de asociaciones v4. */
async function associationIds(dealIds: string[], type: string): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < dealIds.length; i += 100) {
    const chunk = dealIds.slice(i, i + 100);
    const res = await gateway<{
      results: { from: { id: string }; to: { toObjectId: string | number }[]; paging?: {next?: {after?: string}} }[];
      errors?: unknown[]; numErrors?: number;
    }>(`/crm/v4/associations/deals/${type}/batch/read`, {
      method: "POST",
      body: JSON.stringify({ inputs: chunk.map((id) => ({ id })) }),
    });
    if (res.errors?.length || res.numErrors || chunk.some(id=>!res.results?.some(r=>r.from.id===id))) throw new Error('Lectura incompleta de asociaciones');
    for (const row of res.results ?? []) {
      const ids=(row.to ?? []).map(t=>String(t.toObjectId));
      let after=row.paging?.next?.after;
      const seen=new Set<string>();
      while(after) {
        if(seen.has(after)) throw new Error('Paginación de asociaciones incompleta');
        seen.add(after);
        const page=await gateway<{results:{toObjectId:string|number}[];paging?:{next?:{after?:string}}}>(`/crm/v4/objects/deals/${row.from.id}/associations/${type}?limit=500&after=${encodeURIComponent(after)}`);
        ids.push(...page.results.map(t=>String(t.toObjectId)));after=page.paging?.next?.after;
      }
      out.set(row.from.id,[...new Set(ids)]);
    }
  }
  return out;
}

/**
 * Cuenta correos, llamadas y WhatsApp asociados a cada deal perdido por
 * ghosting. WhatsApp nativo usa el canal WHATS_APP; fallos se muestran sin dato.
 */
function fetchGhostCounts(dealIds: string[]): Promise<Map<string, GhostCounts>> {
  return getCached(`ghost-v2:${dealIds.join(",")}`, TTL_SLOW, async () => {
    const [emails, calls, comms] = await Promise.all([
      associationIds(dealIds, "emails"),
      associationIds(dealIds, "calls"),
      associationIds(dealIds, "communications"),
    ]);

    // Native HubSpot uses WHATS_APP; retain old WHATSAPP values without counting foreign records.
    const commIds = [...new Set([...comms.values()].flat())];
    const communicationRows: {id:string;properties:Record<string,string|null>}[]=[];
    for (let i = 0; i < commIds.length; i += 100) {
      const chunk = commIds.slice(i, i + 100);
      if (!chunk.length) break;
      const res = await gateway<{
        results: { id: string; properties: Record<string, string | null> }[]; errors?:unknown[]; numErrors?:number;
      }>("/crm/v3/objects/communications/batch/read", {
        method: "POST",
        body: JSON.stringify({
          inputs: chunk.map((id) => ({ id })),
          properties: ["hs_communication_channel_type"],
        }),
      });
      if(res.errors?.length || res.numErrors || chunk.some(id=>!res.results?.some(r=>r.id===id))) throw new Error("Lectura incompleta de comunicaciones");
      communicationRows.push(...res.results);
    }

    const out = new Map<string, GhostCounts>();
    for (const id of dealIds) {
      out.set(id, {
        emails: emails.get(id)?.length ?? 0,
        calls: calls.get(id)?.length ?? 0,
        whatsapp: countDealWhatsApp(comms.get(id) ?? [],communicationRows),
      });
    }
    return out;
  });
}
import {
  LOST_STAGES,
  MANAGED_STAGES,
  NICKNAMES,
  WON_STAGES,
  buildPeriods,
  gateway,
  periodOf,
  quarterBounds,
  toDTO,
} from "./pulse.server";
import type { Props, RawDeal } from "./pulse.server";
import type {
  DealFamily,
  DealMotion,
  DealStatus,
  InsightDeal,
  InsightsReport,
  SizeBucket,
} from "./insights-types";

const PIPELINE_ID = "93085851";
const HISTORY_FROM_YEAR = 2025;
const SERVICE_STAGE = "173990327";
const DAY_MS = 86_400_000;

const BASE_PROPS = [
  "dealname",
  "amount",
  "dealstage",
  "closedate",
  "createdate",
  "hubspot_owner_id",
  "hs_deal_stage_probability",
  "hs_deal_score",
  "adobo_closing_score",
  "closed_lost_reason",
  "razones_de_cierre_perdidos_especifico",
  "deal_perdido_en_desarrollo",
  "motivo_de_deal_perdido_en_desarrollo",
  "dealtype",
  "negocio_inbound",
  "fuente_de_creacion",
  "notes_next_activity_date",
  "hs_next_step",
  "on_track",
  "seguimiento_con_pinzas",
  "hs_mrr",
  "fecha_kickoff",
  "productos_a_contratar",
  "tipo_de_proyecto",
  "tamano_de_empresa_deal",
  "tamano_empresa_empleados",
  "hs_v2_time_in_current_stage",
  `hs_v2_date_entered_${SERVICE_STAGE}`,
];

const DEAL_PROPS = [
  ...BASE_PROPS,
  ...MANAGED_STAGES.flatMap((stage) => [
    `hs_v2_date_entered_${stage.id}`,
    `hs_v2_cumulative_time_in_${stage.id}`,
  ]),
];

function classify(p: Props): { family: DealFamily; motion: DealMotion } {
  const type = (p["dealtype"] ?? "").trim();
  if (/^upsell/i.test(type)) return { family: "Expansión", motion: "Upsell" };
  if (/^cross/i.test(type)) return { family: "Expansión", motion: "Cross sell" };
  if (/^renov/i.test(type)) return { family: "Renovación", motion: "Renovación" };
  if (/^newbusiness$/i.test(type) || /oportunidad/i.test(type))
    return { family: "Venta nueva", motion: "Venta nueva" };
  return { family: "Sin clasificar", motion: "Sin clasificar" };
}

const SIZE_BUCKETS: { match: RegExp; bucket: SizeBucket }[] = [
  { match: /independiente|^2 - 50$/i, bucket: "SMB" },
  { match: /^51 - 200$|^201 - 500$|^501 - 1\.000$/i, bucket: "Mid Market" },
  { match: /^1\.001|^5\.001|^\+10\.000$/i, bucket: "Enterprise" },
];

function sizeOf(p: Props): { size: string; sizeBucket: SizeBucket } {
  const raw = (p["tamano_de_empresa_deal"] ?? "").trim();
  if (!raw) {
    const tier = (p["tamano_empresa_empleados"] ?? "").trim();
    if (/grande/i.test(tier)) return { size: tier, sizeBucket: "Enterprise" };
    if (/mediana/i.test(tier)) return { size: tier, sizeBucket: "Mid Market" };
    if (/peque/i.test(tier)) return { size: tier, sizeBucket: "SMB" };
    return { size: "Sin dato", sizeBucket: "Sin dato" };
  }
  const found = SIZE_BUCKETS.find((item) => item.match.test(raw));
  return { size: raw, sizeBucket: found?.bucket ?? "Sin dato" };
}

const PRODUCT_ALIAS: Record<string, string> = {
  agent: "Studio Agent",
  "studio agent": "Studio Agent",
  flows: "Studio Workflows",
  "studio bot flow": "Studio Workflows",
  "studio workflows": "Studio Workflows",
  "studio chatbots": "Studio Chatbots",
  studio: "Studio",
  desk: "Desk",
  engage: "Engage",
  voc: "VoC",
  cassper: "Cassper",
  gpt: "GPT",
  "desarrollo custom": "Custom",
  custom: "Custom",
  experience: "Experience",
  integraciones: "Integraciones",
  ivr: "IVR",
};

function productsOf(p: Props): string[] {
  const raw = [p["productos_a_contratar"], p["tipo_de_proyecto"]]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join("+");
  if (!raw) return [];
  const parts = raw
    .split(/[+;,/]/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const out = new Set<string>();
  for (const part of parts) {
    out.add(PRODUCT_ALIAS[part] ?? part.replace(/\b\w/g, (c) => c.toUpperCase()));
  }
  return [...out];
}

function lostStageOf(p: Props): { lostStage: string; lostStageDays: number } {
  let best: { key: string; ts: number } | null = null;
  for (const stage of MANAGED_STAGES) {
    const entered = p[`hs_v2_date_entered_${stage.id}`];
    const ts = entered ? Date.parse(entered) : NaN;
    if (!Number.isFinite(ts)) continue;
    if (!best || ts > best.ts) best = { key: stage.key, ts };
  }
  if (!best) return { lostStage: "Sin recorrido", lostStageDays: 0 };
  const stage = MANAGED_STAGES.find((item) => item.key === best!.key)!;
  const ms = Number(p[`hs_v2_cumulative_time_in_${stage.id}`] ?? 0);
  return {
    lostStage: best.key,
    lostStageDays: Number.isFinite(ms) && ms > 0 ? Math.round(ms / DAY_MS) : 0,
  };
}

function daysBetween(from: string | null | undefined, to: string | null | undefined) {
  if (!from || !to) return null;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const days = Math.round((b - a) / DAY_MS);
  return days < 0 || days > 720 ? null : days;
}

export async function buildInsightsReport(): Promise<InsightsReport> {
  const [deals, quotas, ownersRes] = await Promise.all([
    getCommercialDeals(MANAGED_STAGES.map((stage) => stage.id)),
    fetchQuotasCached(),
    fetchOwners(),
  ]);

  const ownerNames = new Map<string, string>();
  for (const owner of ownersRes) {
    ownerNames.set(
      owner.id,
      NICKNAMES[owner.id] ??
        ([owner.firstName, owner.lastName].filter(Boolean).join(" ").trim() || `Owner ${owner.id}`),
    );
  }

  const now = Date.now();
  const currentPeriod = periodOf(new Date(now).toISOString());
  const { end: quarterEnd } = quarterBounds(currentPeriod);
  const periods = buildPeriods(currentPeriod);
  const years = [...new Set(periods.map((period) => period.split("-")[0]!))];

  const out: InsightDeal[] = [];
  for (const deal of deals) {
    const p = deal.properties;
    const stageId = p["dealstage"] ?? "";
    const isWon = WON_STAGES.has(stageId);
    const isLost = LOST_STAGES.has(stageId);
    const managed = MANAGED_STAGES.find((stage) => stage.id === stageId);
    if (!isWon && !isLost && !managed) continue;
    const status: DealStatus = isWon ? "won" : isLost ? "lost" : "open";

    const closeDate = p["closedate"] ?? "";
    const reference = closeDate || p["createdate"] || new Date(now).toISOString();
    const period = periodOf(reference);
    const year = Number(period.split("-")[0]);
    if (!Number.isFinite(year) || year < HISTORY_FROM_YEAR) continue;

    const dto = toDTO(deal, ownerNames, now, quarterEnd);
    const { family, motion } = classify(p);
    const { size, sizeBucket } = sizeOf(p);
    const { lostStage, lostStageDays } = lostStageOf(p);
    const mrrRaw = Number(p["hs_mrr"] ?? 0);
    const stageMs = Number(p["hs_v2_time_in_current_stage"] ?? 0);
    const serviceStart = p[`hs_v2_date_entered_${SERVICE_STAGE}`] ?? null;

    out.push({
      ...dto,
      ownerId: p["hubspot_owner_id"] ?? "",
      status,
      period,
      family,
      motion,
      mrr: dto.amountValue > 0 ? dto.amountValue : Number.isFinite(mrrRaw) && mrrRaw > 0 ? mrrRaw : 0,
      products: productsOf(p),
      size,
      sizeBucket,
      sourceLabel: (p["fuente_de_creacion"] ?? "").trim() || "Sin fuente",
      stageKey: dto.stage,
      stageDays: Number.isFinite(stageMs) && stageMs > 0 ? Math.round(stageMs / DAY_MS) : 0,
      lostReason: (p["razones_de_cierre_perdidos_especifico"] ?? "").trim() || null,
      lostReasonText:
        (p["closed_lost_reason"] ?? "").trim() ||
        (p["motivo_de_deal_perdido_en_desarrollo"] ?? "").trim() ||
        (p["deal_perdido_en_desarrollo"] ?? "").trim() ||
        null,
      lostStage,
      lostStageDays,
      daysToKickoff: isWon ? daysBetween(closeDate, p["fecha_kickoff"]) : null,
      daysToService: isWon ? daysBetween(closeDate, serviceStart) : null,
      onTrack: (p["on_track"] ?? "").trim() || null,
      createdAt: p["createdate"] ?? "",
      objection: (p["adobo_current_objecion"] ?? "").trim() || null,
      ghost: null,
    });
  }

  // ---------- ghosting: actividades de cierre en deals perdidos ----------
  const ghostDeals = out
    .filter(
      (deal) =>
        deal.status === "lost" &&
        (/ghost/i.test(deal.lostReason ?? "") || /ghost/i.test(deal.lostReasonText ?? "")),
    )
    .sort((a, b) => Date.parse(b.closeDateValue || "0") - Date.parse(a.closeDateValue || "0"))
    .slice(0, 60);
  if (ghostDeals.length) {
    try {
      const counts = await fetchGhostCounts(ghostDeals.map((deal) => deal.id));
      for (const deal of ghostDeals) {
        deal.ghost = counts.get(deal.id) ?? null;
      }
    } catch (error) {
      console.warn("No se pudieron cargar actividades de ghosting", error);
    }
  }

  const ownerIds = [...new Set(out.map((deal) => deal.ownerId))].filter(Boolean);
  const owners = ownerIds
    .map((id) => ({ id, name: ownerNames.get(id) ?? `Owner ${id}` }))
    .filter((owner) => Boolean(NICKNAMES[owner.id]))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    generatedAt: new Date(now).toISOString(),
    currentPeriod,
    periods,
    years,
    owners,
    quotas,
    deals: out,
  };
}
