import type { RoleFilter } from "./owner-roles";
import type { AdoboPropertyValues, AdoboVerifiedContextV1, PropertyHistoryV1 } from './adobo-intelligence';
import type { ContactSnapshotV1, ContactAggregateEvidenceV1 } from './contact-aggregate';

export type DealDTO = {
  id: string;
  name: string;
  url: string;
  owner: string;
  /** id del dueño en HubSpot (para asignar tareas) */
  ownerId: string;
  amount: string;
  amountValue: number;
  /** OTF: pago único asociado al deal (0 si no tiene) */
  otfValue: number;
  stage: string;
  /** etiqueta completa del pipeline: número + nombre real de la etapa */
  stageFull: string;
  /** id de etapa en HubSpot (para agrupar por etapa exacta) */
  stageId: string;
  /** segmento del negocio: Inbound, Outbound, Upsell, Cross sell, Renovación */
  segment: string;
  closeDate: string;
  closeDateValue: string;
  /** Fecha real de creación de HubSpot; ausente en snapshots antiguos. */
  createdAt?: string;
  probability: string;
  probabilityValue: number;
  score: string;
  scoreValue: number;
  adoboScore: string;
  adoboScoreValue: number;
  nextActivity: string;
  nextActivityValue: string;
  /** actividades de venta registradas (num_contacted_notes) */
  activities?: number | null;
  /** última actividad de venta (notes_last_contacted, ISO) */
  lastContacted?: string;
  nextStep: string | null;
  closeStatus: string;
  closeStatusValue: number;
  lostReason: string | null;
  /** alerta Finanzas (Negocio) y alerta SSPP de HubSpot */
  financeAlert?: string | null;
  ssppAlert?: string | null;
  /** etiqueta de status_contrato (null = en blanco) */
  contractStatus?: string | null;
  /** valor crudo de productos_a_contratar */
  productToHire?: string | null;
  /** valor crudo de dealtype (undefined en snapshots antiguos) */
  dealType?: string | null;
  source: string | null;
  /** País del deal (propiedad `pais` de HubSpot) */
  country: string | null;
  /** fecha en que HubSpot detectó la señal de pérdida (última modificación del deal) */
  signalDate: string | null;
  /** Capa Adobo (snapshot de reuniones analizadas); null cuando no está poblada */
  adobo: AdoboDealDetail;
};

/* ---------------- Entrega: ganados, contratos y finanzas ---------------- */

export type DeliveryRow = {
  key: string;
  label: string;
  count: number;
  amount: number;
  /** promedio de % de avance hacia el kick off (-1 si nadie tiene dato) */
  avgProgress: number;
  /** mediana de días en la etapa actual (-1 sin dato) */
  medDays: number;
  modal: string;
};

export type DeliveryPeriodStat = {
  period: string;
  wonCount: number;
  wonAmount: number;
  devCount: number;
  devAmount: number;
  liveCount: number;
  liveAmount: number;
  stuckCount: number;
  stuckAmount: number;
  avgProgress: number;
  progressBase: number;
  portal: DeliveryRow[];
  contracts: DeliveryRow[];
  /** agrupación por Status Proyecto de HubSpot */
  projects: DeliveryRow[];
  setupPaid: number;
  setupBase: number;
  mrrPaid: number;
  mrrBase: number;
  setupPaidAmount: number;
  setupPendingAmount: number;
  mrrPaidAmount: number;
  mrrPendingAmount: number;
  /** ganados que siguen en etapa 6 (propuesta firmada) sin pasar a 6.2 */
  signedCount: number;
  signedAmount: number;
  kickoffCount: number;
  kickoffAmount: number;
  noKickoffCount: number;
  /** buckets por etapa actual exacta dentro de la carrera post-firma */
  warningCount: number;
  warningAmount: number;
  pilotCount: number;
  pilotAmount: number;
  onboardingCount: number;
  onboardingAmount: number;
  lostDevelopmentCount: number;
  lostDevelopmentAmount: number;
  wonModal: string;
  devModal: string;
  liveModal: string;
  stuckModal: string;
  setupModal: string;
  mrrModal: string;
  signedModal: string;
  kickoffModal: string;
  noKickoffModal: string;
  warningModal: string;
  pilotModal: string;
  onboardingModal: string;
  lostDevelopmentModal: string;
  setupPaidModal: string;
  mrrPaidModal: string;
};

