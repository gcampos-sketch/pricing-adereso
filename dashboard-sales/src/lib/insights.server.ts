import { LOSS_ENTRY_DATES_VERSION, lossEntryDate } from "./loss-sankey-scope";
import { LOSS_CLUSTER_VERSION } from "./loss-monthly-clusters";
import { readLossCompanySizes } from "./loss-company-size.server";
import { priceNumber } from "./price-conversion";
import { readDealActivityLinks } from "./deal-activity-associations.server";
import {
  getCached,
  getCommercialDeals,
  getPropertyOptionLabels,
  invalidateCache,
  getOwners as fetchOwners,
  getQuotas as fetchQuotasCached,
  TTL_SLOW,
} from "./hubspot.server";

import {
  LOST_STAGES,
  MANAGED_STAGES,
  NICKNAMES,
  WON_STAGES,
  buildPeriods,
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

const HISTORY_FROM_YEAR = 2025;
const DEAL_LOST_STAGE = "171385869";
const SERVICE_STAGE = "173990327";
const DAY_MS = 86_400_000;

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

export async function buildInsightsReport(force = false): Promise<InsightsReport> {
  const [deals, quotas, ownersRes, industries] = await Promise.all([
    getCommercialDeals([...new Set([...MANAGED_STAGES.map((stage) => stage.id), ...LOST_STAGES])]),
    fetchQuotasCached(),
    fetchOwners(),
    getPropertyOptionLabels("industria_deal"),
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
    const lostEnteredAt = isLost ? lossEntryDate(p, stageId, LOST_STAGES) : null;
    const entryYear = lostEnteredAt ? new Date(lostEnteredAt).getUTCFullYear() : NaN;
    const exactLossEntry = isLost ? lossEntryDate(p, DEAL_LOST_STAGE, LOST_STAGES) : null;
    const clusterYear = Math.max(...[p["createdate"], exactLossEntry].map(date =>
      date && Number.isFinite(Date.parse(date)) ? new Date(date).getUTCFullYear() : 0,
    ));
    if ((!Number.isFinite(year) || year < HISTORY_FROM_YEAR) &&
        !(isLost && (entryYear >= HISTORY_FROM_YEAR || clusterYear >= HISTORY_FROM_YEAR))) continue;

    const dto = toDTO(deal, ownerNames, now, quarterEnd);
    const { family, motion } = classify(p);
    const { size, sizeBucket } = sizeOf(p);
    const { lostStage, lostStageDays } = lostStageOf(p);
    const mrrRaw = Number(p["hs_mrr"] ?? 0);
    const stageMs = Number(p["hs_v2_time_in_current_stage"] ?? 0);
    const serviceStart = p[`hs_v2_date_entered_${SERVICE_STAGE}`] ?? null;

    const industry = p["industria_deal"]?.trim();
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
      lostReasonNarrative: p["closed_lost_reason"]?.trim() ? p["closed_lost_reason"] : null,
      lostReasonText:
        (p["closed_lost_reason"] ?? "").trim() ||
        (p["motivo_de_deal_perdido_en_desarrollo"] ?? "").trim() ||
        (p["deal_perdido_en_desarrollo"] ?? "").trim() ||
        null,
      lostStage,
      lostStageDays,
      lostEnteredAt,
      ...(isLost ? { lossClusters: {
        conversations: priceNumber(p["cantidad_de_tickets"]),
        meetings: null,
        companySize: null,
        monthlyRevenue: priceNumber(p["hs_mrr"]),
        currency: p["deal_currency_code"]?.trim().toUpperCase() || null,
        employees: p["tamano_empresa_empleados"]?.trim() || null,
        industry: industry ? industries.get(industry) ?? industry : null,
        entry: exactLossEntry,
      } } : {}),
      daysToKickoff: isWon ? daysBetween(closeDate, p["fecha_kickoff"]) : null,
      daysToService: isWon ? daysBetween(closeDate, serviceStart) : null,
      onTrack: (p["on_track"] ?? "").trim() || null,
      createdAt: p["createdate"] ?? "",
      objection: (p["adobo_current_objecion"] ?? "").trim() || null,
    });
  }

  const lostDeals = out.filter(deal => deal.lossClusters);
  const lostIds = lostDeals.map(deal => deal.id).sort();
  const companyCache = `loss-company-sizes:${lostIds.join(",")}`;
  const meetingsCache = `loss-meeting-links:${lostIds.join(",")}`;
  if (force) invalidateCache(meetingsCache);
  const meetingCountsPending = getCached(meetingsCache, TTL_SLOW, async () => {
    const links = await readDealActivityLinks(lostIds, "meetings");
    return new Map([...links].map(([id, activities]) => [id, activities.length]));
  }).catch(() => null);
  if (force) invalidateCache(companyCache);
  // A company lookup failure only affects its own cluster.
  const companySizesPending = getCached(companyCache, TTL_SLOW, () => readLossCompanySizes(lostIds))
    .catch(() => null);

  const [companySizes, meetingCounts] = await Promise.all([companySizesPending, meetingCountsPending]);
  for (const deal of lostDeals) {
    deal.lossClusters!.companySize = companySizes?.get(deal.id) ?? null;
    deal.lossClusters!.meetings = meetingCounts?.get(deal.id) ?? null;
  }

  const ownerIds = [...new Set(out.map((deal) => deal.ownerId))].filter(Boolean);
  const owners = ownerIds
    .map((id) => ({ id, name: ownerNames.get(id) ?? `Owner ${id}` }))
    .filter((owner) => Boolean(NICKNAMES[owner.id]))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    lossClusterVersion: LOSS_CLUSTER_VERSION,
    lossCompanySizeAvailable: companySizes !== null,
    lossMeetingCountsAvailable: meetingCounts !== null,
    lossEntryDatesVersion: LOSS_ENTRY_DATES_VERSION,
    lossNarrativesVersion: "closed-lost-reason/v1",
    generatedAt: new Date(now).toISOString(),
    currentPeriod,
    periods,
    years,
    owners,
    quotas,
    deals: out,
  };
}
