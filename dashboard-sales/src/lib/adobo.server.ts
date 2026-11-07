/**
 * Capa de análisis Adobo sobre los deals del pipeline comercial.
 *
 * Todas las agregaciones se calculan en el servidor. El módulo de win rate
 * cruzado se entrega como filas compactas (id + atributos) porque debe poder
 * combinarse en el cliente por periodo, comercial y tipo de deal; los DTO
 * completos ya viajan en `periods.data`, así que no se duplica payload.
 */

import type {
  AdoboBucket,
  AdoboClosedRow,
  AdoboDealDetail,
  AdoboForecastCard,
  AdoboLayer,
  AdoboMgmtCard,
  AdoboRiskRow,
  AdoboScope,
  Tone,
} from "./pulse-types";
import type { Props, RawDeal } from "./hubspot.server";
import { ADOBO_HISTORY_PROPS, ADOBO_INTELLIGENCE_PROPS, HISTORY_VERSION_CAP, legacyContactPercent, type PropertyHistoryV1 } from './adobo-intelligence';

/** Maps HubSpot propertiesWithHistory to the versioned contract; drops undated versions, never fills gaps. */
export function toPropertyHistory(dealId: string, recordUrl: string, fetchedAt: string,
  raw: Record<string, { value?: string | null; timestamp?: string; sourceType?: string }[]>, complete = true): PropertyHistoryV1 {
  const properties: PropertyHistoryV1['properties'] = {};
  for (const key of ADOBO_HISTORY_PROPS) {
    const list = raw[key];
    if (!Array.isArray(list)) continue;
    const dated = list.filter(v => v && Number.isFinite(Date.parse(v.timestamp ?? '')))
      .map(v => ({ value: v.value?.trim() || null, at: new Date(Date.parse(v.timestamp!)).toISOString(), sourceType: v.sourceType ?? null }))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    // Oldest-version truncation keeps retained adjacency; discarded undated/malformed versions do not.
    properties[key] = { versions: dated.slice(0, HISTORY_VERSION_CAP), truncated: dated.length > HISTORY_VERSION_CAP, malformed: dated.length !== list.length };
  }
  return { version: 'hubspot-property-history/v1', dealId, fetchedAt, recordUrl, complete, properties };
}

const DAY_MS = 86_400_000;

/** Propiedades Adobo que se piden al fetch de deals. */
export const ADOBO_PROPS = [
  "adobo_pain_categoria",
  "adobo_current_urgencia",
  "adobo_current_timing",
  "adobo_current_objecion",
  "adobo_current_competidor",
  "adobo_next_step_claro",
  "adobo_decisor_presente",
  "adobo_presupuesto_mencionado",
  "adobo_riesgos_restricciones",
  "adobo_snapshot_confidence",
  "adobo_compromisos_especiales",
  "adobo_stakeholders_mapeados",
  "adobo_last_reu_quality",
  "adobo_reus_analizadas_count",
  "adobo_last_reu_date",
  "adobo_last_reu_tipo",
  "adobo_motivo_compra",
  "adobo_score_trend",
  "adobo_score_driver_principal",
  "adobo_score_last_change_reason",
  "adobo_score_last_changed_at",
  "adobo_icp_fit",
  "adobo_icp_fit_evidencia",
  "adobo_intentos_contacto_prospecto",
  "adobo_respuestas_prospecto",
  "adobo_tiene_whatsapp_b_api_negociacion",
  ...ADOBO_INTELLIGENCE_PROPS,
];

/* ------------------------------------------------------------------ */
/* Normalización defensiva                                            */
/* ------------------------------------------------------------------ */

/** minúsculas, sin acentos, espacios/guiones → "_" y vacío → null. */
export function norm(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const value = String(raw)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!value || value === "n/a" || value === "na" || value === "null" || value === "undefined") {
    return null;
  }
  return value;
}

