import { roleOwnerIds, type RoleFilter } from "./owner-roles";
import { quotaStats } from "./quota-eligibility";
import { buildExecutiveStrip } from './executive-strip';
import type {
  AlertItem,
  DealDTO,
  Drilldown,
  OwnerRow,
  PeriodStats,
  PulseReport,
  QualityCard,
  QuotaRow,
  RiskSummary,
  SegmentRow,
  Tone,
  TrackingScope,
  CloseHygieneScope,
  TaskHygieneScope,
  PlanBotScope,
  WarningScope,
  PlanBotRow,
  DeliveryScope,
  DeliveryPeriodStat,
  DeliveryRow,
  MonthlyPulse,
  WrBySegment,
  ContactTempScope,
  StageJourney,
} from "./pulse-types";
import type { RampScope, RampPeriodStat } from "./team-types";
import { adoboDetail, buildAdoboLayer, contactTemperature, normRate } from "./adobo.server";
import {
  gateway as gw,
  getCommercialDeals,
  getChurnedDealIds,
  getOwners as fetchOwners,
  getQuotas as fetchQuotasCached,
  getPropertyOptionLabels,
  getCached as cached,
  TTL_DEALS,
  type Props,
  type RawDeal,
} from "./hubspot.server";

export const PORTAL_ID = "23480943";

/** Umbrales de cobertura: pipeline ponderado del Q sobre lo que falta para la cuota. */
export const COVERAGE_OK = 3;
export const COVERAGE_WARN = 1.5;
const COVERAGE_MAX = 99;

/** Semáforo único: verde en camino, ámbar atención, rojo riesgo, neutro sin cuota. */
export function assessRisk(
  quota: number,
  won: number,
  weightedOpenQ: number,
): { remaining: number; coverage: number; risk: Tone; riskReason: string } {
  const remaining = Math.max(0, quota - won);
  if (!quota) {
    return { remaining, coverage: 0, risk: "neutral", riskReason: "sin cuota asignada" };
  }
  if (remaining === 0) {
    return { remaining: 0, coverage: COVERAGE_MAX, risk: "ok", riskReason: "cuota cumplida" };
  }
  const coverage = Math.min(COVERAGE_MAX, weightedOpenQ / remaining);
  const cov = `cobertura ${coverage.toFixed(1)}x del gap`;
  if (weightedOpenQ <= 0) {
    return { remaining, coverage: 0, risk: "bad", riskReason: "sin pipeline en el Q para cubrir el gap" };
  }
  if (coverage >= COVERAGE_OK) return { remaining, coverage, risk: "ok", riskReason: cov };
  if (coverage >= COVERAGE_WARN) {
    return { remaining, coverage, risk: "warn", riskReason: `${cov} · bajo el 3x recomendado` };
  }
  return { remaining, coverage, risk: "bad", riskReason: `${cov} · insuficiente para cumplir` };
}


/** Etapas gestionables E1-E5.1 del pipeline Comercial. */
export const MANAGED_STAGES: { key: string; id: string }[] = [
  { key: "E1", id: "171385863" },
  { key: "E2", id: "171385864" },
  { key: "E3", id: "173996363" },
  { key: "E3.1", id: "1181334581" },
  { key: "E4", id: "171385866" },
  { key: "E5", id: "171385867" },
  { key: "E5.1", id: "1245768029" },
];
const JOURNEY_STAGES: { key: string; id: string }[] = [
  { key: "E0", id: "1144383754" },
  { key: "E1", id: "171385863" },
  { key: "E2", id: "171385864" },
  { key: "E4", id: "171385866" },
  { key: "E5", id: "171385867" },
  { key: "E5.1", id: "1245768029" },
  { key: "E6", id: "174677684" },
  { key: "E6.1", id: "1278792585" },
  { key: "E6.2", id: "1086544542" },
  { key: "E8", id: "173990327" },
];
export const STAGE_KEY = new Map(MANAGED_STAGES.map((s) => [s.id, s.key]));
const LATE_STAGES = new Set(["171385867", "1245768029"]);
export const WON_STAGES = new Set([
  "174677684",
  "1278792585",
  "1086544542",
  "213244763",
  "171385868",
  "173990327",
]);
export const LOST_STAGES = new Set(["171385869", "1372234925", "213417520", "178228041"]);
const STAGE_LABELS: Record<string, string> = {
  "1144383754": "E0",
  "174677684": "E6 Ganado",
  "1278792585": "E6.1 Warning",
  "1086544542": "E6.2 En desarrollo",
  "213244763": "E6.3 Piloto",
  "171385868": "E7 Onboarding",
  "173990327": "E8 Servicio iniciado",
  "171385869": "Perdido",
  "1372234925": "Perdido desarrollo",
  "213417520": "Piloto perdido",
  "178228041": "Churn",
};

/** Etiqueta completa del pipeline Comercial: número + nombre tal como está en HubSpot. */
const STAGE_FULL_LABELS: Record<string, string> = {
  "1144383754": "0. Reunión Agendada",
  "171385863": "1. Reunión comercial Concretada",
  "171385864": "2. Bajada de requerimientos",
  "173996363": "3. Elaboración propuesta técnica",
  "1181334581": "3.1 Cotización de SP Realizada",
  "171385866": "4. Elaboración de Propuesta",
  "171385867": "5. Negociación de propuesta (ya enviada)",
  "1245768029": "5.1 PoC - Demo",
  "174677684": "6. Propuesta comercial firmada",
  "1278792585": "6.1 Deal Warning",
  "1086544542": "6.2 Proyecto en Desarrollo",
  "213244763": "6.3 Piloto",
  "171385868": "7. Onboarding",
  "173990327": "8. Servicio iniciado",
  "171385869": "Deal perdido",
  "1372234925": "Deal en Desarrollo Perdido",
  "213417520": "Piloto perdido",
  "178228041": "Churn",
};

/** Comerciales AE: miden inbound/outbound. El resto mide upsell/cross sell. */
const AE_OWNERS = new Set(["82596016", "331766554", "373167468", "98326728"]);

export const NICKNAMES: Record<string, string> = {
  "82596016": "Holly",
  "331766554": "Gonza",
  "373167468": "Giordano",
  "91603512": "Naty",
  "93662868": "Felipe",
  "98326728": "Andrés",
};
const HISTORY_FROM_YEAR = 2025;

export type { Props, RawDeal } from "./hubspot.server";

export {
  gateway,
  headers,
  getCached,
  getOwners,
  getQuotas,
  getPropertyOptionLabels,
  searchDealsCached,
  TTL_DEALS,
  TTL_SLOW,
} from "./hubspot.server";


type TaskLoad = { overdue: number; today: number };

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Tareas pendientes (no completadas) con vencimiento hoy o antes, por deal.
 * Partimos de los deals abiertos (los únicos que usa el panel de higiene) y leemos
 * sus tareas asociadas: mucho más liviano que listar todas las tareas del portal.
 */
function fetchPendingTasks(
  dealIds: string[],
  todayEnd: number,
  todayStart: number,
): Promise<Map<string, TaskLoad>> {
  return cached(`pending-tasks:${todayStart}:${dealIds.length}`, TTL_DEALS, () =>
    loadPendingTasks(dealIds, todayEnd, todayStart),
  );
}

async function loadPendingTasks(
  dealIds: string[],
  todayEnd: number,
  todayStart: number,
): Promise<Map<string, TaskLoad>> {
  if (!dealIds.length) return new Map();
  const tasksOfDeal = new Map<string, string[]>();
  try {
    const batches = await Promise.all(
      chunk(dealIds, 100).map((batch) =>
        gw<{ results: { from: { id: string }; to: { toObjectId: string | number }[] }[] }>(
          "/crm/v4/associations/deals/tasks/batch/read",
          { method: "POST", body: JSON.stringify({ inputs: batch.map((id) => ({ id })) }) },
        ),
      ),
    );
    for (const data of batches) {
      for (const row of data.results ?? []) {
        const ids = (row.to ?? []).map((target) => String(target.toObjectId));
        if (ids.length) tasksOfDeal.set(row.from.id, ids);
      }
    }
  } catch (error) {
    console.warn("No pudimos leer asociaciones deal→tarea", error);
    return new Map();
  }

  const taskIds = [...new Set([...tasksOfDeal.values()].flat())];
  const info = new Map<string, number>();
  try {
    const batches = await Promise.all(
      chunk(taskIds, 100).map((batch) =>
        gw<{ results: { id: string; properties: Props }[] }>("/crm/v3/objects/tasks/batch/read", {
          method: "POST",
          body: JSON.stringify({
            properties: ["hs_task_status", "hs_timestamp"],
            inputs: batch.map((id) => ({ id })),
          }),
        }),
      ),
    );
    for (const data of batches) {
      for (const row of data.results ?? []) {
        const status = row.properties["hs_task_status"] ?? "";
        if (status !== "NOT_STARTED" && status !== "WAITING") continue;
        const due = Date.parse(row.properties["hs_timestamp"] ?? "");
        if (!Number.isFinite(due) || due > todayEnd) continue;
        info.set(row.id, due);
      }
    }
  } catch (error) {
    console.warn("No pudimos leer tareas pendientes", error);
    return new Map();
  }

  const load = new Map<string, TaskLoad>();
  for (const [dealId, ids] of tasksOfDeal) {
    const bucket: TaskLoad = { overdue: 0, today: 0 };
    for (const id of ids) {
      const due = info.get(id);
      if (due === undefined) continue;
      if (due >= todayStart) bucket.today += 1;
      else bucket.overdue += 1;
    }
    if (bucket.overdue + bucket.today > 0) load.set(dealId, bucket);
  }
  return load;
}



export function periodOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

export function shortPeriod(period: string): string {
  const [year, q] = period.split("-Q");
  return `${"Q" + q}-${year!.slice(2)}`;
}

export const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

export function quarterBounds(period: string) {
  const [yearRaw, qRaw] = period.split("-Q");
  const year = Number(yearRaw);
  const q = Number(qRaw);
  const start = Date.UTC(year, (q - 1) * 3, 1);
  const end = Date.UTC(q === 4 ? year + 1 : year, q === 4 ? 0 : q * 3, 1);
  return { start, end };
}

export function buildPeriods(current: string): string[] {
  const periods: string[] = [];
  const [curYear, curQ] = current.split("-Q").map(Number);
  for (let year = HISTORY_FROM_YEAR; year <= curYear!; year++) {
    for (let q = 1; q <= 4; q++) {
      if (year === curYear && q > curQ!) break;
      periods.push(`${year}-Q${q}`);
    }
  }
  return periods;
}

export function closeStatus(closeDate: string | null, now: number, quarterEnd: number) {
  if (!closeDate) return { label: "Sin fecha", value: 0 };
  const ts = Date.parse(closeDate);
  if (Number.isNaN(ts)) return { label: "Sin fecha", value: 0 };
  if (ts < now) return { label: "Vencido", value: 1 };
  if (ts - now <= 7 * 86_400_000) return { label: "≤ 7 días", value: 2 };
  if (ts < quarterEnd) return { label: "Este Q", value: 3 };
  return { label: "Futuro", value: 4 };
}

/** Etiquetas de status_contrato, cargadas al construir el reporte. */
let CONTRACT_LABELS = new Map<string, string>();