export type DeliveryScope = {
  id: string;
  name: string;
  periods: DeliveryPeriodStat[];
};

/** Detalle Adobo mostrado como chips en el modal de deals. */
export type AdoboDealDetail = {
  /** Exact property values, omitted by older report snapshots. */
  properties?: AdoboPropertyValues;
  /** No producer is integrated yet; never synthesize from CRM snapshot dates. */
  verifiedContext?: AdoboVerifiedContextV1 | null;
  contactVerified?: boolean;
  /** HubSpot property history for this exact deal; absent when unread or the read failed. */
  propertyHistory?: PropertyHistoryV1 | null;
  fit: string | null;
  pain: string | null;
  urgency: string | null;
  timing: string | null;
  objection: string | null;
  competitor: string | null;
  risks: string[];
  confidence: string | null;
  nextStepClear: string | null;
  decisionMaker: string | null;
  budget: string | null;
  stakeholders: string[];
  commitments: string[];
  lastMeetingDate: string | null;
  lastMeetingQuality: string | null;
  lastMeetingType: string | null;
  meetingsAnalyzed: number;
  /** solo para el detalle del deal */
  buyingMotive: string | null;
  /* --- composición del score (pueden faltar en snapshots antiguos) --- */
  scoreTrend?: string | null;
  scoreDriver?: string | null;
  scoreChangeReason?: string | null;
  scoreChangedAt?: string | null;
  icpFit?: string | null;
  icpEvidence?: string | null;
  /** tasa de contactabilidad 0-100 (null sin dato) */
  contactRate?: number | null;
  contactAttempts?: number | null;
  contactReplies?: number | null;
  /** WhatsApp Business API registrado en la negociación */
  waba?: string | null;
  /** semáforo de contactabilidad: cold | low | normal | prehot | hot | unknown */
  temp?: string | null;
  tempLabel?: string | null;
  tempNote?: string | null;
  /** tope aplicado al adobo score (null = sin castigo) */
  scoreCap?: number | null;
  /** score con tope aplicado (-1 sin dato) */
  cappedScore?: number | null;
};

export type Drilldown = {
  title: string;
  subtitle: string;
  deals: DealDTO[];
  /** ids de deals creados en el período que aún no se activan; habilita el filtro Estado del popup */
  notActivatedIds?: string[];
  /** orden con el que abre el popup (ej. fecha de cierre más reciente primero); sin esto, monto descendente */
  initialSort?: { key: string; dir: "asc" | "desc" };
};

/* ---------------- Capa Adobo agregada ---------------- */

/** Grupo de calidad de pipeline (deal fit) o similar. */
export type AdoboBucket = {
  key: string;
  label: string;
  count: number;
  amount: number;
  /** promedio de adobo_closing_score; -1 si nadie tiene score */
  avgScore: number;
  modal: string;
};

export type AdoboForecastCard = {
  key: string;
  label: string;
  count: number;
  amount: number;
  tone: Tone;
  note: string;
  tooltip: string;
  modal: string;
};

export type AdoboRiskRow = {
  key: string;
  label: string;
  count: number;
  amount: number;
  owners: { label: string; count: number }[];
  stages: { label: string; count: number }[];
  sources: { label: string; count: number }[];
  dealTypes: { label: string; count: number }[];
  modal: string;
};

export type AdoboMgmtCard = {
  key: string;
  label: string;
  pct: number;
  count: number;
  denom: number;
  unknown: number;
  tone: Tone;
  tooltip: string;
  modal: string;
};

/** Fila compacta de deal cerrado para el módulo de win rate cruzado. */
export type AdoboClosedRow = {
  id: string;
  ownerId: string;
  period: string;
  won: boolean;
  amount: number;
  dealType: string;
  pain: string;
  objection: string;
  competitor: string;
};

export type AdoboScope = {
  id: string;
  label: string;
  openCount: number;
  openAmount: number;
  fit: AdoboBucket[];
  forecast: AdoboForecastCard[];
  risks: AdoboRiskRow[];
  management: AdoboMgmtCard[];
};

export type AdoboLayer = {
  scopes: AdoboScope[];
  closed: AdoboClosedRow[];
  dealTypes: string[];
  /** cuántos deals abiertos tienen al menos un campo Adobo poblado */
  populatedOpen: number;
};