/** Checkbox de HubSpot: valores separados por ";" (a veces "," o "|"). */
function normList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      String(raw)
        .split(/[;,|]/)
        .map((part) => norm(part))
        .filter((part): part is string => !!part),
    ),
  ];
}

/** Interpretación defensiva de sí/no/dudoso. */
function triState(raw: string | null | undefined): "si" | "no" | "dudoso" | null {
  const value = norm(raw);
  if (!value) return null;
  if (["si", "s", "yes", "true", "1", "y"].includes(value)) return "si";
  if (["no", "n", "false", "0"].includes(value)) return "no";
  return "dudoso";
}

const LABELS: Record<string, string> = {
  // fit / urgencia / confianza / calidad
  alto: "Alto",
  medio: "Medio",
  bajo: "Bajo",
  indeterminado: "Indeterminado",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
  no_detectada: "No detectada",
  // timing
  "0_30": "0-30 días",
  "31_60": "31-60 días",
  "61_90": "61-90 días",
  "90_plus": "90+ días",
  sin_timing: "Sin timing",
  // pain
  sla: "SLA",
  costos: "Costos",
  omnicanalidad: "Omnicanalidad",
  automatizacion: "Automatización",
  ecommerce: "Ecommerce",
  ia: "IA",
  reporting: "Reporting",
  integraciones: "Integraciones",
  // objeciones
  precio: "Precio",
  timing: "Timing",
  integracion: "Integración",
  competidor: "Competidor",
  seguridad: "Seguridad",
  legal_contrato: "Legal / contrato",
  prioridad_interna: "Prioridad interna",
  funcionalidad: "Funcionalidad",
  ninguna: "Ninguna",
  otra: "Otra",
  otro: "Otro",
  // riesgos
  meta: "Meta",
  ti: "TI",
  legal: "Legal",
  presupuesto: "Presupuesto",
  deadline: "Deadline",
  datos_incompletos: "Datos incompletos",
  aprobacion_interna: "Aprobación interna",
  // stakeholders / compromisos
  sponsor: "Sponsor",
  decisor_compra: "Decisor de compra",
  lider_proyecto: "Líder de proyecto",
  tecnico_ti: "Técnico TI",
  finanzas: "Finanzas",
  usuario_operativo: "Usuario operativo",
  setup_especial: "Setup especial",
  desarrollo_custom: "Desarrollo custom",
  acompanamiento_meta: "Acompañamiento Meta",
  capacitacion_especial: "Capacitación especial",
  plantilla_bot: "Plantilla de bot",
  deadline_comercial: "Deadline comercial",
  tipo_a: "Tipo A",
  tipo_b: "Tipo B",
  tipo_c: "Tipo C",
  si: "Sí",
  no: "No",
  dudoso: "Dudoso",
};

