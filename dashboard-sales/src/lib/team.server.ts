import type { DealDTO, Drilldown, Tone } from "./pulse-types";
import type { Props, RawDeal } from "./pulse.server";
import type {
  RepMonthStat,
  WrBucket,
  WrDimension,
  WrScope,
  RampScope,
  RampPeriodStat,
  RepPeriodStat,
  RepScorecard,
  ScoreComponent,
  StageTime,
  TeamScorecardReport,
} from "./team-types";
import {
  getCommercialDeals,
  getOwners as fetchOwners,
  getQuotas as fetchQuotasCached,
  getCached as cached,
  TTL_DEALS,
  TTL_SLOW,
} from "./hubspot.server";
import {
  LOST_STAGES,
  MANAGED_STAGES,
  NICKNAMES,
  STAGE_KEY,
  WON_STAGES,
  buildPeriods,
  gateway,
  money,
  periodOf,
  quarterBounds,
  toDTO,
} from "./pulse.server";

const PIPELINE_ID = "93085851";
const HISTORY_FROM = "2025-01-01";
const DAY = 86_400_000;

export const SCORE_WEIGHTS = [
  {
    key: "quota",
    label: "Cumplimiento de cuota",
    weight: 0.35,
    help: "MRR ganado del periodo sobre la cuota asignada en HubSpot. 100% de la cuota = 100 puntos.",
  },
  {
    key: "winrate",
    label: "Win rate",
    weight: 0.2,
    help: "Mezcla del win rate del periodo y del acumulado histórico. 35% de win rate = 100 puntos.",
  },
  {
    key: "management",
    label: "Gestión del pipeline",
    weight: 0.25,
    help: "Promedio de cobertura on-track, deals sin pinzas, con próxima actividad agendada y sin fecha de cierre vencida.",
  },
  {
    key: "velocity",
    label: "Velocidad por etapa",
    weight: 0.1,
    help: "Ciclo promedio de sus deals por las etapas E1-E5.1 comparado con el promedio del equipo. Más rápido que el equipo = 100 puntos.",
  },
  {
    key: "activity",
    label: "Actividad (reuniones)",
    weight: 0.1,
    help: "Reuniones del periodo comparadas con la mediana del equipo en ese mismo periodo.",
  },
] as const;

const STAGE_TIME_PROPS = MANAGED_STAGES.map((s) => `hs_v2_cumulative_time_in_${s.id}`);

const DEAL_PROPS = [
  "dealname",
  "amount",
  "dealstage",
  "closedate",
  "createdate",
  "hubspot_owner_id",
  "hs_deal_stage_probability",
  "hs_deal_score",
  "closed_lost_reason",
  "dealtype",
  "negocio_inbound",
  "fuente_de_creacion",
  "notes_next_activity_date",
  "hs_lastmodifieddate",
  "adobo_closing_score",
  "seguimiento_con_pinzas",
  "hs_next_step",
  "on_track",
  "hs_v2_time_in_current_stage",
  "hs_v2_date_entered_174677684",
  "hs_v2_date_entered_173990327",
  "hs_v2_date_entered_1086544542",
  ...STAGE_TIME_PROPS,
];

type Meeting = { owner: string; start: string; outcome: string | null };

function fetchMeetings(ownerIds: string[]): Promise<Meeting[]> {
  return cached(`meetings:${ownerIds.join(",")}`, TTL_SLOW, () => loadMeetings(ownerIds));
}