export type PeriodStats = {
  won: number;
  lost: number;
  wonAmount: number;
  lostAmount: number;
  /** suma de OTF (pago único) de los deals ganados del periodo */
  wonOtf: number;
  wonDeals: DealDTO[];
  lostDeals: DealDTO[];
};

export type Tone = "ok" | "warn" | "bad" | "neutral";

export type QualityCard = {
  label: string;
  value: string;
  note: string;
  modal: string;
  tone?: Tone;
  tooltip?: string;
  /** serie mensual sutil (últimos 6 meses); null = sin dato ese mes */
  trend?: (number | null)[];
};

/** Tendencia mensual con arrastre: últimos 6 meses calendario. */
export type MonthlyPulse = {
  /** etiquetas cortas de mes ("sep", "oct", …) */
  months: string[];
  /** monto abierto aproximado al cierre de cada mes (team y por comercial) */
  open: { team: number[]; byOwner: Record<string, number[]> };
  /** cantidad de deals abiertos aproximada al cierre de cada mes */
  openDeals?: { team: number[]; byOwner: Record<string, number[]> };
  /** monto abierto ponderado aproximado al cierre de cada mes */
  weighted?: { team: number[]; byOwner: Record<string, number[]> };
  /** monto ganado por mes */
  won: number[];
  /** monto ganado por mes y comercial */
  wonByOwner?: Record<string, number[]>;
  /** deals ganados por mes */
  wonDeals: number[];
  /** deals ganados por mes y comercial */
  wonDealsByOwner?: Record<string, number[]>;
  /** monto perdido por mes */
  lost?: number[];
  /** monto perdido por mes y comercial */
  lostByOwner?: Record<string, number[]>;
  /** deals perdidos por mes */
  lostDeals?: number[];
  /** deals perdidos por mes y comercial */
  lostDealsByOwner?: Record<string, number[]>;
  /** win rate por mes (0-100) */
  winRate?: { team: number[]; byOwner: Record<string, number[]> };
  /** ticket promedio de deals ganados por mes */
  avgWonTicket?: { team: number[]; byOwner: Record<string, number[]> };
  /** promedio de adobo_closing_score del pipeline abierto de cada mes (null sin dato) */
  adoboAvg: (number | null)[];
};

export type StageJourney = {
  deal: DealDTO;
  createdAt: string;
  /** Fecha real de primera entrada por etapa visible. */
  entered: Record<string, string>;
  /** Tiempo acumulado real informado por HubSpot, expresado en días. */
  days: Record<string, number>;
};

export type RiskSummary = {
  quota: number;
  won: number;
  remaining: number;
  weightedOpen: number;
  openQAmount: number;
  coverage: number;
  risk: Tone;
  riskReason: string;
  counts: { ok: number; warn: number; bad: number; neutral: number };
};

export type TrackingScope = {
  id: string;
  label: string;
  openCount: number;
  openAmount: number;
  onTrackYesCount: number;
  onTrackYesAmount: number;
  onTrackYesModal: string;
  onTrackNoCount: number;
  onTrackNoAmount: number;
  onTrackNoModal: string;
  atRiskCount: number;
  atRiskAmount: number;
  share: number;
  avgProbability: number;
  avgAdobo: number;
  deals: DealDTO[];
  allModal: string;
};

export type CloseHygieneScope = {
  id: string;
  label: string;
  monthLabel: string;
  openCount: number;
  monthCount: number;
  monthAmount: number;
  monthWeighted: number;
  overdueCount: number;
  overdueAmount: number;
  noDateCount: number;
  noDateAmount: number;
  stale2Count: number;
  stale2Amount: number;
  stale5Count: number;
  stale5Amount: number;
  pocOverdueCount: number;
  pocOverdueAmount: number;
  /** deals activos marcados como candidatos a perdido por prioridad/timing */
  lostPriorityCount: number;
  lostPriorityAmount: number;
  lostPriorityModal: string;
  /** deals activos marcados como candidatos a perdido por competencia */
  lostCompetitionCount: number;
  lostCompetitionAmount: number;
  lostCompetitionModal: string;
  healthPct: number;
  deals: (DealDTO & { daysLeft: number })[];
  monthModal: string;
  overdueModal: string;
  noDateModal: string;
  stale2Modal: string;
  stale5Modal: string;
  pocOverdueModal: string;
};