export function toDTO(deal: RawDeal, ownerNames: Map<string, string>, now: number, quarterEnd: number): DealDTO {
  const p = deal.properties;
  const amount = Number(p["amount"] ?? 0);
  const probability = p["hs_deal_stage_probability"];
  const score = p["hs_deal_score"];
  const adobo = p["adobo_closing_score"];
  const stageId = p["dealstage"] ?? "";
  const status = closeStatus(p["closedate"] ?? null, now, quarterEnd);
  const closeDateValue = p["closedate"] ?? "";
  const nextActivityValue = p["notes_next_activity_date"] ?? "";
  return {
    id: deal.id,
    name: p["dealname"] ?? "(sin nombre)",
    url: `https://app.hubspot.com/contacts/${PORTAL_ID}/deal/${deal.id}`,
    owner: ownerNames.get(p["hubspot_owner_id"] ?? "") ?? "Sin dueño",
    ownerId: p["hubspot_owner_id"] ?? "",
    amount: money(amount),
    amountValue: amount,
    otfValue: Number(p["otf"] ?? 0) > 0 ? Number(p["otf"]) : 0,
    stage: STAGE_KEY.get(stageId) ?? STAGE_LABELS[stageId] ?? "—",
    stageFull: STAGE_FULL_LABELS[stageId] ?? STAGE_KEY.get(stageId) ?? STAGE_LABELS[stageId] ?? "—",
    stageId,
    segment: segmentOf(p),
    activities: p["num_contacted_notes"] != null && p["num_contacted_notes"] !== "" ? Number(p["num_contacted_notes"]) : null,
    lastContacted: p["notes_last_contacted"] ?? "",
    closeDate: closeDateValue
      ? new Date(closeDateValue).toLocaleDateString("es-CL", { timeZone: "UTC" })
      : "s/f",
    closeDateValue,
    probability: probability ? `${Math.round(Number(probability) * 100)}%` : "s/n",
    probabilityValue: probability ? Number(probability) : 0,
    score: score ? `${Math.round(Number(score))}%` : "s/n",
    scoreValue: score ? Number(score) : -1,
    adoboScore: adobo ? `${Math.round(Number(adobo))}` : "s/n",
    adoboScoreValue: adobo ? Number(adobo) : -1,
    nextActivity: nextActivityValue
      ? new Date(nextActivityValue).toLocaleDateString("es-CL", { timeZone: "UTC" })
      : "sin agendar",
    nextActivityValue,
    nextStep: p["hs_next_step"]?.trim() ? p["hs_next_step"]!.trim() : null,
    closeStatus: status.label,
    closeStatusValue: status.value,
    financeAlert: p["alerta_finanazas_negocio"]?.trim()
      ? p["alerta_finanazas_negocio"]!.split(";").map((v) => v.trim().replace(/__/g, " ").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())).join(" · ")
      : null,
    ssppAlert: p["alerta_sspp"]?.trim() || null,
    contractStatus: p["status_contrato"]?.trim() ? CONTRACT_LABELS.get(p["status_contrato"]!.trim()) ?? p["status_contrato"]!.trim() : null,
    productToHire: p["productos_a_contratar"]?.trim() || null,
    dealType: p["dealtype"]?.trim() || null,
    lostReason: p["closed_lost_reason"]?.trim() ? p["closed_lost_reason"]!.trim() : null,
    source: p["fuente_de_creacion"] ?? null,
    country: p["pais"]?.trim() ? p["pais"]!.trim() : null,
    signalDate:
      p["candidato_perdido_prioridad"] === "true" || p["candidato_perdido_competencia"] === "true"
        ? p["hs_lastmodifieddate"]
          ? new Date(p["hs_lastmodifieddate"]).toLocaleDateString("es-CL", { timeZone: "UTC" })
          : null
        : null,
    adobo: adoboDetail(p),
  };
}

function emptyStats(): PeriodStats {
  return { won: 0, lost: 0, wonAmount: 0, lostAmount: 0, wonOtf: 0, wonDeals: [], lostDeals: [] };
}