/** Etiqueta compacta y legible para cualquier valor normalizado. */
export function labelOf(value: string | null): string {
  if (!value) return "s/n";
  const known = LABELS[value];
  if (known) return known;
  const clean = value.replace(/_/g, " ").trim();
  if (clean.length > 28) return `${clean.slice(0, 27)}…`;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** Detalle Adobo de un deal para el modal (texto libre se recorta al modal). */
export function adoboDetail(p: Props): AdoboDealDetail {
  const count = Number(p["adobo_reus_analizadas_count"] ?? 0);
  const competitor = (p["adobo_current_competidor"] ?? "").trim();
  const motive = (p["adobo_motivo_compra"] ?? "").trim();
  return {
    fit: norm(p["adobo_icp_fit"]),
    properties: Object.fromEntries(ADOBO_INTELLIGENCE_PROPS.map(key => [key, p[key]?.trim() || null])),
    verifiedContext: null,
    contactVerified: false,
    pain: norm(p["adobo_pain_categoria"]),
    urgency: norm(p["adobo_current_urgencia"]),
    timing: norm(p["adobo_current_timing"]),
    objection: norm(p["adobo_current_objecion"]),
    competitor: competitor || null,
    risks: normList(p["adobo_riesgos_restricciones"]),
    confidence: norm(p["adobo_snapshot_confidence"]),
    nextStepClear: triState(p["adobo_next_step_claro"]),
    decisionMaker: triState(p["adobo_decisor_presente"]),
    budget: triState(p["adobo_presupuesto_mencionado"]),
    stakeholders: normList(p["adobo_stakeholders_mapeados"]),
    commitments: normList(p["adobo_compromisos_especiales"]),
    lastMeetingDate: p["adobo_last_reu_date"] ?? null,
    lastMeetingQuality: norm(p["adobo_last_reu_quality"]),
    lastMeetingType: norm(p["adobo_last_reu_tipo"]),
    meetingsAnalyzed: Number.isFinite(count) && count > 0 ? count : 0,
    buyingMotive: motive || null,
    scoreTrend: norm(p["adobo_score_trend"]),
    scoreDriver: (p["adobo_score_driver_principal"] ?? "").trim() || null,
    scoreChangeReason: (p["adobo_score_last_change_reason"] ?? "").trim() || null,
    scoreChangedAt: p["adobo_score_last_changed_at"] ?? null,
    icpFit: norm(p["adobo_icp_fit"]),
    icpEvidence: (p["adobo_icp_fit_evidencia"] ?? "").trim() || null,
    contactRate: numOrNull(p["adobo_tasa_contactabilidad_prospecto"]),
    contactAttempts: numOrNull(p["adobo_intentos_contacto_prospecto"]),
    contactReplies: numOrNull(p["adobo_respuestas_prospecto"]),
    waba: triState(p["adobo_tiene_whatsapp_b_api_negociacion"]),
    ...(() => {
      const t = contactTemperature(p);
      return {
        temp: t.state,
        tempLabel: t.label,
        tempNote: t.note,
        scoreCap: t.cap,
        cappedScore: t.cappedScore,
      };
    })(),
  };
}

/* ------------------------------------------------------------------ */
/* Semáforo de contactabilidad                                        */
/* ------------------------------------------------------------------ */

export type ContactTempState = "cold" | "low" | "hot" | "prehot" | "normal" | "unknown";

export type ContactTemperature = {
  state: ContactTempState;
  label: string;
  note: string;
  tone: Tone;
  /** tope aplicado al adobo score (null = sin castigo) */
  cap: number | null;
  /** score bruto de HubSpot (-1 sin dato) */
  rawScore: number;
  /** score con tope aplicado (-1 sin dato) */
  cappedScore: number;
  attempts: number | null;
  replies: number | null;
  /** tasa normalizada a 0-100 (null sin dato) */
  rate: number | null;
};

/** Legacy percent units, including values over 100; not the episode metric. */
export const normRate = legacyContactPercent;

export type LegacyContactValidation = {
  verified: boolean;
  fresh: boolean;
  coverageVerified: boolean;
  pauseAgreed: boolean | null;
};

/**
 * Semáforo de contactabilidad y tope de Adobo score.
 *
 * - Frío / riesgo ghosting: 3+ intentos y 0 respuestas → tope 45.
 * - Baja contactabilidad: 4+ intentos y tasa < 25% → tope 55.
 * - Hot: score 76+ con timing 0-30 y urgencia alta/media (evidencia real).
 * - Pre-hot: score 61-75 (candidato, no dispara solo).
 * - Normal: hay respuestas, tasa >= 25% o menos de 3 intentos.
 */
export function contactTemperature(p: Props, validation?: LegacyContactValidation): ContactTemperature {
  const attempts = numOrNull(p["adobo_intentos_contacto_prospecto"]);
  const replies = numOrNull(p["adobo_respuestas_prospecto"]);
  const rate = normRate(p["adobo_tasa_contactabilidad_prospecto"]);
  const rawScore = numOrNull(p["adobo_closing_score"]) ?? -1;
  const timing = norm(p["adobo_current_timing"]);
  const urgency = norm(p["adobo_current_urgencia"]);

  // Raw counters contain no freshness, coverage or pause contract. Fail closed:
  // this legacy classifier must never reuse the episode metric or manufacture evidence.
  if (!validation?.verified || !validation.fresh || !validation.coverageVerified ||
      validation.pauseAgreed !== false || attempts === null || replies === null || rate === null) {
    return { state: 'unknown', label: 'Señal no verificable',
      note: 'Contacto legado sin disponibilidad, frescura, cobertura y pausa validadas; sin alerta ni tope.',
      tone: 'neutral', cap: null, rawScore, cappedScore: rawScore, attempts, replies, rate };
  }

  const cold = attempts >= 3 && replies === 0;
  const low = !cold && attempts >= 4 && rate < 25;

  const cap = cold ? 45 : low ? 55 : null;
  const cappedScore = rawScore < 0 ? -1 : cap === null ? rawScore : Math.min(rawScore, cap);

  const facts = [
    attempts === null ? null : `${attempts} intentos`,
    replies === null ? null : `${replies} respuestas`,
    rate === null ? null : `tasa ${Math.round(rate)}%`,
  ]
    .filter((part): part is string => !!part)
    .join(" · ");

  if (cold) {
    return {
      state: "cold",
      label: "Frío",
      note: `Riesgo ghosting: ${facts || "3+ intentos sin respuesta"} · score con tope 45`,
      tone: "bad",
      cap,
      rawScore,
      cappedScore,
      attempts,
      replies,
      rate,
    };
  }
  if (low) {
    return {
      state: "low",
      label: "Baja contactabilidad",
      note: `${facts} · score con tope 55`,
      tone: "warn",
      cap,
      rawScore,
      cappedScore,
      attempts,
      replies,
      rate,
    };
  }

  const hotEvidence = timing === "0_30" && (urgency === "alta" || urgency === "media");
  if (rawScore >= 76 && hotEvidence) {
    return {
      state: "hot",
      label: "Hot",
      note: `Score ${Math.round(rawScore)} con timing 0-30 y urgencia ${labelOf(urgency)}${facts ? ` · ${facts}` : ""}`,
      tone: "ok",
      cap: null,
      rawScore,
      cappedScore,
      attempts,
      replies,
      rate,
    };
  }
  if (rawScore >= 61) {
    return {
      state: "prehot",
      label: "Pre-hot",
      note: `Score ${Math.round(rawScore)} sin doble check de timing/urgencia${facts ? ` · ${facts}` : ""}`,
      tone: "ok",
      cap: null,
      rawScore,
      cappedScore,
      attempts,
      replies,
      rate,
    };
  }
  if (attempts === null && replies === null && rate === null) {
    return {
      state: "unknown",
      label: "Sin dato",
      note: "Sin intentos ni tasa de contactabilidad registrados en HubSpot",
      tone: "neutral",
      cap: null,
      rawScore,
      cappedScore,
      attempts,
      replies,
      rate,
    };
  }
  return {
    state: "normal",
    label: "Normal",
    note: facts ? `${facts} · sin castigo por contactabilidad` : "Sin castigo por contactabilidad",
    tone: "ok",
    cap: null,
    rawScore,
    cappedScore,
    attempts,
    replies,
    rate,
  };
}

/** Número defensivo: null cuando el dato no viene o no es numérico. */
function numOrNull(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function hasAdoboData(p: Props): boolean {
  const detail = adoboDetail(p);
  return !!(
    detail.fit ||
    detail.pain ||
    detail.urgency ||
    detail.timing ||
    detail.objection ||
    detail.confidence ||
    detail.risks.length ||
    detail.nextStepClear ||
    detail.decisionMaker ||
    detail.budget
  );
}

/* ------------------------------------------------------------------ */
/* Helpers de agregación                                              */
/* ------------------------------------------------------------------ */

const amountOf = (list: RawDeal[]) =>
  list.reduce((sum, d) => sum + Number(d.properties["amount"] ?? 0), 0);

const avgAdoboScore = (list: RawDeal[]) => {
  const scored = list.filter((d) => d.properties["adobo_closing_score"]);
  if (!scored.length) return -1;
  return (
    scored.reduce((sum, d) => sum + Number(d.properties["adobo_closing_score"] ?? 0), 0) /
    scored.length
  );
};

const closeTs = (d: RawDeal) => {
  const close = d.properties["closedate"];
  if (!close) return null;
  const ts = Date.parse(close);
  return Number.isFinite(ts) ? ts : null;
};

const topOf = (list: RawDeal[], pick: (d: RawDeal) => string, limit = 3) => {
  const map = new Map<string, number>();
  for (const deal of list) {
    const key = pick(deal) || "s/n";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
};

export type AdoboContext = {
  ownerNames: Map<string, string>;
  stageLabel: (stageId: string) => string;
  push: (key: string, title: string, subtitle: string, list: RawDeal[]) => void;
  now: number;
};

const FIT_ORDER = ["alto", "medio", "bajo", "indeterminado"];

function buildFit(prefix: string, label: string, open: RawDeal[], ctx: AdoboContext): AdoboBucket[] {
  const groups = new Map<string, RawDeal[]>();
  for (const value of FIT_ORDER) groups.set(value, []);
  for (const deal of open) {
    const detail = adoboDetail(deal.properties);
    const fit = detail.icpFit;
    const key = fit && FIT_ORDER.includes(fit) ? fit : "indeterminado";
    groups.get(key)!.push(deal);
  }
  return FIT_ORDER.map((key) => {
    const list = groups.get(key)!;
    const modal = `${prefix}-adobo-fit-${key}`;
    ctx.push(modal, `${label} · Deal fit ${labelOf(key)}`, "Deals abiertos con este fit Adobo", list);
    return {
      key,
      label: labelOf(key),
      count: list.length,
      amount: amountOf(list),
      avgScore: avgAdoboScore(list),
      modal,
    };
  });
}

function buildForecast(
  prefix: string,
  label: string,
  open: RawDeal[],
  ctx: AdoboContext,
): AdoboForecastCard[] {
  const soon = ctx.now + 30 * DAY_MS;
  const strongUrgency = new Set(["alta", "media"]);
  const weakTiming = new Set(["61_90", "90_plus", "sin_timing"]);

  const credible = open.filter((d) => {
    const a = adoboDetail(d.properties);
    return a.timing === "0_30" && !!a.urgency && strongUrgency.has(a.urgency);
  });
  const optimistic = open.filter((d) => {
    const ts = closeTs(d);
    if (ts === null || ts < ctx.now || ts > soon) return false;
    const a = adoboDetail(d.properties);
    return !a.timing || weakTiming.has(a.timing);
  });
  const urgentNoDate = open.filter((d) => {
    const a = adoboDetail(d.properties);
    return a.urgency === "alta" && closeTs(d) === null;
  });
  const staleOverdue = open.filter((d) => {
    const ts = closeTs(d);
    if (ts === null || ts >= ctx.now) return false;
    const a = adoboDetail(d.properties);
    return !a.urgency || a.urgency === "baja" || a.urgency === "no_detectada";
  });

  const cards: {
    key: string;
    label: string;
    list: RawDeal[];
    tone: Tone;
    note: string;
    tooltip: string;
  }[] = [
    {
      key: "credible",
      label: "Forecast creíble",
      list: credible,
      tone: credible.length ? "ok" : "neutral",
      note: "timing 0-30 días y urgencia alta/media",
      tooltip:
        "Deals abiertos con adobo_current_timing = 0-30 días y urgencia alta o media: el cierre declarado tiene respaldo en la conversación.",
    },
    {
      key: "optimistic",
      label: "Fecha optimista",
      list: optimistic,
      tone: optimistic.length ? "warn" : "ok",
      note: "cierra en ≤30 días pero timing débil o sin timing",
      tooltip:
        "Close date dentro de 30 días mientras el timing Adobo es 61-90, 90+ o inexistente. Señal de forecast poco creíble.",
    },
    {
      key: "urgent-no-date",
      label: "Urgencia sin fecha",
      list: urgentNoDate,
      tone: urgentNoDate.length ? "warn" : "ok",
      note: "urgencia alta y sin close date",
      tooltip:
        "El cliente muestra urgencia alta pero el deal no tiene fecha de cierre: forecast perdido por higiene.",
    },
    {
      key: "stale-overdue",
      label: "Vencido y frío",
      list: staleOverdue,
      tone: staleOverdue.length ? "bad" : "ok",
      note: "close date vencida y urgencia baja/no detectada",
      tooltip:
        "Fecha de cierre en el pasado y urgencia baja o no detectada: candidatos a re-fechar o descartar.",
    },
  ];

  return cards.map((card) => {
    const modal = `${prefix}-adobo-fc-${card.key}`;
    ctx.push(modal, `${label} · ${card.label}`, card.note, card.list);
    return {
      key: card.key,
      label: card.label,
      count: card.list.length,
      amount: amountOf(card.list),
      tone: card.tone,
      note: card.note,
      tooltip: card.tooltip,
      modal,
    };
  });
}

function buildRisks(prefix: string, label: string, open: RawDeal[], ctx: AdoboContext): AdoboRiskRow[] {
  const groups = new Map<string, RawDeal[]>();
  for (const deal of open) {
    for (const risk of adoboDetail(deal.properties).risks) {
      if (!groups.has(risk)) groups.set(risk, []);
      groups.get(risk)!.push(deal);
    }
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const modal = `${prefix}-adobo-risk-${key}`;
      ctx.push(modal, `${label} · Riesgo ${labelOf(key)}`, "Deals abiertos con este riesgo declarado", list);
      return {
        key,
        label: labelOf(key),
        count: list.length,
        amount: amountOf(list),
        owners: topOf(list, (d) => ctx.ownerNames.get(d.properties["hubspot_owner_id"] ?? "") ?? "Sin dueño"),
        stages: topOf(list, (d) => ctx.stageLabel(d.properties["dealstage"] ?? "")),
        sources: topOf(list, (d) => (d.properties["fuente_de_creacion"] ?? "").trim() || "s/n"),
        dealTypes: topOf(list, (d) => (d.properties["dealtype"] ?? "").trim() || "s/n"),
        modal,
      };
    })
    .sort((a, b) => b.amount - a.amount || b.count - a.count);
}

function buildManagement(
  prefix: string,
  label: string,
  open: RawDeal[],
  ctx: AdoboContext,
): AdoboMgmtCard[] {
  const band = (pct: number, denom: number): Tone => {
    if (!denom) return "neutral";
    return pct >= 70 ? "ok" : pct >= 40 ? "warn" : "bad";
  };
  const specs: {
    key: string;
    label: string;
    tooltip: string;
    ok: (d: AdoboDealDetail) => boolean;
    known: (d: AdoboDealDetail) => boolean;
  }[] = [
    {
      key: "next-step",
      label: "Next step claro",
      tooltip: "adobo_next_step_claro = sí. El denominador son los deals abiertos del scope.",
      ok: (a) => a.nextStepClear === "si",
      known: (a) => a.nextStepClear !== null,
    },
    {
      key: "decision-maker",
      label: "Decisor presente",
      tooltip: "adobo_decisor_presente = sí en la última reunión analizada.",
      ok: (a) => a.decisionMaker === "si",
      known: (a) => a.decisionMaker !== null,
    },
    {
      key: "budget",
      label: "Presupuesto mencionado",
      tooltip: "adobo_presupuesto_mencionado = sí.",
      ok: (a) => a.budget === "si",
      known: (a) => a.budget !== null,
    },
    {
      key: "confidence",
      label: "Confianza alta/media",
      tooltip: "adobo_snapshot_confidence en alta o media: el snapshot Adobo es confiable.",
      ok: (a) => a.confidence === "alta" || a.confidence === "media",
      known: (a) => a.confidence !== null,
    },
  ];
  return specs.map((spec) => {
    const details = open.map((deal) => ({ deal, a: adoboDetail(deal.properties) }));
    const good = details.filter((row) => spec.ok(row.a)).map((row) => row.deal);
    const unknown = details.filter((row) => !spec.known(row.a)).length;
    const denom = open.length;
    const pct = denom ? (good.length / denom) * 100 : 0;
    const modal = `${prefix}-adobo-mgmt-${spec.key}`;
    ctx.push(modal, `${label} · ${spec.label}`, `${good.length} de ${denom} deals abiertos`, good);
    return {
      key: spec.key,
      label: spec.label,
      pct,
      count: good.length,
      denom,
      unknown,
      tone: band(pct, denom),
      tooltip: spec.tooltip,
      modal,
    };
  });
}

/** Construye la capa Adobo completa (equipo + comerciales con cuota). */
export function buildAdoboLayer(args: {
  openDeals: RawDeal[];
  closedDeals: RawDeal[];
  ownerIds: string[];
  ownerLabels: Record<string, string>;
  periods: string[];
  periodOf: (iso: string) => string;
  isWon: (stageId: string) => boolean;
  ctx: AdoboContext;
}): AdoboLayer {
  const { openDeals, closedDeals, ownerIds, ownerLabels, periods, periodOf, isWon, ctx } = args;

  const openByOwner = new Map<string, RawDeal[]>();
  for (const deal of openDeals) {
    const id = deal.properties["hubspot_owner_id"] ?? "";
    if (!openByOwner.has(id)) openByOwner.set(id, []);
    openByOwner.get(id)!.push(deal);
  }

  const scopeFor = (id: string, label: string, list: RawDeal[]): AdoboScope => {
    const prefix = id === "team" ? "team" : `owner-${id}`;
    return {
      id,
      label,
      openCount: list.length,
      openAmount: amountOf(list),
      fit: buildFit(prefix, label, list, ctx),
      forecast: buildForecast(prefix, label, list, ctx),
      risks: buildRisks(prefix, label, list, ctx),
      management: buildManagement(prefix, label, list, ctx),
    };
  };

  const scopes: AdoboScope[] = [
    scopeFor("team", "Equipo", openDeals),
    ...ownerIds.map((id) => scopeFor(id, ownerLabels[id] ?? `Owner ${id}`, openByOwner.get(id) ?? [])),
  ];

  const dealTypes = new Set<string>();
  const closed: AdoboClosedRow[] = [];
  for (const deal of closedDeals) {
    const p = deal.properties;
    const close = p["closedate"];
    if (!close) continue;
    const period = periodOf(close);
    if (!periods.includes(period)) continue;
    const detail = adoboDetail(p);
    const dealType = (p["dealtype"] ?? "").trim() || "s/n";
    dealTypes.add(dealType);
    closed.push({
      id: deal.id,
      ownerId: p["hubspot_owner_id"] ?? "",
      period,
      won: isWon(p["dealstage"] ?? ""),
      amount: Number(p["amount"] ?? 0),
      dealType,
      pain: detail.pain ?? "",
      objection: detail.objection ?? "",
      competitor: detail.competitor ? (norm(detail.competitor) ?? "") : "",
    });
  }

  return {
    scopes,
    closed,
    dealTypes: [...dealTypes].sort((a, b) => a.localeCompare(b)),
    populatedOpen: openDeals.filter((d) => hasAdoboData(d.properties)).length,
  };
}