export type TaskHygieneScope = {
  id: string;
  label: string;
  openCount: number;
  noActivityCount: number;
  noActivityAmount: number;
  overdueTaskCount: number;
  overdueTaskAmount: number;
  overdueTaskTotal: number;
  todayTaskCount: number;
  todayTaskAmount: number;
  todayTaskTotal: number;
  healthPct: number;
  noActivityModal: string;
  overdueTaskModal: string;
  todayTaskModal: string;
  pendingModal: string;
};

export type OwnerRow = {
  id: string;
  name: string;
  openAmount: number;
  openCount: number;
  /** OTF en pipeline abierto */
  openOtf: number;
  weightedQ: number;
  avgProbability: number;
  avgScore: number;
  stages: { key: string; stageId: string; count: number }[];
  highProbability: number;
  lowProbabilityQ: number;
  closing7d: number;
  closingMonth: number;
  overdue: number;
  noCloseDate: number;
  noNextActivity: number;
  stale: number;
  wrQtd: { won: number; lost: number };
  wrQoQ: number;
  wrHist: { won: number; lost: number };
  /** monto perdido histórico del periodo seleccionado */
  lostAmount: number;
  /** ticket promedio de deals ganados del periodo */
  avgTicketWon: number;
};

export type WrBySegment = {
  inbound?: { won: number; lost: number };
  outbound?: { won: number; lost: number };
  upsell?: { won: number; lost: number };
  crossSell?: { won: number; lost: number };
};

export type QuotaRow = {
  id: string;
  name: string;
  status: "ok" | "warn" | "bad";
  statusLabel: string;
  wonQAmount: number;
  wonQCount: number;
  /** OTF ganado en el Q en curso */
  otfWonQ: number;
  /** OTF/12: aporte mensual que suma a la cuota */
  otfBonus: number;
  /** cumplimiento incluyendo el bonus OTF */
  attainmentBonus: number;
  /** OTF en deals abiertos del Q */
  openOtf: number;
  wonTrend: { period: string; amount: number; deals: number }[];
  wrQtd: { won: number; lost: number };
  wrQoQ: number;
  wrTrend: { period: string; rate: number }[];
  quota: number;
  attainment: number;
  gap: number;
  forecast: number;
  forecastPct: number;
  openQCount: number;
  remaining: number;
  weightedOpenQ: number;
  coverage: number;
  risk: Tone;
  riskReason: string;
  /** WR por segmento (inbound/outbound para AEs; upsell/crossSell para no-AEs) */
  wrBySegment: WrBySegment;
  /** Rol comercial: AE mide inbound/outbound, KAM mide upsell/cross sell */
  role?: "AE" | "KAM";
};

export type SegmentRow = {
  segment: string;
  qtd: { won: number; lost: number };
  qoq: number;
  hist: { won: number; lost: number };
};

export type AlertItem = {
  id: string;
  owner: string;
  name: string;
  reason: string;
  amount: number;
  url: string;
};

/** Deals marcados con warning (etapa 6.1) y sus motivos. */
export type WarningScope = {
  id: string;
  label: string;
  count: number;
  amount: number;
  reasons: { label: string; count: number; amount: number; modal: string }[];
  modal: string;
};

export type PlanBotStat = { period: string; count: number; amount: number; modal: string };

export type PlanBotRow = {
  key: string;
  label: string;
  byPeriod: Record<string, PlanBotStat>;
};

export type PlanBotScope = {
  id: string;
  name: string;
  rows: PlanBotRow[];
};

/* ---------------- Semáforo de contactabilidad ---------------- */

export type ContactTempBucket = {
  key: string;
  label: string;
  count: number;
  amount: number;
  /** promedio de adobo score con tope aplicado (-1 sin dato) */
  avgScore: number;
  share: number;
  tone: Tone;
  note: string;
  tooltip: string;
  modal: string;
};

export type ContactTempScope = {
  validation?: ContactAggregateEvidenceV1 | null;
  id: string;
  label: string;
  openCount: number;
  buckets: ContactTempBucket[];
  coldCount: number;
  coldAmount: number;
  coldModal: string;
  /** % del pipeline abierto en frío */
  coldPct: number;
};