async function loadMeetings(ownerIds: string[]): Promise<Meeting[]> {
  const out: Meeting[] = [];
  let after: string | undefined;
  for (let page = 0; page < 60; page++) {
    const body: Record<string, unknown> = {
      filterGroups: [
        {
          filters: [
            { propertyName: "hubspot_owner_id", operator: "IN", values: ownerIds },
            { propertyName: "hs_meeting_start_time", operator: "GTE", value: HISTORY_FROM },
          ],
        },
      ],
      properties: ["hubspot_owner_id", "hs_meeting_start_time", "hs_meeting_outcome"],
      limit: 200,
    };
    if (after) body["after"] = after;
    const data = await gateway<{
      results: { properties: Props }[];
      paging?: { next?: { after?: string } };
    }>("/crm/v3/objects/meetings/search", { method: "POST", body: JSON.stringify(body) });
    for (const row of data.results) {
      const owner = row.properties["hubspot_owner_id"];
      const start = row.properties["hs_meeting_start_time"];
      if (!owner || !start) continue;
      out.push({ owner, start, outcome: row.properties["hs_meeting_outcome"] ?? null });
    }
    after = data.paging?.next?.after;
    if (!after) break;
  }
  return out;
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const rate = (stats: { won: number; lost: number }) =>
  stats.won + stats.lost ? stats.won / (stats.won + stats.lost) : 0;

function toneOf(score: number): Tone {
  if (score >= 75) return "ok";
  if (score >= 50) return "warn";
  return "bad";
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function tenureLabel(months: number): string {
  if (months <= 0) return "sin dato";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (!years) return `${rest} meses`;
  return rest ? `${years} a ${rest} m` : `${years} años`;
}


const AE_IDS = new Set(["82596016", "331766554", "373167468"]);

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

/** Industria de la empresa asociada al deal (primera asociación). Cacheada y en paralelo. */
function fetchIndustries(dealIds: string[]): Promise<Map<string, string>> {
  return cached(`industries:${dealIds.length}`, TTL_SLOW, () => loadIndustries(dealIds));
}

async function loadIndustries(dealIds: string[]): Promise<Map<string, string>> {
  const dealToCompany = new Map<string, string>();
  try {
    const batches = await Promise.all(
      chunk(dealIds, 100).map((batch) =>
        gateway<{ results: { from: { id: string }; to: { toObjectId: string | number }[] }[] }>(
          "/crm/v4/associations/deals/companies/batch/read",
          { method: "POST", body: JSON.stringify({ inputs: batch.map((id) => ({ id })) }) },
        ),
      ),
    );
    for (const data of batches) {
      for (const row of data.results ?? []) {
        const company = row.to?.[0]?.toObjectId;
        if (company) dealToCompany.set(row.from.id, String(company));
      }
    }
  } catch (error) {
    console.warn("No pudimos leer asociaciones deal→empresa", error);
    return new Map();
  }

  const companyIndustry = new Map<string, string>();
  const companyIds = [...new Set(dealToCompany.values())];
  try {
    const batches = await Promise.all(
      chunk(companyIds, 100).map((batch) =>
        gateway<{ results: { id: string; properties: Props }[] }>(
          "/crm/v3/objects/companies/batch/read",
          {
            method: "POST",
            body: JSON.stringify({ properties: ["industry"], inputs: batch.map((id) => ({ id })) }),
          },
        ),
      ),
    );
    for (const data of batches) {
      for (const row of data.results ?? []) {
        const industry = row.properties["industry"];
        companyIndustry.set(row.id, industry ? titleCase(industry) : "Sin industria");
      }
    }
  } catch (error) {
    console.warn("No pudimos leer industrias de empresas", error);
  }

  const out = new Map<string, string>();
  for (const [dealId, companyId] of dealToCompany) {
    out.set(dealId, companyIndustry.get(companyId) ?? "Sin industria");
  }
  return out;
}

const motionOf = (p: Props) => (p["negocio_inbound"] === "true" ? "Inbound" : "Outbound");
const dealTypeOf = (p: Props) => {
  const value = (p["dealtype"] ?? "").trim();
  return value ? titleCase(value) : "Sin tipo";
};
const sourceOf = (p: Props) => {
  const value = (p["fuente_de_creacion"] ?? "").trim();
  return value ? value : "Sin fuente";
};

const WR_DIMENSIONS = [
  {
    id: "source",
    label: "Fuente de creación",
    help: "Propiedad fuente_de_creacion del deal: de dónde nació la oportunidad (partner, self service, outbound, etc.).",
    of: sourceOf,
  },
  {
    id: "dealtype",
    label: "Tipo de negocio",
    help: "Propiedad dealtype: oportunidad nueva, upsell, cross sell o renovación.",
    of: dealTypeOf,
  },
  {
    id: "motion",
    label: "Inbound vs Outbound",
    help: "negocio_inbound = Sí es Inbound; vacío o No se cuenta como Outbound.",
    of: motionOf,
  },
] as const;

type ClosedDeal = { deal: RawDeal; won: boolean; period: string; amount: number; dto: DealDTO };

function buildWrScope(
  id: string,
  name: string,
  closed: ClosedDeal[],
  industries: Map<string, string>,
  periods: string[],
  push: (key: string, title: string, subtitle: string, list: DealDTO[]) => void,
): WrScope {
  const dimensions: WrDimension[] = [];
  const dims: { id: string; label: string; help: string; of: (row: ClosedDeal) => string }[] = [
    ...WR_DIMENSIONS.map((dim) => ({
      id: dim.id,
      label: dim.label,
      help: dim.help,
      of: (row: ClosedDeal) => dim.of(row.deal.properties),
    })),
    {
      id: "industry",
      label: "Industria de la empresa",
      help: "Industria de la empresa asociada al deal en HubSpot (propiedad industry de la compañía).",
      of: (row: ClosedDeal) => industries.get(row.deal.id) ?? "Sin industria",
    },
  ];

  for (const dim of dims) {
    const map = new Map<string, WrBucket & { total: number; wonDeals: DealDTO[]; lostDeals: DealDTO[] }>();
    for (const row of closed) {
      const key = dim.of(row);
      let bucket = map.get(key);
      if (!bucket) {
        const slug = `${id}-${dim.id}-${key.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`;
        bucket = {
          key,
          label: key,
          byPeriod: Object.fromEntries(
            periods.map((period) => [period, { won: 0, lost: 0, wonAmount: 0, lostAmount: 0 }]),
          ),
          wonModal: `wr-${slug}-won`,
          lostModal: `wr-${slug}-lost`,
          total: 0,
          wonDeals: [],
          lostDeals: [],
        };
        map.set(key, bucket);
      }
      const stat = bucket.byPeriod[row.period];
      if (!stat) continue;
      if (row.won) {
        stat.won += 1;
        stat.wonAmount += row.amount;
        bucket.wonDeals.push(row.dto);
      } else {
        stat.lost += 1;
        stat.lostAmount += row.amount;
        bucket.lostDeals.push(row.dto);
      }
      bucket.total += 1;
    }
    const buckets = [...map.values()].sort((a, b) => b.total - a.total).slice(0, 12);
    for (const bucket of buckets) {
      push(bucket.wonModal, `${name} · ganados en ${bucket.label}`, `${bucket.wonDeals.length} deals ganados (histórico)`, bucket.wonDeals);
      push(bucket.lostModal, `${name} · perdidos en ${bucket.label}`, `${bucket.lostDeals.length} deals perdidos (histórico)`, bucket.lostDeals);
    }
    dimensions.push({
      id: dim.id,
      label: dim.label,
      help: dim.help,
      buckets: buckets.map(({ key, label, byPeriod, wonModal, lostModal }) => ({
        key,
        label,
        byPeriod,
        wonModal,
        lostModal,
      })),
    });
  }

  return { id, name, isAE: AE_IDS.has(id), dimensions };
}

const SIGNED_STAGE = "174677684";
const SERVICE_STAGE = "173990327";
const DEV_STAGE = "1086544542";

function buildRampScope(
  id: string,
  name: string,
  deals: RawDeal[],
  periods: string[],
  now: number,
  dto: (deal: RawDeal) => DealDTO,
  push: (key: string, title: string, subtitle: string, list: DealDTO[]) => void,
  target: string = SERVICE_STAGE,
  prefix: string = "ramp",
  targetLabel: string = "inicio de servicio",
): RampScope {
  const rows = new Map<string, RampPeriodStat & { done: DealDTO[]; pending: DealDTO[] }>();
  for (const period of periods) {
    rows.set(period, {
      period,
      days: [],
      mrrSum: 0,
      pendingCount: 0,
      pendingDays: [],
      modal: `${prefix}-${id}-${period}`,
      pendingModal: `${prefix}-${id}-pending-${period}`,
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
    const service = deal.properties[`hs_v2_date_entered_${target}`];
    const serviceTs = service ? Date.parse(service) : NaN;
    const amount = Number(deal.properties["amount"] ?? 0);
    if (Number.isFinite(serviceTs) && serviceTs >= signedTs) {
      row.days.push((serviceTs - signedTs) / DAY);
      row.mrrSum += amount;
      row.done.push(dto(deal));
    } else if (!LOST_STAGES.has(deal.properties["dealstage"] ?? "")) {
      row.pendingCount += 1;
      row.pendingDays.push((now - signedTs) / DAY);
      row.pending.push(dto(deal));
    }
  }
  for (const row of rows.values()) {
    push(
      row.modal,
      `${name} · ${targetLabel} ${row.period}`,
      `${row.done.length} deals firmados que ya llegaron a ${targetLabel}`,
      row.done,
    );
    push(
      row.pendingModal,
      `${name} · firmados sin ${targetLabel} ${row.period}`,
      `${row.pending.length} deals firmados aún sin ${targetLabel}`,
      row.pending,
    );
  }
  return {
    id,
    name,
    periods: [...rows.values()].map(({ done: _d, pending: _p, ...rest }) => rest),
  };
}

export async function buildTeamReport(): Promise<TeamScorecardReport> {
  const repIds = Object.keys(NICKNAMES);
  const [deals, quotas, meetings, ownersRes] = await Promise.all([
    getCommercialDeals(MANAGED_STAGES.map((stage) => stage.id)),
    fetchQuotasCached(),
    fetchMeetings(repIds),
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
  const years = [...new Set(periods.map((p) => p.split("-")[0]!))];
  const dto = (deal: RawDeal) => toDTO(deal, ownerNames, now, quarterEnd);
  const drilldowns: Record<string, Drilldown> = {};
  const push = (key: string, title: string, subtitle: string, list: DealDTO[]) => {
    drilldowns[key] = { title, subtitle, deals: list };
  };

  const byRep = new Map<string, RawDeal[]>();
  for (const id of repIds) byRep.set(id, []);
  for (const deal of deals) {
    const owner = deal.properties["hubspot_owner_id"] ?? "";
    if (byRep.has(owner)) byRep.get(owner)!.push(deal);
  }

  const meetingsByRep = new Map<string, Meeting[]>();
  for (const id of repIds) meetingsByRep.set(id, []);
  for (const meeting of meetings) meetingsByRep.get(meeting.owner)?.push(meeting);

  // ---------- ciclo por etapa (equipo) ----------
  const stageTotals = new Map<string, { sum: number; count: number }>();
  const cumulative = (p: Props, stageId: string) => {
    const raw = p[`hs_v2_cumulative_time_in_${stageId}`];
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
  };
  for (const deal of deals) {
    if (Date.parse(deal.properties["createdate"] ?? "") < Date.parse(HISTORY_FROM)) continue;
    for (const stage of MANAGED_STAGES) {
      const ms = cumulative(deal.properties, stage.id);
      if (!ms) continue;
      const bucket = stageTotals.get(stage.key) ?? { sum: 0, count: 0 };
      bucket.sum += ms;
      bucket.count += 1;
      stageTotals.set(stage.key, bucket);
    }
  }
  const teamStageAvg = new Map<string, number>();
  for (const stage of MANAGED_STAGES) {
    const bucket = stageTotals.get(stage.key);
    teamStageAvg.set(stage.key, bucket && bucket.count ? bucket.sum / bucket.count / DAY : 0);
  }

  // ---------- métricas base por comercial ----------
  type Base = {
    id: string;
    name: string;
    tenureStart: string;
    tenureMonths: number;
    openDeals: RawDeal[];
    stageTimes: StageTime[];
    cycleDays: number;
    currentStageDays: number;
    perPeriod: Map<string, { won: DealDTO[]; lost: DealDTO[]; wonAmount: number; lostAmount: number }>;
    warnByPeriod: Map<string, { count: number; amount: number }>;
    months: RepMonthStat[];
    wrHist: { won: number; lost: number };
    meetingsByPeriod: Map<string, number>;
  };

  const bases: Base[] = [];
  for (const id of repIds) {
    const repDeals = byRep.get(id) ?? [];
    const name = ownerNames.get(id) ?? NICKNAMES[id] ?? `Owner ${id}`;

    let firstCreate = Number.POSITIVE_INFINITY;
    for (const deal of repDeals) {
      const ts = Date.parse(deal.properties["createdate"] ?? "");
      if (Number.isFinite(ts)) firstCreate = Math.min(firstCreate, ts);
    }
    const hasTenure = Number.isFinite(firstCreate);
    const tenureMonths = hasTenure ? Math.max(0, Math.round((now - firstCreate) / (DAY * 30.44))) : 0;

    const openDeals = repDeals.filter((d) => STAGE_KEY.has(d.properties["dealstage"] ?? ""));

    const stageTimes: StageTime[] = MANAGED_STAGES.map((stage) => {
      let sum = 0;
      let count = 0;
      for (const deal of repDeals) {
        if (Date.parse(deal.properties["createdate"] ?? "") < Date.parse(HISTORY_FROM)) continue;
        const ms = cumulative(deal.properties, stage.id);
        if (!ms) continue;
        sum += ms;
        count += 1;
      }
      return {
        key: stage.key,
        avgDays: count ? sum / count / DAY : 0,
        count,
        teamAvgDays: teamStageAvg.get(stage.key) ?? 0,
      };
    });
    const cycleDays = stageTimes.reduce((acc, s) => acc + s.avgDays, 0);

    let stageSum = 0;
    let stageCount = 0;
    for (const deal of openDeals) {
      const entered = deal.properties["hs_v2_time_in_current_stage"];
      const ts = entered ? Date.parse(entered) : NaN;
      if (!Number.isFinite(ts)) continue;
      stageSum += (now - ts) / DAY;
      stageCount += 1;
    }

    const perPeriod = new Map<
      string,
      { won: DealDTO[]; lost: DealDTO[]; wonAmount: number; lostAmount: number }
    >();
    for (const period of periods) {
      perPeriod.set(period, { won: [], lost: [], wonAmount: 0, lostAmount: 0 });
    }
    const monthMap = new Map<string, RepMonthStat>();
    const wrHist = { won: 0, lost: 0 };

    for (const deal of repDeals) {
      const stage = deal.properties["dealstage"] ?? "";
      const won = WON_STAGES.has(stage);
      const lost = LOST_STAGES.has(stage);
      if (!won && !lost) continue;
      const close = deal.properties["closedate"];
      if (!close) continue;
      const amount = Number(deal.properties["amount"] ?? 0);
      if (won) wrHist.won += 1;
      else wrHist.lost += 1;
      const bucket = perPeriod.get(periodOf(close));
      if (bucket) {
        if (won) {
          bucket.won.push(dto(deal));
          bucket.wonAmount += amount;
        } else {
          bucket.lost.push(dto(deal));
          bucket.lostAmount += amount;
        }
      }
      if (won) {
        const date = new Date(close);
        const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
        const current =
          monthMap.get(month) ??
          ({
            month,
            label: date.toLocaleDateString("es-CL", { month: "short", year: "2-digit", timeZone: "UTC" }),
            wonAmount: 0,
            wonCount: 0,
          } satisfies RepMonthStat);
        current.wonAmount += amount;
        current.wonCount += 1;
        monthMap.set(month, current);
      }
    }

    // Deals marcados en riesgo (on_track = No o seguimiento con pinzas), por periodo de creación.
    const warnByPeriod = new Map<string, { count: number; amount: number }>();
    for (const period of periods) warnByPeriod.set(period, { count: 0, amount: 0 });
    for (const deal of repDeals) {
      const p = deal.properties;
      const flagged = p["on_track"] === "false" || p["seguimiento_con_pinzas"] === "true";
      if (!flagged) continue;
      const created = p["createdate"];
      if (!created) continue;
      const bucket = warnByPeriod.get(periodOf(created));
      if (!bucket) continue;
      bucket.count += 1;
      bucket.amount += Number(p["amount"] ?? 0);
    }

    const meetingsByPeriod = new Map<string, number>();
    for (const period of periods) meetingsByPeriod.set(period, 0);
    for (const meeting of meetingsByRep.get(id) ?? []) {
      const period = periodOf(meeting.start);
      if (meetingsByPeriod.has(period)) {
        meetingsByPeriod.set(period, (meetingsByPeriod.get(period) ?? 0) + 1);
      }
    }

    bases.push({
      id,
      name,
      tenureStart: hasTenure ? new Date(firstCreate).toISOString() : "",
      tenureMonths,
      openDeals,
      stageTimes,
      cycleDays,
      currentStageDays: stageCount ? stageSum / stageCount : 0,
      perPeriod,
      warnByPeriod,
      months: [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-18),
      wrHist,
      meetingsByPeriod,
    });
  }

  const teamCycleDays = median(bases.map((b) => b.cycleDays).filter((v) => v > 0));

  // ---------- scorecards ----------
  const reps: RepScorecard[] = [];
  for (const base of bases) {
    const openDTOs = base.openDeals.map(dto);
    const openAmount = openDTOs.reduce((acc, d) => acc + d.amountValue, 0);
    const weightedList = base.openDeals.filter((d) => {
      const close = d.properties["closedate"];
      if (!close) return false;
      const ts = Date.parse(close);
      const { start } = quarterBounds(currentPeriod);
      return ts >= start && ts < quarterEnd;
    });
    const weightedQ = weightedList.reduce(
      (acc, d) =>
        acc + Number(d.properties["amount"] ?? 0) * Number(d.properties["hs_deal_stage_probability"] ?? 0),
      0,
    );

    const onTrack = base.openDeals.filter((d) => d.properties["on_track"] === "true");
    const offTrack = base.openDeals.filter((d) => d.properties["on_track"] !== "true");
    const pinzas = base.openDeals.filter((d) => d.properties["seguimiento_con_pinzas"] === "true");
    const noActivity = openDTOs.filter((d) => !d.nextActivityValue);
    const overdue = openDTOs.filter((d) => d.closeStatusValue === 1);
    const onTrackAmount = onTrack.reduce((acc, d) => acc + Number(d.properties["amount"] ?? 0), 0);
    const pinzasAmount = pinzas.reduce((acc, d) => acc + Number(d.properties["amount"] ?? 0), 0);
    const overdueAmount = overdue.reduce((acc, d) => acc + d.amountValue, 0);
    const adoboValues = openDTOs.filter((d) => d.adoboScoreValue >= 0).map((d) => d.adoboScoreValue);
    const avgAdobo = adoboValues.length
      ? adoboValues.reduce((a, b) => a + b, 0) / adoboValues.length
      : 0;

    const openPct = (count: number) => (base.openDeals.length ? (count / base.openDeals.length) * 100 : 0);
    const onTrackPct = openPct(onTrack.length);
    const managementScore = clamp(
      (onTrackPct +
        (100 - openPct(pinzas.length)) +
        (100 - openPct(noActivity.length)) +
        (100 - openPct(overdue.length))) /
        4,
    );

    const velocityScore = base.cycleDays > 0 && teamCycleDays > 0
      ? clamp((teamCycleDays / base.cycleDays) * 100)
      : 70;

    const modals = {
      open: `rep-${base.id}-open`,
      weighted: `rep-${base.id}-weighted`,
      onTrack: `rep-${base.id}-ontrack`,
      offTrack: `rep-${base.id}-offtrack`,
      pinzas: `rep-${base.id}-pinzas`,
      overdue: `rep-${base.id}-overdue`,
      noActivity: `rep-${base.id}-noactivity`,
    };
    push(modals.open, `${base.name} · pipeline abierto`, `${openDTOs.length} deals gestionables`, openDTOs);
    push(
      modals.weighted,
      `${base.name} · pipeline del Q`,
      `Deals con cierre en ${currentPeriod} · ponderado ${money(weightedQ)}`,
      weightedList.map(dto),
    );
    push(modals.onTrack, `${base.name} · on-track`, "Deals abiertos marcados on-track en HubSpot", onTrack.map(dto));
    push(
      modals.offTrack,
      `${base.name} · fuera de on-track`,
      "Deals abiertos sin la marca on-track",
      offTrack.map(dto),
    );
    push(modals.pinzas, `${base.name} · seguimiento con pinzas`, "Deals marcados con pinzas", pinzas.map(dto));
    push(modals.overdue, `${base.name} · cierre vencido`, "Deals abiertos con fecha de cierre pasada", overdue);
    push(modals.noActivity, `${base.name} · sin próxima actividad`, "Deals abiertos sin actividad agendada", noActivity);

    reps.push({
      id: base.id,
      name: base.name,
      tenureStart: base.tenureStart,
      tenureMonths: base.tenureMonths,
      tenureLabel: tenureLabel(base.tenureMonths),
      openAmount,
      openCount: openDTOs.length,
      weightedQ,
      onTrackCount: onTrack.length,
      onTrackAmount,
      onTrackPct,
      offTrackCount: offTrack.length,
      pinzasCount: pinzas.length,
      pinzasAmount,
      noNextActivity: noActivity.length,
      overdueCount: overdue.length,
      overdueAmount,
      avgAdobo,
      currentStageDays: base.currentStageDays,
      cycleDays: base.cycleDays,
      teamCycleDays,
      stageTimes: base.stageTimes,
      wrHist: base.wrHist,
      periods: [],
      months: base.months,
      lostReasons: [],
      modals,
    });

    // guardamos los scores intermedios para el cálculo por periodo
    (reps[reps.length - 1] as RepScorecard & { _mgmt?: number; _vel?: number })._mgmt = managementScore;
    (reps[reps.length - 1] as RepScorecard & { _mgmt?: number; _vel?: number })._vel = velocityScore;
  }

  // ---------- series por periodo + score ----------
  const meetingMedianByPeriod = new Map<string, number>();
  for (const period of periods) {
    meetingMedianByPeriod.set(
      period,
      median(bases.map((b) => b.meetingsByPeriod.get(period) ?? 0).filter((v) => v > 0)),
    );
  }

  reps.forEach((rep, index) => {
    const base = bases[index]!;
    const mgmt = (rep as RepScorecard & { _mgmt?: number })._mgmt ?? 0;
    const vel = (rep as RepScorecard & { _vel?: number })._vel ?? 70;
    const histRate = rate(base.wrHist);

    rep.periods = periods.map((period) => {
      const bucket = base.perPeriod.get(period)!;
      const quota = quotas[period]?.[base.id] ?? 0;
      const wr = { won: bucket.won.length, lost: bucket.lost.length };
      const attainment = quota ? (bucket.wonAmount / quota) * 100 : 0;
      const meetingsCount = base.meetingsByPeriod.get(period) ?? 0;
      const warn = base.warnByPeriod.get(period) ?? { count: 0, amount: 0 };
      const wonModal = `rep-${base.id}-won-${period}`;
      const lostModal = `rep-${base.id}-lost-${period}`;
      push(wonModal, `${base.name} · ganados ${period}`, `${wr.won} deals ganados`, bucket.won);
      push(lostModal, `${base.name} · perdidos ${period}`, `${wr.lost} deals perdidos`, bucket.lost);

      const quotaScore = quota ? clamp(attainment) : 50;
      const blendedWr = (rate(wr) + histRate) / 2;
      const wrScore = clamp((blendedWr / 0.35) * 100);
      const medianMeetings = meetingMedianByPeriod.get(period) ?? 0;
      const activityScore = medianMeetings ? clamp((meetingsCount / medianMeetings) * 100) : 50;

      const raw: Record<string, { score: number; detail: string }> = {
        quota: {
          score: quotaScore,
          detail: quota
            ? `${money(bucket.wonAmount)} de ${money(quota)} (${Math.round(attainment)}%)`
            : "sin cuota registrada en el periodo",
        },
        winrate: {
          score: wrScore,
          detail: `${Math.round(rate(wr) * 100)}% en el periodo · ${Math.round(histRate * 100)}% histórico`,
        },
        management: {
          score: mgmt,
          detail: `${Math.round(rep.onTrackPct)}% on-track · ${rep.pinzasCount} con pinzas · ${rep.overdueCount} vencidos (pipeline actual)`,
        },
        velocity: {
          score: vel,
          detail: base.cycleDays
            ? `ciclo ${base.cycleDays.toFixed(0)} días vs ${teamCycleDays.toFixed(0)} del equipo`
            : "sin historial de etapas suficiente",
        },
        activity: {
          score: activityScore,
          detail: `${meetingsCount} reuniones · mediana equipo ${Math.round(medianMeetings)}`,
        },
      };

      const components: ScoreComponent[] = SCORE_WEIGHTS.map((w) => ({
        key: w.key,
        label: w.label,
        weight: w.weight,
        score: Math.round(raw[w.key]!.score),
        points: Math.round(raw[w.key]!.score * w.weight),
        detail: raw[w.key]!.detail,
      }));
      const score = Math.round(components.reduce((acc, c) => acc + raw[c.key]!.score * c.weight, 0));

      return {
        period,
        quota,
        wonAmount: bucket.wonAmount,
        wonCount: wr.won,
        lostAmount: bucket.lostAmount,
        lostCount: wr.lost,
        attainment,
        wr,
        meetings: meetingsCount,
        warningCount: warn.count,
        warningAmount: warn.amount,
        score,
        tone: toneOf(score),
        components,
        wonModal,
        lostModal,
      } satisfies RepPeriodStat;
    });

    // motivos de pérdida históricos
    const reasons = new Map<string, { reason: string; count: number; amount: number }>();
    for (const period of periods) {
      for (const deal of base.perPeriod.get(period)!.lost) {
        const key = deal.lostReason ?? "Sin motivo registrado";
        const current = reasons.get(key) ?? { reason: key, count: 0, amount: 0 };
        current.count += 1;
        current.amount += deal.amountValue;
        reasons.set(key, current);
      }
    }
    rep.lostReasons = [...reasons.values()].sort((a, b) => b.count - a.count).slice(0, 8);

    delete (rep as RepScorecard & { _mgmt?: number })._mgmt;
    delete (rep as RepScorecard & { _vel?: number })._vel;
  });

  // ---------- cruce de win rate ----------
  const closedByRep = new Map<string, ClosedDeal[]>();
  const closedAll: ClosedDeal[] = [];
  for (const id of repIds) closedByRep.set(id, []);
  for (const id of repIds) {
    for (const deal of byRep.get(id) ?? []) {
      const stage = deal.properties["dealstage"] ?? "";
      const won = WON_STAGES.has(stage);
      const lost = LOST_STAGES.has(stage);
      if (!won && !lost) continue;
      const close = deal.properties["closedate"];
      if (!close) continue;
      const period = periodOf(close);
      if (!periods.includes(period)) continue;
      const row: ClosedDeal = {
        deal,
        won,
        period,
        amount: Number(deal.properties["amount"] ?? 0),
        dto: dto(deal),
      };
      closedByRep.get(id)!.push(row);
      closedAll.push(row);
    }
  }
  const industries = await fetchIndustries(closedAll.map((row) => row.deal.id));
  const wrCross: WrScope[] = [
    buildWrScope("team", "Equipo", closedAll, industries, periods, push),
    ...repIds.map((id) =>
      buildWrScope(
        id,
        ownerNames.get(id) ?? NICKNAMES[id] ?? `Owner ${id}`,
        closedByRep.get(id) ?? [],
        industries,
        periods,
        push,
      ),
    ),
  ];

  // ---------- time to service (etapa 6 firmada → 8 servicio iniciado) ----------
  const ramp: RampScope[] = [
    buildRampScope("team", "Equipo", deals, periods, now, dto, push),
    ...repIds.map((id) =>
      buildRampScope(
        id,
        ownerNames.get(id) ?? NICKNAMES[id] ?? `Owner ${id}`,
        byRep.get(id) ?? [],
        periods,
        now,
        dto,
        push,
      ),
    ),
  ];

  // ---------- etapa 6 firmada → 6.2 proyecto en desarrollo ----------
  const rampDev: RampScope[] = [
    buildRampScope(
      "team",
      "Equipo",
      deals,
      periods,
      now,
      dto,
      push,
      DEV_STAGE,
      "rampdev",
      "proyecto en desarrollo",
    ),
    ...repIds.map((id) =>
      buildRampScope(
        id,
        ownerNames.get(id) ?? NICKNAMES[id] ?? `Owner ${id}`,
        byRep.get(id) ?? [],
        periods,
        now,
        dto,
        push,
        DEV_STAGE,
        "rampdev",
        "proyecto en desarrollo",
      ),
    ),
  ];


  const currentLabel = `${currentPeriod.replace("-", " ")} · hoja de vida comercial`;

  return {
    generatedAt: new Date(now).toISOString(),
    currentPeriod,
    currentLabel,
    periods,
    years,
    reps: reps.sort((a, b) => a.name.localeCompare(b.name)),
    weights: SCORE_WEIGHTS.map((w) => ({ ...w })),
    wrCross,
    ramp,
    rampDev,
    drilldowns,
  };
}