export function otfOf(list: RawDeal[]) {
  return list.reduce((sum, d) => {
    const value = Number(d.properties["otf"] ?? 0);
    return sum + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);
}

export function wrRate(stats: { won: number; lost: number }) {
  const total = stats.won + stats.lost;
  return total ? stats.won / total : 0;
}

function segmentOf(p: Props): string {
  const type = p["dealtype"] ?? "";
  if (type.startsWith("Upsell")) return "Upsell";
  if (type.startsWith("Cross")) return "Cross sell";
  if (type.startsWith("Renovación")) return "Renovación";
  return p["negocio_inbound"] === "true" ? "Inbound" : "Outbound";
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SIGNED_STAGE = "174677684";
const DEV_STAGE = "1086544542";
type PushDrill = (key: string, title: string, subtitle: string, list: RawDeal[]) => void;

/** Días entre entrada a etapa 6 (propuesta firmada) y etapa 6.2 (proyecto en desarrollo). */
function buildDevRamp(
  id: string,
  name: string,
  deals: RawDeal[],
  periods: string[],
  now: number,
  _dto: (deal: RawDeal) => DealDTO,
  push: PushDrill,
): RampScope {
  const rows = new Map<string, RampPeriodStat & { done: RawDeal[]; pending: RawDeal[] }>();
  for (const period of periods) {
    rows.set(period, {
      period,
      days: [],
      mrrSum: 0,
      pendingCount: 0,
      pendingDays: [],
      modal: `cramp-${id}-${period}`,
      pendingModal: `cramp-${id}-pending-${period}`,
      done: [],
      pending: [],
    });
  }
  for (const deal of deals) {
    const signed = deal.properties[`hs_v2_date_entered_${SIGNED_STAGE}`];
    const signedTs = signed ? Date.parse(signed) : NaN;
    if (!Number.isFinite(signedTs)) continue;
    const row = rows.get(periodOf(new Date(signedTs).toISOString()));
    if (!row) continue;
    const dev = deal.properties[`hs_v2_date_entered_${DEV_STAGE}`];
    const devTs = dev ? Date.parse(dev) : NaN;
    if (Number.isFinite(devTs) && devTs >= signedTs) {
      row.days.push((devTs - signedTs) / DAY_MS);
      row.mrrSum += Number(deal.properties["amount"] ?? 0);
      row.done.push(deal);
    } else if (deal.properties["dealstage"] === SIGNED_STAGE) {
      // Solo cuentan como pendientes los que siguen pegados en etapa 6:
      // si ya están en 6.2, piloto, onboarding u 8, no son un warning de avance.
      row.pendingCount += 1;
      row.pendingDays.push((now - signedTs) / DAY_MS);
      row.pending.push(deal);
    }
  }
  for (const row of rows.values()) {
    push(
      row.modal,
      `${name} · proyecto en desarrollo ${row.period}`,
      `${row.done.length} deals firmados que ya pasaron a desarrollo`,
      row.done,
    );
    push(
      row.pendingModal,
      `${name} · firmados sin desarrollo ${row.period}`,
      `${row.pending.length} deals firmados aún sin pasar a desarrollo`,
      row.pending,
    );
  }
  return {
    id,
    name,
    periods: [...rows.values()].map(({ done: _d, pending: _p, ...rest }) => rest),
  };
}

/** Deals ganados agrupados por Plan de Bot (etiqueta de HubSpot) y trimestre de cierre. */
function buildPlanBot(
  id: string,
  name: string,
  deals: RawDeal[],
  periods: string[],
  push: PushDrill,
): PlanBotScope {
  const buckets = new Map<string, Map<string, RawDeal[]>>();
  for (const deal of deals) {
    const p = deal.properties;
    if (!WON_STAGES.has(p["dealstage"] ?? "")) continue;
    const close = p["closedate"];
    if (!close) continue;
    const period = periodOf(close);
    if (!periods.includes(period)) continue;
    const plan = (p["plan_de_bot"] ?? "").trim() || "Sin plan definido";
    if (!buckets.has(plan)) buckets.set(plan, new Map());
    const byPeriod = buckets.get(plan)!;
    if (!byPeriod.has(period)) byPeriod.set(period, []);
    byPeriod.get(period)!.push(deal);
  }
  const rows: PlanBotRow[] = [...buckets.entries()]
    .map(([plan, byPeriod], index) => {
      const key = `p${index}`;
      const stats: PlanBotRow["byPeriod"] = {};
      for (const [period, list] of byPeriod) {
        const modal = `cplanbot-${id}-${key}-${period}`;
        stats[period] = {
          period,
          count: list.length,
          amount: list.reduce((sum, d) => sum + Number(d.properties["amount"] ?? 0), 0),
          modal,
        };
        push(modal, `${name} · ${plan} ${period}`, `Deals ganados con plan ${plan}`, list);
      }
      return { key, label: plan, byPeriod: stats };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
  return { id, name, rows };
}

/* ---------------- Entrega: ganados en desarrollo, contratos y finanzas ---------------- */

const SERVICE_STAGE = "173990327";
const WARNING_STAGE = "1278792585";
const PILOT_STAGE = "213244763";
const ONBOARDING_STAGE = "171385868";
const LOST_DEVELOPMENT_STAGE = "1372234925";
const PAID_RE = /pago recibido|pagado|factura pagada/i;
const NO_SETUP_RE = /sin setup|propuesta setup \$?0/i;
const STUCK_DAYS = 30;

const median = (values: number[]) => {
  if (!values.length) return -1;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

const numberOf = (raw: string | null | undefined) => {
  const value = Number(raw ?? NaN);
  return Number.isFinite(value) ? value : null;
};

/** Agrupa deals por una etiqueta y arma filas ordenadas por monto. */
function deliveryRows(
  prefix: string,
  groups: Map<string, RawDeal[]>,
  titleOf: (label: string) => string,
  push: PushDrill,
): DeliveryRow[] {
  return [...groups.entries()]
    .map(([label, list], index) => {
      const key = `${prefix}-${index}`;
      const progress = list.map((d) => numberOf(d.properties["adobo_avance_kickoff_pct"])).filter(
        (v): v is number => v !== null,
      );
      const days = list
        .map((d) => numberOf(d.properties["adobo_dias_en_etapa_actual"]))
        .filter((v): v is number => v !== null);
      push(key, titleOf(label), `${list.length} deals ganados`, list);
      return {
        key,
        label,
        count: list.length,
        amount: list.reduce((sum, d) => sum + Number(d.properties["amount"] ?? 0), 0),
        avgProgress: progress.length
          ? progress.reduce((a, b) => a + b, 0) / progress.length
          : -1,
        medDays: median(days),
        modal: key,
      };
    })
    .sort((a, b) => b.amount - a.amount || b.count - a.count);
}

/**
 * Recorrido post-firma de los deals ganados: avance hacia el kick off, etapa del
 * portal cliente, salida a producción, estado de contrato y de cobranza.
 */
function buildDelivery(
  id: string,
  name: string,
  deals: RawDeal[],
  periods: string[],
  push: PushDrill,
  contractLabels: Map<string, string>,
  projectLabels: Map<string, string>,
): DeliveryScope {
  const stats: DeliveryPeriodStat[] = [];
  for (const period of periods) {
    const won = deals.filter((deal) => {
      const p = deal.properties;
      if (!WON_STAGES.has(p["dealstage"] ?? "")) return false;
      const close = p["closedate"];
      return !!close && periodOf(close) === period;
    });
    const live = won.filter((d) => d.properties["dealstage"] === SERVICE_STAGE);
    const inFlight = won.filter((d) => !live.includes(d));
    const dev = won.filter((d) => d.properties["dealstage"] === DEV_STAGE);
    const warning = won.filter((d) => d.properties["dealstage"] === WARNING_STAGE);
    const pilot = won.filter((d) => d.properties["dealstage"] === PILOT_STAGE);
    const onboarding = won.filter((d) => d.properties["dealstage"] === ONBOARDING_STAGE);
    const lostDevelopment = deals.filter((d) => {
      if (d.properties["dealstage"] !== LOST_DEVELOPMENT_STAGE) return false;
      const close = d.properties["closedate"];
      return !!close && periodOf(close) === period;
    });
    const stuck = inFlight.filter(
      (d) => (numberOf(d.properties["adobo_dias_en_etapa_actual"]) ?? 0) > STUCK_DAYS,
    );
    const progress = inFlight
      .map((d) => numberOf(d.properties["adobo_avance_kickoff_pct"]))
      .filter((v): v is number => v !== null);

    const portalGroups = new Map<string, RawDeal[]>();
    for (const deal of inFlight) {
      const label = deal.properties["adobo_etapa_actual_portal_cliente"]?.trim() || "Sin etapa registrada";
      if (!portalGroups.has(label)) portalGroups.set(label, []);
      portalGroups.get(label)!.push(deal);
    }
    const contractGroups = new Map<string, RawDeal[]>();
    for (const deal of won) {
      const raw = deal.properties["status_contrato"]?.trim() ?? "";
      const label = (raw && contractLabels.get(raw)) || raw || "Sin status de contrato";
      if (!contractGroups.has(label)) contractGroups.set(label, []);
      contractGroups.get(label)!.push(deal);
    }

    const setupBase = won.filter((d) => {
      const value = d.properties["status_cobranza_otf_setup"];
      return !!value && !NO_SETUP_RE.test(value);
    });
    const setupPaid = setupBase.filter((d) => PAID_RE.test(d.properties["status_cobranza_otf_setup"] ?? ""));
    const setupPending = setupBase.filter((d) => !PAID_RE.test(d.properties["status_cobranza_otf_setup"] ?? ""));
    const mrrBase = won.filter((d) => !!d.properties["status_cobranzofacturacion"]);
    const mrrPaid = mrrBase.filter((d) => PAID_RE.test(d.properties["status_cobranzofacturacion"] ?? ""));
    const mrrPending = mrrBase.filter((d) => !PAID_RE.test(d.properties["status_cobranzofacturacion"] ?? ""));

    const amountOf = (list: RawDeal[]) =>
      list.reduce((sum, d) => sum + Number(d.properties["amount"] ?? 0), 0);

    // Carrera etapa 6 → inicio de servicio.
    const signed = won.filter((d) => d.properties["dealstage"] === SIGNED_STAGE);
    const kickoff = won.filter((d) => !!d.properties["fecha_kickoff"]);
    const noKickoff = won.filter((d) => !d.properties["fecha_kickoff"] && !live.includes(d));

    const projectGroups = new Map<string, RawDeal[]>();
    for (const deal of won) {
      const rawProject = deal.properties["status_proyecto"]?.trim() ?? "";
      const label =
        (rawProject && projectLabels.get(rawProject)) || rawProject || "Sin status de proyecto";
      if (!projectGroups.has(label)) projectGroups.set(label, []);
      projectGroups.get(label)!.push(deal);
    }

    const base = `deliv-${id}-${period}`;
    push(`${base}-won`, `${name} · ganados ${period}`, "Deals ganados del periodo", won);
    push(`${base}-dev`, `${name} · en desarrollo ${period}`, "Ganados en etapa 6.2 (proyecto en desarrollo)", dev);
    push(`${base}-live`, `${name} · en producción ${period}`, "Ganados con inicio de servicio registrado", live);
    push(
      `${base}-stuck`,
      `${name} · estancados post-firma ${period}`,
      `Más de ${STUCK_DAYS} días en la etapa actual del portal cliente`,
      stuck,
    );
    push(
      `${base}-setup`,
      `${name} · setup por cobrar ${period}`,
      "Ganados con setup/OTF aún sin pago recibido",
      setupBase.filter((d) => !PAID_RE.test(d.properties["status_cobranza_otf_setup"] ?? "")),
    );
    push(
      `${base}-setup-paid`,
      `${name} · setup pagado ${period}`,
      "Ganados con pago de setup/OTF recibido",
      setupPaid,
    );
    push(
      `${base}-mrr`,
      `${name} · primer MRR por cobrar ${period}`,
      "Ganados con primer MRR aún sin pago recibido",
      mrrPending,
    );
    push(
      `${base}-mrr-paid`,
      `${name} · primer MRR pagado ${period}`,
      "Ganados con pago del primer MRR recibido",
      mrrPaid,
    );
    push(
      `${base}-signed`,
      `${name} · aún en etapa 6 ${period}`,
      "Ganados con propuesta firmada que todavía no pasan a proyecto en desarrollo",
      signed,
    );
    push(
      `${base}-kickoff`,
      `${name} · con fecha de kick off ${period}`,
      "Ganados con Fecha Kickoff registrada en HubSpot",
      kickoff,
    );
    push(
      `${base}-nokickoff`,
      `${name} · sin fecha de kick off ${period}`,
      "Ganados en curso sin Fecha Kickoff registrada",
      noKickoff,
    );
    push(`${base}-warning`, `${name} · warning ${period}`, "Deals actualmente en etapa warning", warning);
    push(`${base}-pilot`, `${name} · piloto ${period}`, "Deals actualmente en etapa piloto", pilot);
    push(`${base}-onboarding`, `${name} · onboarding ${period}`, "Deals actualmente en onboarding", onboarding);
    push(
      `${base}-lost-development`,
      `${name} · perdidos en desarrollo ${period}`,
      "Deals actualmente en la etapa Perdido en desarrollo",
      lostDevelopment,
    );

    stats.push({
      period,
      wonCount: won.length,
      wonAmount: won.reduce((sum, d) => sum + Number(d.properties["amount"] ?? 0), 0),
      devCount: dev.length,
      devAmount: dev.reduce((sum, d) => sum + Number(d.properties["amount"] ?? 0), 0),
      liveCount: live.length,
      liveAmount: live.reduce((sum, d) => sum + Number(d.properties["amount"] ?? 0), 0),
      stuckCount: stuck.length,
      stuckAmount: stuck.reduce((sum, d) => sum + Number(d.properties["amount"] ?? 0), 0),
      avgProgress: progress.length ? progress.reduce((a, b) => a + b, 0) / progress.length : -1,
      progressBase: progress.length,
      portal: deliveryRows(
        `${base}-portal`,
        portalGroups,
        (label) => `${name} · portal cliente: ${label} (${period})`,
        push,
      ),
      contracts: deliveryRows(
        `${base}-contract`,
        contractGroups,
        (label) => `${name} · contrato: ${label} (${period})`,
        push,
      ),
      projects: deliveryRows(
        `${base}-project`,
        projectGroups,
        (label) => `${name} · status proyecto: ${label} (${period})`,
        push,
      ),
      setupPaid: setupPaid.length,
      setupBase: setupBase.length,
      mrrPaid: mrrPaid.length,
      mrrBase: mrrBase.length,
      setupPaidAmount: amountOf(setupPaid),
      setupPendingAmount: amountOf(setupPending),
      mrrPaidAmount: amountOf(mrrPaid),
      mrrPendingAmount: amountOf(mrrPending),
      signedCount: signed.length,
      signedAmount: amountOf(signed),
      kickoffCount: kickoff.length,
      kickoffAmount: amountOf(kickoff),
      noKickoffCount: noKickoff.length,
      warningCount: warning.length,
      warningAmount: amountOf(warning),
      pilotCount: pilot.length,
      pilotAmount: amountOf(pilot),
      onboardingCount: onboarding.length,
      onboardingAmount: amountOf(onboarding),
      lostDevelopmentCount: lostDevelopment.length,
      lostDevelopmentAmount: amountOf(lostDevelopment),
      wonModal: `${base}-won`,
      devModal: `${base}-dev`,
      liveModal: `${base}-live`,
      stuckModal: `${base}-stuck`,
      setupModal: `${base}-setup`,
      mrrModal: `${base}-mrr`,
      signedModal: `${base}-signed`,
      kickoffModal: `${base}-kickoff`,
      noKickoffModal: `${base}-nokickoff`,
      warningModal: `${base}-warning`,
      pilotModal: `${base}-pilot`,
      onboardingModal: `${base}-onboarding`,
      lostDevelopmentModal: `${base}-lost-development`,
      setupPaidModal: `${base}-setup-paid`,
      mrrPaidModal: `${base}-mrr-paid`,
    });
  }
  return { id, name, periods: stats };
}


export async function buildPulseReport(previous?: PulseReport, role?: RoleFilter): Promise<PulseReport> {
  const [fetchedDeals, quotas, ownersRes, contractLabels, projectLabels] = await Promise.all([
    getCommercialDeals([...new Set([...[...MANAGED_STAGES, ...JOURNEY_STAGES].map((stage) => stage.id), "171385869"])]),
    fetchQuotasCached(),
    fetchOwners(),
    getPropertyOptionLabels("status_contrato"),
    getPropertyOptionLabels("status_proyecto"),
  ]);
  CONTRACT_LABELS = contractLabels;

  const ownerNames = new Map<string, string>();
  const ownerEmails = new Map<string, string>();
  /** Rol derivado del equipo de HubSpot: equipo AEs => AE, equipo KAMs => KAM. */
  const ownerRoles = new Map<string, "AE" | "KAM">();
  for (const owner of ownersRes) {
    ownerNames.set(
      owner.id,
      NICKNAMES[owner.id] ??
        ([owner.firstName, owner.lastName].filter(Boolean).join(" ").trim() || `Owner ${owner.id}`),
    );
    if (owner.email) ownerEmails.set(owner.id, owner.email.toLowerCase());
    const teams = owner.teams ?? [];
    const primary = teams.find((t) => t.primary) ?? teams[0];
    const norm = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");
    const roleOf = (name?: string): "AE" | "KAM" | null => {
      if (!name) return null;
      const n = norm(name);
      if (n.startsWith("ae")) return "AE";
      if (n.startsWith("kam")) return "KAM";
      return null;
    };
    const role =
      roleOf(primary?.name) ??
      roleOf(teams.map((t) => t.name).find((name) => roleOf(name) !== null));
    if (role) ownerRoles.set(owner.id, role);
  }

  // Filtro por rol comercial (AE o KAM): recorta dueños y deals. El MRR en
  // servicio se mantiene global a propósito: es una foto de toda la cartera.
  const scopeOwnerIds = role ? roleOwnerIds(role) : null;
  const deals = scopeOwnerIds
    ? fetchedDeals.filter((deal) => scopeOwnerIds.has(deal.properties["hubspot_owner_id"] ?? ""))
    : fetchedDeals;

  const now = Date.now();
  const currentPeriod = periodOf(new Date(now).toISOString());
  const { end: quarterEnd } = quarterBounds(currentPeriod);
  const periods = buildPeriods(currentPeriod);
  const prevPeriod = periods[periods.length - 2] ?? currentPeriod;

  // Comerciales con cuota trimestral vigente.
  const currentQuotas = quotas[currentPeriod] ?? {};
  const ownerIds = [...new Set([
    ...Object.entries(currentQuotas)
      .filter(([, quota]) => quota > 0)
      .map(([id]) => id),
    ...Object.keys(NICKNAMES),
  ])]
    .filter((id) => !scopeOwnerIds || scopeOwnerIds.has(id))
    .sort((a, b) => (currentQuotas[b] ?? 0) - (currentQuotas[a] ?? 0));
  const ownerLabels: Record<string, string> = {};
  for (const id of ownerIds) ownerLabels[id] = ownerNames.get(id) ?? `Owner ${id}`;
  const ownerEmailLabels: Record<string, string> = {};
  for (const id of ownerIds) {
    const email = ownerEmails.get(id);
    if (email) ownerEmailLabels[id] = email;
  }

  // Reuse the exact DTO across drilldowns, periods and charts instead of allocating it repeatedly.
  const dtoCache = new Map<string, DealDTO>();
  const dto = (deal: RawDeal) => {
    const existing = dtoCache.get(deal.id);
    if (existing) return existing;
    const value = toDTO(deal, ownerNames, now, quarterEnd);
    dtoCache.set(deal.id, value);
    return value;
  };

  const allStageJourneys: StageJourney[] = fetchedDeals.map((deal) => {
    const entered: Record<string, string> = {};
    const days: Record<string, number> = {};
    for (const stage of JOURNEY_STAGES) {
      const enteredAt = deal.properties[`hs_v2_date_entered_${stage.id}`];
      if (enteredAt) entered[stage.key] = enteredAt;
      const cumulative = Number(deal.properties[`hs_v2_cumulative_time_in_${stage.id}`] ?? 0);
      if (Number.isFinite(cumulative) && cumulative > 0) days[stage.key] = cumulative / 86_400_000;
    }
    const lostAt = deal.properties["hs_v2_date_entered_171385869"];
    if (lostAt) entered["LOST"] = lostAt;
    return {
      deal: dto(deal),
      createdAt: deal.properties["createdate"] ?? "",
      entered,
      days,
    };
  });

  const stageJourneys = scopeOwnerIds ? allStageJourneys.filter(j => scopeOwnerIds.has(j.deal.ownerId)) : allStageJourneys;
  const globalTracked = fetchedDeals.filter(d => STAGE_KEY.has(d.properties['dealstage'] ?? ''));
  const executiveStrip = buildExecutiveStrip(allStageJourneys, {
    yes: globalTracked.filter(d => d.properties['on_track'] === 'true').map(dto),
    no: globalTracked.filter(d => d.properties['on_track'] === 'false').map(dto),
  }, now);

  const openDeals = deals.filter((d) => STAGE_KEY.has(d.properties["dealstage"] ?? ""));
  // Property history is read only when Adobo is opened; absence remains explicitly unknown.
  const closedDeals = deals.filter((d) => {
    const stage = d.properties["dealstage"] ?? "";
    return WON_STAGES.has(stage) || LOST_STAGES.has(stage);
  });

  // MRR activo global: foto independiente de filtros. Conservamos snapshots diarios
  // dentro del reporte persistido para que futuras salidas por churn queden visibles.
  const inServiceDeals = fetchedDeals.filter((deal) => deal.properties["dealstage"] === SERVICE_STAGE);
  // Deals firmados (etapa 6) o en desarrollo (etapa 7): MRR que esperamos incorporar.
  const inDevDeals = fetchedDeals.filter((deal) => {
    const stage = deal.properties["dealstage"] ?? "";
    return stage === SIGNED_STAGE || stage === DEV_STAGE;
  });
  // Excluimos deals cuya empresa asociada tiene tipo de cliente = churn.
  const churnedIds = await getChurnedDealIds([...inServiceDeals, ...inDevDeals].map((deal) => deal.id));
  const liveDeals = inServiceDeals.filter((deal) => !churnedIds.has(deal.id));
  const churnedInService = inServiceDeals.length - liveDeals.length;
  const inDevLiveDeals = inDevDeals.filter((deal) => !churnedIds.has(deal.id));
  const mrrOf = (deal: RawDeal) => Math.max(0, Number(deal.properties["amount"] ?? 0));
  const inDevValue = inDevLiveDeals.reduce((sum, deal) => sum + mrrOf(deal), 0);
  const activeMrrValue = liveDeals.reduce((sum, deal) => sum + mrrOf(deal), 0);
  const today = new Date(now).toISOString().slice(0, 10);
  let activeMrrHistory = [...(previous?.activeMrr?.history ?? [])];
  if (!activeMrrHistory.length) {
    const monthStarts = Array.from({ length: 11 }, (_, index) => {
      const date = new Date(now);
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() - (10 - index));
      return date;
    });
    activeMrrHistory = monthStarts.map((date) => {
      const cutoff = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
      const activeAtCutoff = liveDeals.filter((deal) => {
        const entered = Date.parse(deal.properties[`hs_v2_date_entered_${SERVICE_STAGE}`] ?? "");
        return Number.isFinite(entered) && entered < cutoff;
      });
      return {
        date: date.toISOString().slice(0, 10),
        value: activeAtCutoff.reduce((sum, deal) => sum + mrrOf(deal), 0),
        count: activeAtCutoff.length,
      };
    });
  }
  activeMrrHistory = [
    ...activeMrrHistory.filter((point) => point.date !== today),
    { date: today, value: activeMrrValue, count: liveDeals.length },
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-18);

  // Entradas reales a Inicio de servicio: permiten armar series por año/Q/mes/semana.
  const activeMrrEntries = liveDeals
    .map((deal) => {
      const raw = deal.properties[`hs_v2_date_entered_${SERVICE_STAGE}`] ?? "";
      const ts = Date.parse(raw);
      return {
        id: deal.id,
        name: deal.properties["dealname"] ?? "Sin nombre",
        owner: ownerNames.get(deal.properties["hubspot_owner_id"] ?? "") ?? "Sin propietario",
        date: Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : "",
        mrr: mrrOf(deal),
      };
    })
    .filter((entry) => entry.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const lastEntry = activeMrrEntries[activeMrrEntries.length - 1];

  const inQuarter = (deal: RawDeal, period: string) => {
    const close = deal.properties["closedate"];
    if (!close) return false;
    const ts = Date.parse(close);
    const { start, end } = quarterBounds(period);
    return ts >= start && ts < end;
  };

  // ---------- periodos históricos ----------
  const data: PulseReport["periods"]["data"] = {};
  for (const period of periods) {
    const bucket = { team: emptyStats(), owners: {} as Record<string, PeriodStats> };
    for (const id of ownerIds) bucket.owners[id] = emptyStats();
    data[period] = bucket;
  }
  for (const deal of closedDeals) {
    const p = deal.properties;
    const close = p["closedate"];
    if (!close) continue;
    const period = periodOf(close);
    const bucket = data[period];
    if (!bucket) continue;
    const won = WON_STAGES.has(p["dealstage"] ?? "");
    const amount = Number(p["amount"] ?? 0);
    const otfAmount = Number(p["otf"] ?? 0);
    const item = dto(deal);
    const targets: PeriodStats[] = [bucket.team];
    const ownerBucket = bucket.owners[p["hubspot_owner_id"] ?? ""];
    if (ownerBucket) targets.push(ownerBucket);
    for (const target of targets) {
      if (won) {
        target.won += 1;
        target.wonAmount += amount;
        if (Number.isFinite(otfAmount) && otfAmount > 0) target.wonOtf += otfAmount;
        target.wonDeals.push(item);
      } else {
        target.lost += 1;
        target.lostAmount += amount;
        target.lostDeals.push(item);
      }
    }
  }

  // ---------- pipeline abierto ----------
  const openByOwner = new Map<string, RawDeal[]>();
  for (const deal of openDeals) {
    const id = deal.properties["hubspot_owner_id"] ?? "";
    if (!openByOwner.has(id)) openByOwner.set(id, []);
    openByOwner.get(id)!.push(deal);
  }

  const weighted = (list: RawDeal[]) =>
    list.reduce(
      (sum, d) =>
        sum + Number(d.properties["amount"] ?? 0) * Number(d.properties["hs_deal_stage_probability"] ?? 0),
      0,
    );
  const amountOf = (list: RawDeal[]) =>
    list.reduce((sum, d) => sum + Number(d.properties["amount"] ?? 0), 0);
  const openInQuarter = (list: RawDeal[]) => list.filter((d) => inQuarter(d, currentPeriod));

  const teamOpen = openDeals;
  const teamQOpen = openInQuarter(teamOpen);
  const teamQuota = ownerIds.reduce((sum, id) => sum + (currentQuotas[id] ?? 0), 0);
  const teamStats = data[currentPeriod]!.team;
  const teamQuotaStats = quotaStats(teamStats.wonDeals);

  // ---------- drilldowns ----------
  const drilldowns: Record<string, Drilldown> = {};
  const addDrilldown = (key: string, title: string, subtitle: string, list: RawDeal[]) => {
    drilldowns[key] = { title, subtitle, deals: list.map(dto) };
  };
  const highProb = (list: RawDeal[]) =>
    list.filter((d) => Number(d.properties["hs_deal_stage_probability"] ?? 0) >= 0.7);
  const lowProbQ = (list: RawDeal[]) =>
    openInQuarter(list).filter(
      (d) => Number(d.properties["hs_deal_stage_probability"] ?? 0) < 0.35,
    );
  const noCloseDate = (list: RawDeal[]) => list.filter((d) => !d.properties["closedate"]);
  const overdue = (list: RawDeal[]) =>
    list.filter((d) => {
      const close = d.properties["closedate"];
      return !!close && Date.parse(close) < now;
    });
  const closingIn = (list: RawDeal[], days: number) =>
    list.filter((d) => {
      const close = d.properties["closedate"];
      if (!close) return false;
      const ts = Date.parse(close);
      return ts >= now && ts - now <= days * 86_400_000;
    });
  const nowDate = new Date(now);
  const monthStart = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1);
  const monthEnd = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() + 1, 1) - 1;
  const monthLabel = new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(nowDate);
  const closingThisMonth = (list: RawDeal[]) =>
    list.filter((d) => {
      const close = d.properties["closedate"];
      if (!close) return false;
      const ts = Date.parse(close);
      return ts >= monthStart && ts <= monthEnd;
    });

  /** Estancados: días en la etapa actual sobre el umbral permitido. */
  const STAGE_E2 = "171385864";
  const STAGE_E5 = "171385867";
  const STAGE_E51 = "1245768029";
  const daysInStage = (d: RawDeal, stageId: string) => {
    const entered = d.properties[`hs_v2_date_entered_${stageId}`];
    if (!entered) return null;
    const ts = Date.parse(entered);
    if (Number.isNaN(ts)) return null;
    return Math.floor((now - ts) / 86_400_000);
  };
  const stalledInStage = (list: RawDeal[], stageId: string, limitDays: number) =>
    list
      .filter((d) => d.properties["dealstage"] === stageId)
      .filter((d) => (daysInStage(d, stageId) ?? 0) > limitDays)
      .sort((a, b) => (daysInStage(b, stageId) ?? 0) - (daysInStage(a, stageId) ?? 0));
  /** E5.1 con fecha fin de PoC/Piloto ya vencida. */
  const pocOverdue = (list: RawDeal[]) =>
    list
      .filter((d) => d.properties["dealstage"] === STAGE_E51)
      .filter((d) => {
        const end = d.properties["fin_de_la_piloto"];
        return !!end && Date.parse(end) < todayStartOfDay();
      })
      .sort(
        (a, b) =>
          Date.parse(a.properties["fin_de_la_piloto"]!) -
          Date.parse(b.properties["fin_de_la_piloto"]!),
      );
  function todayStartOfDay() {
    return Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate());
  }

  const todayStart = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate());
  const todayEnd = todayStart + 86_399_999;
  const taskLoad = await fetchPendingTasks(
    openDeals.map((deal) => deal.id),
    todayEnd,
    todayStart,
  );
  const tasksOf = (deal: RawDeal) => taskLoad.get(deal.id) ?? { overdue: 0, today: 0 };
  const noActivityAll = (list: RawDeal[]) =>
    list.filter((d) => !d.properties["notes_next_activity_date"]);
  const withOverdueTask = (list: RawDeal[]) => list.filter((d) => tasksOf(d).overdue > 0);
  const withTodayTask = (list: RawDeal[]) => list.filter((d) => tasksOf(d).today > 0);

  const noNextActivity = (list: RawDeal[]) =>
    list.filter(
      (d) => LATE_STAGES.has(d.properties["dealstage"] ?? "") && !d.properties["notes_next_activity_date"],
    );
  const stale = (list: RawDeal[]) =>
    list.filter((d) => {
      const modified = d.properties["hs_lastmodifieddate"];
      return !modified || now - Date.parse(modified) > 14 * 86_400_000;
    });

  addDrilldown("team-open", "Pipeline equipo", "Deals abiertos E1-E5.1", teamOpen);
  addDrilldown("team-q-open", "Pipeline Q equipo", "Deals abiertos que cierran este Q", teamQOpen);
  drilldowns["team-won-q"] = {
    title: `Equipo · Ganados ${currentPeriod}`,
    subtitle: "Deals ganados del trimestre",
    deals: teamStats.wonDeals,
  };
  addDrilldown("team-high-probability", "Alta probabilidad", "70%+ de cierre", highProb(teamOpen));
  addDrilldown("team-low-probability-q", "Q bajo % cierre", "Cierra este Q y <35%", lowProbQ(teamOpen));
  addDrilldown("team-no-close-date", "Sin close date", "Deals abiertos sin fecha", noCloseDate(teamOpen));
  for (const stage of MANAGED_STAGES) {
    addDrilldown(
      `team-stage-${stage.id}`,
      `Equipo · ${stage.key}`,
      "Deals abiertos en la etapa",
      teamOpen.filter((d) => d.properties["dealstage"] === stage.id),
    );
  }

  const ownerRows: OwnerRow[] = [];
  const quotaRows: QuotaRow[] = [];
  const quality: PulseReport["quality"] = [];

  // ---------- tendencia mensual: últimos 6 meses calendario (con arrastre) ----------
  const monthEnds: { label: string; start: number; end: number }[] = [];
  {
    const cursor = new Date(now);
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth();
    for (let i = 5; i >= 0; i--) {
      const start = Date.UTC(y, m - i, 1);
      const end = i === 0 ? now : Date.UTC(y, m - i + 1, 1) - 1;
      const label = new Date(start)
        .toLocaleDateString("es-CL", { month: "short", timeZone: "UTC" })
        .replace(".", "");
      monthEnds.push({ label, start, end });
    }
  }
  /** Deals que aproximadamente estaban abiertos al cierre del mes `end`. */
  const openAt = (list: RawDeal[], end: number) =>
    list.filter((d) => {
      const created = Date.parse(d.properties["createdate"] ?? "");
      if (!Number.isFinite(created) || created > end) return false;
      const stageId = d.properties["dealstage"] ?? "";
      if (WON_STAGES.has(stageId) || LOST_STAGES.has(stageId)) {
        const close = Date.parse(d.properties["closedate"] ?? "");
        return Number.isFinite(close) && close > end;
      }
      return MANAGED_STAGES.some((stage) => stage.id === stageId);
    });
  const monthlyFor = (list: RawDeal[]) => ({
    open: monthEnds.map((m) => amountOf(openAt(list, m.end))),
    openDeals: monthEnds.map((m) => openAt(list, m.end).length),
    weighted: monthEnds.map((m) => weighted(openAt(list, m.end))),
    prob: monthEnds.map((m) => {
      const open = openAt(list, m.end);
      if (!open.length) return null;
      return (
        (open.reduce((s, d) => s + Number(d.properties["hs_deal_stage_probability"] ?? 0), 0) /
          open.length) *
        100
      );
    }),
    adobo: monthEnds.map((m) => {
      const vals = openAt(list, m.end)
        .map((d) => Number(d.properties["adobo_closing_score"] ?? NaN))
        .filter((v) => Number.isFinite(v));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }),
  });
  const teamMonthly = monthlyFor(deals);
  const monthlyByOwner = new Map<string, ReturnType<typeof monthlyFor>>();
  for (const id of ownerIds) {
    monthlyByOwner.set(
      id,
      monthlyFor(deals.filter((d) => (d.properties["hubspot_owner_id"] ?? "") === id)),
    );
  }
  const wonMonthly = monthEnds.map((m) =>
    closedDeals.filter((d) => {
      if (!WON_STAGES.has(d.properties["dealstage"] ?? "")) return false;
      const ts = Date.parse(d.properties["closedate"] ?? "");
      return Number.isFinite(ts) && ts >= m.start && ts <= m.end;
    }),
  );
  const closedMonthlyFor = (list: RawDeal[], won: boolean) =>
    monthEnds.map((m) =>
      list.filter((d) => {
        const stageId = d.properties["dealstage"] ?? "";
        if (won ? !WON_STAGES.has(stageId) : !LOST_STAGES.has(stageId)) return false;
        const ts = Date.parse(d.properties["closedate"] ?? "");
        return Number.isFinite(ts) && ts >= m.start && ts <= m.end;
      }),
    );
  const lostMonthly = closedMonthlyFor(closedDeals, false);
  const ownerWonMonthly = new Map<string, RawDeal[][]>();
  const ownerLostMonthly = new Map<string, RawDeal[][]>();
  for (const id of ownerIds) {
    const ownerClosed = closedDeals.filter((d) => (d.properties["hubspot_owner_id"] ?? "") === id);
    ownerWonMonthly.set(id, closedMonthlyFor(ownerClosed, true));
    ownerLostMonthly.set(id, closedMonthlyFor(ownerClosed, false));
  }
  const wrSeries = (wonLists: RawDeal[][], lostLists: RawDeal[][]) =>
    wonLists.map((list, index) => {
      const lost = lostLists[index]?.length ?? 0;
      return list.length + lost ? (list.length / (list.length + lost)) * 100 : 0;
    });
  const ticketSeries = (wonLists: RawDeal[][]) =>
    wonLists.map((list) => {
      const positive = list.filter((d) => Number(d.properties["amount"] ?? 0) > 0);
      return positive.length ? amountOf(positive) / positive.length : 0;
    });
  const monthly: MonthlyPulse = {
    months: monthEnds.map((m) => m.label),
    open: {
      team: teamMonthly.open,
      byOwner: Object.fromEntries([...monthlyByOwner].map(([id, s]) => [id, s.open])),
    },
    openDeals: {
      team: teamMonthly.openDeals,
      byOwner: Object.fromEntries([...monthlyByOwner].map(([id, s]) => [id, s.openDeals])),
    },
    weighted: {
      team: teamMonthly.weighted,
      byOwner: Object.fromEntries([...monthlyByOwner].map(([id, s]) => [id, s.weighted])),
    },
    won: wonMonthly.map((list) => amountOf(list)),
    wonByOwner: Object.fromEntries([...ownerWonMonthly].map(([id, lists]) => [id, lists.map(amountOf)])),
    wonDeals: wonMonthly.map((list) => list.length),
    wonDealsByOwner: Object.fromEntries([...ownerWonMonthly].map(([id, lists]) => [id, lists.map((list) => list.length)])),
    lost: lostMonthly.map((list) => amountOf(list)),
    lostByOwner: Object.fromEntries([...ownerLostMonthly].map(([id, lists]) => [id, lists.map(amountOf)])),
    lostDeals: lostMonthly.map((list) => list.length),
    lostDealsByOwner: Object.fromEntries([...ownerLostMonthly].map(([id, lists]) => [id, lists.map((list) => list.length)])),
    winRate: {
      team: wrSeries(wonMonthly, lostMonthly),
      byOwner: Object.fromEntries(
        ownerIds.map((id) => [id, wrSeries(ownerWonMonthly.get(id) ?? [], ownerLostMonthly.get(id) ?? [])]),
      ),
    },
    avgWonTicket: {
      team: ticketSeries(wonMonthly),
      byOwner: Object.fromEntries(ownerIds.map((id) => [id, ticketSeries(ownerWonMonthly.get(id) ?? [])])),
    },
    adoboAvg: teamMonthly.adobo,
  };

  const qualityCards = (
    prefix: string,
    list: RawDeal[],
    trend?: { prob: (number | null)[]; adobo: (number | null)[] },
  ): QualityCard[] => {
    const withScore = list.filter((d) => d.properties["hs_deal_score"]);
    const avgProb = list.length
      ? list.reduce((s, d) => s + Number(d.properties["hs_deal_stage_probability"] ?? 0), 0) / list.length
      : 0;
    const avgScore = withScore.length
      ? withScore.reduce((s, d) => s + Number(d.properties["hs_deal_score"] ?? 0), 0) / withScore.length
      : 0;
    const withAdobo = list.filter((d) => d.properties["adobo_closing_score"]);
    const avgAdobo = withAdobo.length
      ? withAdobo.reduce((s, d) => s + Number(d.properties["adobo_closing_score"] ?? 0), 0) /
        withAdobo.length
      : -1;
    const qOpen = openInQuarter(list).length;
    const lowQ = lowProbQ(list).length;
    const lowShare = qOpen ? (lowQ / qOpen) * 100 : 0;
    const noDate = noCloseDate(list).length;
    const noDateShare = list.length ? (noDate / list.length) * 100 : 0;
    const band = (value: number, ok: number, warn: number): Tone =>
      value >= ok ? "ok" : value >= warn ? "warn" : "bad";
    const bandInverse = (value: number, okBelow: number, warnBelow: number): Tone =>
      value <= okBelow ? "ok" : value <= warnBelow ? "warn" : "bad";
    const contactVals = list
      .map((d) => normRate(d.properties["adobo_tasa_contactabilidad_prospecto"]))
      .filter((v): v is number => v !== null);
    const avgContact = contactVals.length
      ? contactVals.reduce((a, b) => a + b, 0) / contactVals.length
      : -1;
    return [
      {
        label: "% cierre prom.",
        value: `${Math.round(avgProb * 100)}%`,
        note: "probabilidad de etapa del pipeline abierto",
        modal: `${prefix}-open`,
        tone: list.length ? band(avgProb * 100, 45, 30) : "neutral",
        ...(trend?.prob ? { trend: trend.prob } : {}),
      },
      {
        label: "Deal score prom.",
        value: `${Math.round(avgScore)}%`,
        note: `${withScore.length} deals con score`,
        modal: `${prefix}-open`,
        tone: "neutral",
      },
      {
        label: "Adobo scoring prom.",
        value: avgAdobo < 0 ? "s/n" : String(Math.round(avgAdobo)),
        note: `${withAdobo.length} deals con Adobo · 0-100`,
        modal: `${prefix}-open`,
        tone: avgAdobo < 0 ? "neutral" : band(avgAdobo, 65, 45),
        tooltip:
          "Score 0-100 que Adobo calcula analizando las reuniones del deal: combina fit, dolor, urgencia, timing, presencia de decisor, presupuesto mencionado y calidad de la última reunión. La línea muestra su tendencia de 6 meses.",
        ...(trend?.adobo ? { trend: trend.adobo } : {}),
      },
      {
        label: "Ratio legado prom.",
        value: avgContact < 0 ? "sin dato" : `${Number(avgContact.toFixed(2))}%`,
        note:
          avgContact < 0
            ? "sin dato en HubSpot"
            : `${contactVals.length} deals con ratio respuestas / intentos`,
        modal: `${prefix}-open`,
        tone: "neutral",
        tooltip:
          "Ratio histórico respuestas / intentos × 100, puede superar 100%. No es la tasa por episodios ni permite inferir ghosting sin frescura y cobertura verificadas.",
      },
      {
        label: "Alta probabilidad",
        value: String(highProb(list).length),
        note: "70%+ cierre",
        modal: `${prefix}-high-probability`,
        tone: "neutral",
      },
      {
        label: "Q bajo % cierre",
        value: String(lowQ),
        note: `cierra Q y <35% · ${Math.round(lowShare)}% de los deals del Q`,
        modal: `${prefix}-low-probability-q`,
        tone: qOpen ? bandInverse(lowShare, 15, 30) : "neutral",
      },
      {
        label: "Sin close date",
        value: String(noDate),
        note: `${Math.round(noDateShare)}% del pipeline abierto`,
        modal: `${prefix}-no-close-date`,
        tone: noDate === 0 ? "ok" : bandInverse(noDateShare, 5, 10),
      },
      {
        label: "Deals Q abiertos",
        value: String(qOpen),
        note: "con fecha dentro del Q",
        modal: `${prefix}-q-open`,
        tone: "neutral",
      },
    ];
  };


  quality.push({
    id: "team",
    label: "Equipo",
    cards: qualityCards("team", teamOpen, { prob: teamMonthly.prob, adobo: teamMonthly.adobo }),
  });

  const trendPeriods = periods.slice(-6);

  for (const id of ownerIds) {
    const list = openByOwner.get(id) ?? [];
    const prefix = `owner-${id}`;
    addDrilldown(`${prefix}-open`, `${ownerLabels[id]} · Pipeline`, "Deals abiertos E1-E5.1", list);
    addDrilldown(`${prefix}-q-open`, `${ownerLabels[id]} · Pipeline Q`, "Abiertos que cierran este Q", openInQuarter(list));
    drilldowns[`${prefix}-won-q`] = {
      title: `${ownerLabels[id]} · Ganados ${currentPeriod}`,
      subtitle: "Deals ganados del trimestre",
      deals: data[currentPeriod]!.owners[id]?.wonDeals ?? [],
    };
    addDrilldown(`${prefix}-high-probability`, `${ownerLabels[id]} · Alta probabilidad`, "70%+ cierre", highProb(list));
    addDrilldown(`${prefix}-low-probability-q`, `${ownerLabels[id]} · Q bajo % cierre`, "Cierra Q y <35%", lowProbQ(list));
    addDrilldown(`${prefix}-no-close-date`, `${ownerLabels[id]} · Sin close date`, "Deals sin fecha", noCloseDate(list));
    addDrilldown(`${prefix}-closing-7d`, `${ownerLabels[id]} · Cierran en 7 días`, "Próximos 7 días", closingIn(list, 7));
    addDrilldown(`${prefix}-closing-month`, `${ownerLabels[id]} · Cierran este mes`, "Mes calendario en curso", closingThisMonth(list));
    addDrilldown(`${prefix}-overdue`, `${ownerLabels[id]} · Close vencido`, "Fecha de cierre pasada", overdue(list));
    addDrilldown(`${prefix}-no-next`, `${ownerLabels[id]} · Sin próxima actividad`, "E5/E5.1 sin próxima actividad", noNextActivity(list));
    addDrilldown(`${prefix}-stale`, `${ownerLabels[id]} · 14+ días sin cambios`, "Sin actualización reciente", stale(list));
    for (const stage of MANAGED_STAGES) {
      addDrilldown(
        `${prefix}-stage-${stage.id}`,
        `${ownerLabels[id]} · ${stage.key}`,
        "Deals abiertos en la etapa",
        list.filter((d) => d.properties["dealstage"] === stage.id),
      );
    }

    const ownerMonthly = monthlyByOwner.get(id);
    quality.push({
      id,
      label: ownerLabels[id]!,
      cards: qualityCards(
        prefix,
        list,
        ownerMonthly ? { prob: ownerMonthly.prob, adobo: ownerMonthly.adobo } : undefined,
      ),
    });

    const qtd = data[currentPeriod]!.owners[id] ?? emptyStats();
    const prev = data[prevPeriod]!.owners[id] ?? emptyStats();
    const histWon = periods.reduce((sum, p) => sum + (data[p]!.owners[id]?.won ?? 0), 0);
    const histLost = periods.reduce((sum, p) => sum + (data[p]!.owners[id]?.lost ?? 0), 0);
    const withScore = list.filter((d) => d.properties["hs_deal_score"]);

    // WR por segmento para este comercial (QTD).
    const ownerClosed = closedDeals.filter(
      (d) => (d.properties["hubspot_owner_id"] ?? "") === id,
    );
    const isAE = (ownerRoles.get(id) ?? (AE_OWNERS.has(id) ? "AE" : "KAM")) === "AE";
    const segBuckets: Record<string, [number, number]> = {};
    for (const deal of ownerClosed) {
      const p = deal.properties;
      const close = p["closedate"];
      if (!close) continue;
      const period = periodOf(close);
      if (period !== currentPeriod) continue;
      const seg = segmentOf(p);
      if (!segBuckets[seg]) segBuckets[seg] = [0, 0];
      const idx = WON_STAGES.has(p["dealstage"] ?? "") ? 0 : 1;
      segBuckets[seg][idx] += 1;
    }
    const wrBySegment: WrBySegment = isAE
      ? {
          inbound: { won: segBuckets["Inbound"]?.[0] ?? 0, lost: segBuckets["Inbound"]?.[1] ?? 0 },
          outbound: { won: segBuckets["Outbound"]?.[0] ?? 0, lost: segBuckets["Outbound"]?.[1] ?? 0 },
        }
      : {
          upsell: { won: segBuckets["Upsell"]?.[0] ?? 0, lost: segBuckets["Upsell"]?.[1] ?? 0 },
          crossSell: { won: segBuckets["Cross sell"]?.[0] ?? 0, lost: segBuckets["Cross sell"]?.[1] ?? 0 },
        };

    ownerRows.push({
      id,
      name: ownerLabels[id]!,
      openAmount: amountOf(list),
      openCount: list.length,
      openOtf: otfOf(list),
      weightedQ: weighted(openInQuarter(list)),
      avgProbability: list.length
        ? list.reduce((s, d) => s + Number(d.properties["hs_deal_stage_probability"] ?? 0), 0) / list.length
        : 0,
      avgScore: withScore.length
        ? withScore.reduce((s, d) => s + Number(d.properties["hs_deal_score"] ?? 0), 0) / withScore.length
        : 0,
      stages: MANAGED_STAGES.map((stage) => ({
        key: stage.key,
        stageId: stage.id,
        count: list.filter((d) => d.properties["dealstage"] === stage.id).length,
      })),
      highProbability: highProb(list).length,
      lowProbabilityQ: lowProbQ(list).length,
      closing7d: closingIn(list, 7).length,
      closingMonth: closingThisMonth(list).length,
      overdue: overdue(list).length,
      noCloseDate: noCloseDate(list).length,
      noNextActivity: noNextActivity(list).length,
      stale: stale(list).length,
      wrQtd: { won: qtd.won, lost: qtd.lost },
      wrQoQ: (wrRate(qtd) - wrRate(prev)) * 100,
      wrHist: { won: histWon, lost: histLost },
      lostAmount: qtd.lostAmount,
      avgTicketWon: (() => {
        const n = qtd.wonDeals.filter((d) => (d.amountValue || 0) > 0).length;
        return n ? qtd.wonAmount / n : 0;
      })(),
    });

    const quota = currentQuotas[id] ?? 0;
    // SALES-85/86: el cumplimiento usa solo ganados elegibles (sin renovación, contracción ni billetera pura).
    const quotaQtd = quotaStats(qtd.wonDeals);
    const openQ = openInQuarter(list);
    const weightedOpenQ = weighted(openQ);
    const forecast = quotaQtd.wonAmount + weightedOpenQ;
    const attainment = quota ? (quotaQtd.wonAmount / quota) * 100 : 0;
    const forecastPct = quota ? (forecast / quota) * 100 : 0;
    const assessed = assessRisk(quota, quotaQtd.wonAmount, weightedOpenQ);
    quotaRows.push({
      id,
      role: ownerRoles.get(id) ?? (AE_OWNERS.has(id) ? "AE" : "KAM"),
      name: ownerLabels[id]!,
      status: assessed.risk === "neutral" ? "warn" : assessed.risk,
      statusLabel:
        assessed.risk === "ok"
          ? "En camino"
          : assessed.risk === "warn"
            ? "Revisar"
            : assessed.risk === "bad"
              ? "En riesgo"
              : "Sin cuota",
      wonQAmount: quotaQtd.wonAmount,
      wonQCount: quotaQtd.won,
      otfWonQ: quotaQtd.wonOtf,
      otfBonus: quotaQtd.wonOtf / 12,
      attainmentBonus: quota ? ((quotaQtd.wonAmount + quotaQtd.wonOtf / 12) / quota) * 100 : 0,
      openOtf: otfOf(openQ),
      wonTrend: trendPeriods.map((p) => ({
        period: shortPeriod(p),
        amount: quotaStats(data[p]!.owners[id]?.wonDeals ?? []).wonAmount,
        deals: quotaStats(data[p]!.owners[id]?.wonDeals ?? []).won,
      })),
      wrQtd: { won: qtd.won, lost: qtd.lost },
      wrQoQ: (wrRate(qtd) - wrRate(prev)) * 100,
      wrTrend: trendPeriods.map((p) => ({
        period: shortPeriod(p),
        rate: wrRate(data[p]!.owners[id] ?? emptyStats()) * 100,
      })),
      quota,
      attainment,
      gap: quotaQtd.wonAmount - quota,
      forecast,
      forecastPct,
      openQCount: openQ.length,
      remaining: assessed.remaining,
      weightedOpenQ,
      coverage: assessed.coverage,
      risk: assessed.risk,
      riskReason: assessed.riskReason,
      wrBySegment,
    });
  }

  quotaRows.sort((a, b) => {
    const rank = (r: Tone) => (r === "bad" ? 0 : r === "warn" ? 1 : r === "neutral" ? 2 : 3);
    return rank(a.risk) - rank(b.risk) || a.coverage - b.coverage || b.quota - a.quota;
  });

  const teamAssessed = assessRisk(teamQuota, teamQuotaStats.wonAmount, weighted(teamQOpen));
  const riskSummary: RiskSummary = {
    quota: teamQuota,
    won: teamQuotaStats.wonAmount,
    remaining: teamAssessed.remaining,
    weightedOpen: weighted(teamQOpen),
    openQAmount: amountOf(teamQOpen),
    coverage: teamAssessed.coverage,
    risk: teamAssessed.risk,
    riskReason: teamAssessed.riskReason,
    counts: {
      ok: quotaRows.filter((r) => r.risk === "ok").length,
      warn: quotaRows.filter((r) => r.risk === "warn").length,
      bad: quotaRows.filter((r) => r.risk === "bad").length,
      neutral: quotaRows.filter((r) => r.risk === "neutral").length,
    },
  };


  // ---------- seguimiento deals (propiedades HubSpot: on_track + pinzas) ----------
  const isPinzas = (d: RawDeal) => d.properties["seguimiento_con_pinzas"] === "true";

  const buildTracking = (id: string, label: string, list: RawDeal[]): TrackingScope => {
    const prefix = id === "team" ? "team" : `owner-${id}`;
    const onTrackYes = list
      .filter((deal) => deal.properties["on_track"] === "true")
      .sort((a, b) => Number(b.properties["amount"] ?? 0) - Number(a.properties["amount"] ?? 0));
    const onTrackNo = list
      .filter((deal) => deal.properties["on_track"] === "false")
      .sort((a, b) => Number(b.properties["amount"] ?? 0) - Number(a.properties["amount"] ?? 0));
    const flagged = list
      .filter(isPinzas)
      .sort((a, b) => Number(b.properties["amount"] ?? 0) - Number(a.properties["amount"] ?? 0));
    const onTrackYesKey = `${prefix}-on-track-yes`;
    const onTrackNoKey = `${prefix}-on-track-no`;
    const allKey = `${prefix}-track-all`;
    addDrilldown(
      onTrackYesKey,
      `${label} · On Track: Sí`,
      "Deals abiertos con On Track marcado como Sí en HubSpot",
      onTrackYes,
    );
    addDrilldown(
      onTrackNoKey,
      `${label} · On Track: No`,
      "Deals abiertos con On Track marcado como No en HubSpot",
      onTrackNo,
    );
    addDrilldown(
      allKey,
      `${label} · Seguimiento con pinzas`,
      "Deals marcados en HubSpot",
      flagged,
    );
    const withAdobo = flagged.filter((d) => d.properties["adobo_closing_score"]);
    return {
      id,
      label,
      openCount: list.length,
      openAmount: amountOf(list),
      onTrackYesCount: onTrackYes.length,
      onTrackYesAmount: amountOf(onTrackYes),
      onTrackYesModal: onTrackYesKey,
      onTrackNoCount: onTrackNo.length,
      onTrackNoAmount: amountOf(onTrackNo),
      onTrackNoModal: onTrackNoKey,
      atRiskCount: flagged.length,
      atRiskAmount: amountOf(flagged),
      share: list.length ? (flagged.length / list.length) * 100 : 0,
      avgProbability: flagged.length
        ? flagged.reduce((s, d) => s + Number(d.properties["hs_deal_stage_probability"] ?? 0), 0) /
          flagged.length
        : 0,
      avgAdobo: withAdobo.length
        ? withAdobo.reduce((s, d) => s + Number(d.properties["adobo_closing_score"] ?? 0), 0) /
          withAdobo.length
        : 0,
      deals: flagged.map((deal) => dto(deal)),
      allModal: allKey,
    };
  };

  const tracking: TrackingScope[] = [
    buildTracking("team", "Equipo", teamOpen),
    ...ownerIds.map((id) => buildTracking(id, ownerLabels[id]!, openByOwner.get(id) ?? [])),
  ];

  // ---------- higiene de fecha de cierre (mes en curso) ----------
  const buildCloseHygiene = (id: string, label: string, list: RawDeal[]): CloseHygieneScope => {
    const prefix = id === "team" ? "team" : `owner-${id}`;
    const month = closingThisMonth(list).sort(
      (a, b) => Date.parse(a.properties["closedate"]!) - Date.parse(b.properties["closedate"]!),
    );
    const late = overdue(list);
    const noDate = noCloseDate(list);
    const monthModal = `${prefix}-close-month`;
    const overdueModal = `${prefix}-close-overdue`;
    const noDateModal = `${prefix}-close-no-date`;
    const stale2 = stalledInStage(list, STAGE_E2, 40);
    const stale5 = stalledInStage(list, STAGE_E5, 60);
    const poc = pocOverdue(list);
    const stale2Modal = `${prefix}-stale-e2`;
    const stale5Modal = `${prefix}-stale-e5`;
    const pocModal = `${prefix}-poc-overdue`;
    // Señales automáticas de pérdida: solo deals activos (la lista ya excluye cerrados).
    const lostPriority = list.filter((d) => d.properties["candidato_perdido_prioridad"] === "true");
    const lostCompetition = list.filter((d) => d.properties["candidato_perdido_competencia"] === "true");
    const lostPriorityModal = `${prefix}-lost-priority`;
    const lostCompetitionModal = `${prefix}-lost-competition`;
    addDrilldown(
      lostPriorityModal,
      `${label} · Candidatos a perdido por prioridad`,
      "Deals activos con señal de pérdida por prioridad o timing",
      lostPriority,
    );
    addDrilldown(
      lostCompetitionModal,
      `${label} · Candidatos a perdido por competencia`,
      "Deals activos con señal de pérdida frente a otro proveedor",
      lostCompetition,
    );
    addDrilldown(monthModal, `${label} · Cierran ${monthLabel}`, "Deals abiertos del mes en curso", month);
    addDrilldown(overdueModal, `${label} · Cierre vencido`, "Fecha de cierre en el pasado", late);
    addDrilldown(noDateModal, `${label} · Sin fecha de cierre`, "Deals abiertos sin closedate", noDate);
    addDrilldown(stale2Modal, `${label} · Estancados en E2`, "Más de 40 días en etapa 2", stale2);
    addDrilldown(stale5Modal, `${label} · Estancados en E5`, "Más de 60 días en etapa 5", stale5);
    addDrilldown(pocModal, `${label} · PoC vencida`, "E5.1 con fecha fin de PoC/Piloto pasada", poc);
    const healthy = list.length - late.length - noDate.length;
    return {
      id,
      label,
      monthLabel,
      openCount: list.length,
      monthCount: month.length,
      monthAmount: amountOf(month),
      monthWeighted: weighted(month),
      overdueCount: late.length,
      overdueAmount: amountOf(late),
      noDateCount: noDate.length,
      noDateAmount: amountOf(noDate),
      stale2Count: stale2.length,
      stale2Amount: amountOf(stale2),
      stale5Count: stale5.length,
      stale5Amount: amountOf(stale5),
      pocOverdueCount: poc.length,
      pocOverdueAmount: amountOf(poc),
      lostPriorityCount: lostPriority.length,
      lostPriorityAmount: amountOf(lostPriority),
      lostPriorityModal,
      lostCompetitionCount: lostCompetition.length,
      lostCompetitionAmount: amountOf(lostCompetition),
      lostCompetitionModal,
      healthPct: list.length ? (healthy / list.length) * 100 : 100,
      deals: month.map((deal) => ({
        ...dto(deal),
        daysLeft: Math.ceil((Date.parse(deal.properties["closedate"]!) - now) / 86_400_000),
      })),
      monthModal,
      overdueModal,
      noDateModal,
      stale2Modal,
      stale5Modal,
      pocOverdueModal: pocModal,
    };
  };

  const closeHygiene: CloseHygieneScope[] = [
    buildCloseHygiene("team", "Equipo", teamOpen),
    ...ownerIds.map((id) => buildCloseHygiene(id, ownerLabels[id]!, openByOwner.get(id) ?? [])),
  ];

  // ---------- semáforo de contactabilidad ----------
  const TEMP_BUCKETS: {
    key: string;
    label: string;
    tone: Tone;
    tooltip: string;
  }[] = [
    {
      key: "cold",
      label: "Frío · riesgo ghosting",
      tone: "bad",
      tooltip:
        "3 o más intentos de contacto y 0 respuestas del prospecto. El Adobo score se muestra con tope 45: no hay evidencia de conversación.",
    },
    {
      key: "low",
      label: "Baja contactabilidad",
      tone: "warn",
      tooltip:
        "4 o más intentos con tasa de contactabilidad bajo 25% (respuestas / intentos). El Adobo score se muestra con tope 55.",
    },
    {
      key: "normal",
      label: "Normal",
      tone: "ok",
      tooltip:
        "Tiene respuestas, tasa 25% o más, o todavía menos de 3 intentos. La contactabilidad no castiga el score.",
    },
    {
      key: "prehot",
      label: "Pre-hot (61-75)",
      tone: "ok",
      tooltip:
        "Adobo score entre 61 y 75: sirve como pre-filtro de deals con tracción, pero no califica solo como hot.",
    },
    {
      key: "hot",
      label: "Hot",
      tone: "ok",
      tooltip:
        "Adobo score 76+ con doble check: timing 0-30 días y urgencia alta o media. Hot = evidencia comercial real de cierre, no solo respuestas.",
    },
    {
      key: "unknown",
      label: "Sin dato",
      tone: "neutral",
      tooltip:
        "No hay intentos de contacto ni tasa de contactabilidad registrados en HubSpot: no se puede evaluar la temperatura.",
    },
  ];

  const buildContactTemp = (id: string, label: string, list: RawDeal[]): ContactTempScope => {
    const prefix = id === "team" ? "team" : `owner-${id}`;
    const groups = new Map<string, RawDeal[]>();
    for (const deal of list) {
      const state = contactTemperature(deal.properties).state;
      const bucket = groups.get(state) ?? [];
      bucket.push(deal);
      groups.set(state, bucket);
    }
    const buckets = TEMP_BUCKETS.map((def) => {
      const deals = (groups.get(def.key) ?? []).sort(
        (a, b) => Number(b.properties["amount"] ?? 0) - Number(a.properties["amount"] ?? 0),
      );
      const modal = `${prefix}-temp-${def.key}`;
      addDrilldown(modal, `${label} · ${def.label}`, def.tooltip, deals);
      const scores = deals
        .map((d) => contactTemperature(d.properties).cappedScore)
        .filter((value) => value >= 0);
      return {
        key: def.key,
        label: def.label,
        count: deals.length,
        amount: amountOf(deals),
        avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : -1,
        share: list.length ? (deals.length / list.length) * 100 : 0,
        tone: deals.length ? def.tone : ("neutral" as Tone),
        note: `${deals.length} deals · ${money(amountOf(deals))}`,
        tooltip: def.tooltip,
        modal,
      };
    });
    const cold = groups.get("cold") ?? [];
    return {
      id,
      label,
      openCount: list.length,
      buckets,
      coldCount: cold.length,
      coldAmount: amountOf(cold),
      coldModal: `${prefix}-temp-cold`,
      coldPct: list.length ? (cold.length / list.length) * 100 : 0,
    };
  };

  const contactTemp: ContactTempScope[] = [
    buildContactTemp("team", "Equipo", teamOpen),
    ...ownerIds.map((id) => buildContactTemp(id, ownerLabels[id]!, openByOwner.get(id) ?? [])),
  ];


  // ---------- tareas y próxima actividad ----------
  const buildTaskHygiene = (id: string, label: string, list: RawDeal[]): TaskHygieneScope => {
    const prefix = id === "team" ? "team" : `owner-${id}`;
    const noActivity = noActivityAll(list).sort(
      (a, b) => Number(b.properties["amount"] ?? 0) - Number(a.properties["amount"] ?? 0),
    );
    const lateTasks = withOverdueTask(list).sort((a, b) => tasksOf(b).overdue - tasksOf(a).overdue);
    const dueToday = withTodayTask(list).sort((a, b) => tasksOf(b).today - tasksOf(a).today);
    const pending = list.filter((d) => tasksOf(d).overdue + tasksOf(d).today > 0);
    const noActivityModal = `${prefix}-task-no-activity`;
    const overdueTaskModal = `${prefix}-task-overdue`;
    const todayTaskModal = `${prefix}-task-today`;
    const pendingModal = `${prefix}-task-pending`;
    addDrilldown(
      noActivityModal,
      `${label} · Sin próxima actividad`,
      "Deals abiertos E1-E5.1 sin próxima actividad registrada",
      noActivity,
    );
    addDrilldown(
      overdueTaskModal,
      `${label} · Tareas vencidas`,
      "Deals abiertos con al menos una tarea pendiente vencida",
      lateTasks,
    );
    addDrilldown(
      todayTaskModal,
      `${label} · Tareas para hoy`,
      "Deals abiertos con tareas pendientes que vencen hoy",
      dueToday,
    );
    addDrilldown(
      pendingModal,
      `${label} · Pendientes por hacer`,
      "Deals abiertos con tareas vencidas o para hoy",
      pending,
    );
    const healthy = list.length - new Set([...noActivity, ...lateTasks].map((d) => d.id)).size;
    return {
      id,
      label,
      openCount: list.length,
      noActivityCount: noActivity.length,
      noActivityAmount: amountOf(noActivity),
      overdueTaskCount: lateTasks.length,
      overdueTaskAmount: amountOf(lateTasks),
      overdueTaskTotal: lateTasks.reduce((sum, d) => sum + tasksOf(d).overdue, 0),
      todayTaskCount: dueToday.length,
      todayTaskAmount: amountOf(dueToday),
      todayTaskTotal: dueToday.reduce((sum, d) => sum + tasksOf(d).today, 0),
      healthPct: list.length ? (healthy / list.length) * 100 : 100,
      noActivityModal,
      overdueTaskModal,
      todayTaskModal,
      pendingModal,
    };
  };

  const taskHygiene: TaskHygieneScope[] = [
    buildTaskHygiene("team", "Equipo", teamOpen),
    ...ownerIds.map((id) => buildTaskHygiene(id, ownerLabels[id]!, openByOwner.get(id) ?? [])),
  ];

  // ---------- WR por segmento ----------
  const segmentBuckets = new Map<string, { qtd: [number, number]; prev: [number, number]; hist: [number, number] }>();
  for (const deal of closedDeals) {
    const p = deal.properties;
    const close = p["closedate"];
    if (!close) continue;
    const period = periodOf(close);
    if (!periods.includes(period)) continue;
    const segment = segmentOf(p);
    if (!segmentBuckets.has(segment)) {
      segmentBuckets.set(segment, { qtd: [0, 0], prev: [0, 0], hist: [0, 0] });
    }
    const bucket = segmentBuckets.get(segment)!;
    const idx = WON_STAGES.has(p["dealstage"] ?? "") ? 0 : 1;
    bucket.hist[idx] += 1;
    if (period === currentPeriod) bucket.qtd[idx] += 1;
    if (period === prevPeriod) bucket.prev[idx] += 1;
  }
  const segmentOrder = ["Inbound", "Outbound", "Upsell", "Cross sell", "Renovación"];
  const segments: SegmentRow[] = [...segmentBuckets.entries()]
    .sort((a, b) => segmentOrder.indexOf(a[0]) - segmentOrder.indexOf(b[0]))
    .map(([segment, bucket]) => ({
      segment,
      qtd: { won: bucket.qtd[0], lost: bucket.qtd[1] },
      qoq:
        (wrRate({ won: bucket.qtd[0], lost: bucket.qtd[1] }) -
          wrRate({ won: bucket.prev[0], lost: bucket.prev[1] })) *
        100,
      hist: { won: bucket.hist[0], lost: bucket.hist[1] },
    }));

  // ---------- alertas ----------
  const alertList: AlertItem[] = [];
  const seen = new Set<string>();
  const pushAlert = (deal: RawDeal, reason: string) => {
    if (seen.has(deal.id)) return;
    seen.add(deal.id);
    alertList.push({
      id: deal.id,
      owner: ownerNames.get(deal.properties["hubspot_owner_id"] ?? "") ?? "Sin dueño",
      name: deal.properties["dealname"] ?? "(sin nombre)",
      reason,
      amount: Number(deal.properties["amount"] ?? 0),
      url: `https://app.hubspot.com/contacts/${PORTAL_ID}/deal/${deal.id}`,
    });
  };
  for (const deal of overdue(teamOpen)) pushAlert(deal, "close vencido");
  for (const deal of noNextActivity(teamOpen)) pushAlert(deal, "E5/E5.1 sin próxima actividad");
  for (const deal of noCloseDate(teamOpen)) pushAlert(deal, "sin fecha de cierre");
  alertList.sort((a, b) => b.amount - a.amount);

  // ---------- etapa 6 firmada → 6.2 proyecto en desarrollo + plan de bot ----------
  const dealsByOwner = new Map<string, RawDeal[]>();
  for (const deal of deals) {
    const id = deal.properties["hubspot_owner_id"] ?? "";
    if (!dealsByOwner.has(id)) dealsByOwner.set(id, []);
    dealsByOwner.get(id)!.push(deal);
  }
  const rampDev: RampScope[] = [
    buildDevRamp("team", "Equipo", deals, periods, now, dto, addDrilldown),
    ...ownerIds.map((id) =>
      buildDevRamp(id, ownerLabels[id]!, dealsByOwner.get(id) ?? [], periods, now, dto, addDrilldown),
    ),
  ];
  // ---------- deals warning (etapa 6.1 · motivo_deal_warning) ----------
  const WARNING_STAGE = "1278792585";
  const buildWarnings = (id: string, label: string, list: RawDeal[]): WarningScope => {
    // Solo la etapa actual manda: el motivo queda escrito aunque el deal ya haya salido de 6.1.
    const flagged = list.filter((d) => d.properties["dealstage"] === WARNING_STAGE);
    const groups = new Map<string, RawDeal[]>();
    for (const deal of flagged) {
      const reason = deal.properties["motivo_deal_warning"]?.trim() || "Sin motivo registrado";
      if (!groups.has(reason)) groups.set(reason, []);
      groups.get(reason)!.push(deal);
    }
    const modal = `warning-${id}-all`;
    addDrilldown(modal, `Deals warning · ${label}`, "etapa 6.1 Deal Warning", flagged);
    const reasons = [...groups.entries()]
      .map(([reason, group]) => {
        const key = `warning-${id}-${reason.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        addDrilldown(key, `Warning: ${reason}`, label, group);
        return { label: reason, count: group.length, amount: amountOf(group), modal: key };
      })
      .sort((a, b) => b.count - a.count);
    return { id, label, count: flagged.length, amount: amountOf(flagged), reasons, modal };
  };
  const warnings: WarningScope[] = [
    buildWarnings("team", "Equipo", deals),
    ...ownerIds.map((id) => buildWarnings(id, ownerLabels[id]!, dealsByOwner.get(id) ?? [])),
  ];

  const planBot: PlanBotScope[] = [
    buildPlanBot("team", "Equipo", deals, periods, addDrilldown),
    ...ownerIds.map((id) =>
      buildPlanBot(id, ownerLabels[id]!, dealsByOwner.get(id) ?? [], periods, addDrilldown),
    ),
  ];
  const delivery: DeliveryScope[] = [
    buildDelivery("team", "Equipo", deals, periods, addDrilldown, contractLabels, projectLabels),
    ...ownerIds.map((id) =>
      buildDelivery(id, ownerLabels[id]!, dealsByOwner.get(id) ?? [], periods, addDrilldown, contractLabels, projectLabels),
    ),
  ];

  // ---------- capa Adobo ----------
  const adobo = buildAdoboLayer({
    openDeals,
    closedDeals,
    ownerIds,
    ownerLabels,
    periods,
    periodOf,
    isWon: (stageId) => WON_STAGES.has(stageId),
    ctx: {
      ownerNames,
      stageLabel: (stageId) => STAGE_KEY.get(stageId) ?? STAGE_LABELS[stageId] ?? "—",
      push: addDrilldown,
      now,
    },
  });

  return {
    rampDev,
    executiveStrip,
    planBot,
    warnings,
    delivery,
    adobo,
    monthly,
    stageJourneys,
    generatedAt: new Date(now).toISOString(),
    currentPeriod,
    currentLabel: `${shortPeriod(currentPeriod)} QTD`,
    roleScope: role ?? null,
    activeMrr: {
      value: activeMrrValue,
      count: liveDeals.length,
      history: activeMrrHistory,
      entries: activeMrrEntries,
      lastStart: lastEntry ? { date: lastEntry.date, name: lastEntry.name } : null,
      churnedExcluded: churnedInService,
      inDevelopment: { value: inDevValue, count: inDevLiveDeals.length },
    },
    team: {
      openAmount: amountOf(teamOpen),
      openCount: teamOpen.length,
      weightedQ: weighted(teamQOpen),
      wonQAmount: teamQuotaStats.wonAmount,
      wonQCount: teamQuotaStats.won,
      wonOtfQ: teamQuotaStats.wonOtf,
      openOtf: otfOf(teamOpen),
      quotaTotal: teamQuota,
      quotaPct: teamQuota ? (teamQuotaStats.wonAmount / teamQuota) * 100 : 0,
      wr: { won: teamStats.won, lost: teamStats.lost },
    },
    quality,
    tracking,
    closeHygiene,
    contactTemp,
    taskHygiene,
    risk: riskSummary,
    periods: {
      years: [...new Set(periods.map((p) => p.split("-Q")[0]!))],
      periods,
      owners: ownerLabels,
      ownerEmails: ownerEmailLabels,
      quotas,
      data,
    },
    quotaRows,
    ownerRows,
    segments,
    alerts: alertList.slice(0, 12),
    drilldowns,
  };
}