export type PulseReport = {
  /** Global executive cards, independent of the report's selected role. */
  executiveStrip?: import('./executive-strip').ExecutiveStrip;
  contactSnapshot?: ContactSnapshotV1 | null;
  generatedAt: string;
  currentPeriod: string;
  currentLabel: string;
  /** Alcance de rol con el que se construyó el reporte (null = todo el equipo). */
  roleScope?: RoleFilter | null;
  /** MRR de todos los deals hoy en Inicio de servicio; nunca se filtra en la UI. */
  activeMrr?: {
    value: number;
    count: number;
    history: { date: string; value: number; count: number }[];
    /** Entradas reales a Inicio de servicio, para series por año/Q/mes/semana. */
    entries?: { id: string; name: string; owner: string; date: string; mrr: number }[];
    lastStart?: { date: string; name: string } | null;
    /** Deals en servicio excluidos porque la empresa asociada está en churn. */
    churnedExcluded?: number;
    /** Monto en etapa 6 (firmado) o 7 (en desarrollo) que esperamos incorporar. */
    inDevelopment?: { value: number; count: number };
  };
  team: {
    openAmount: number;
    openCount: number;
    weightedQ: number;
    wonQAmount: number;
    wonQCount: number;
    wonOtfQ: number;
    openOtf: number;
    quotaTotal: number;
    quotaPct: number;
    wr: { won: number; lost: number };
  };
  quality: { id: string; label: string; cards: QualityCard[] }[];
  tracking: TrackingScope[];
  closeHygiene: CloseHygieneScope[];
  taskHygiene: TaskHygieneScope[];
  risk: RiskSummary;
  /** etapa 6 firmada → 6.2 proyecto en desarrollo (equipo y por comercial) */
  rampDev: import("./team-types").RampScope[];
  /** deals ganados por plan de bot (equipo y por comercial) */
  planBot: PlanBotScope[];
  /** deals con warning (etapa 6.1) por motivo, equipo y por comercial */
  warnings?: WarningScope[];
  /** recorrido post-firma: avance a kick off, portal cliente, contratos y finanzas */
  delivery: DeliveryScope[];
  /** semáforo de contactabilidad (equipo y por comercial) */
  contactTemp?: ContactTempScope[];
  /** capa Adobo: calidad, forecast real, por qué ganamos/perdemos, riesgos y gestión */
  adobo: AdoboLayer;
  /** tendencias mensuales con arrastre (6 meses) para sparklines y gráfico por comercial */
  monthly: MonthlyPulse;
  /** Base compacta para Tiempo por etapas, Deal Velocity y el pipeline animado. */
  stageJourneys: StageJourney[];



  periods: {
    years: string[];
    periods: string[];
    owners: Record<string, string>;
    ownerEmails: Record<string, string>;
    quotas: Record<string, Record<string, number>>;
    data: Record<string, { team: PeriodStats; owners: Record<string, PeriodStats> }>;
  };
  quotaRows: QuotaRow[];
  ownerRows: OwnerRow[];
  segments: SegmentRow[];
  alerts: AlertItem[];
  drilldowns: Record<string, Drilldown>;
};

export type PartnerStage = { key: string; label: string; id: string };

export type PartnerRow = {
  id: string;
  name: string;
  comerciales: string[];
  openAmount: number;
  openCount: number;
  weightedQ: number;
  avgProbability: number;
  stages: { key: string; count: number }[];
  wonQAmount: number;
  wonQCount: number;
  wonHistAmount: number;
  wonHistCount: number;
  lostAmount: number;
  lostCount: number;
  wr: { won: number; lost: number };
  trend: { period: string; amount: number; deals: number }[];
  cumulative: { period: string; amount: number }[];
};

export type SourceRow = {
  id: string;
  source: string;
  isPartner: boolean;
  openAmount: number;
  openCount: number;
  wonQAmount: number;
  wonHistAmount: number;
  wr: { won: number; lost: number };
};

export type PartnerReport = {
  generatedAt: string;
  currentPeriod: string;
  currentLabel: string;
  totals: {
    openAmount: number;
    openCount: number;
    weightedQ: number;
    wonQAmount: number;
    wonQCount: number;
    wonHistAmount: number;
    wonHistCount: number;
    wr: { won: number; lost: number };
    partnerCount: number;
  };
  stageColumns: PartnerStage[];
  periods: string[];
  partners: PartnerRow[];
  sources: SourceRow[];
  alerts: AlertItem[];
  drilldowns: Record<string, Drilldown>;
};
