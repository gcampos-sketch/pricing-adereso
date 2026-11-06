import type { Drilldown, Tone } from "./pulse-types";

export type ScoreComponent = {
  key: string;
  label: string;
  weight: number;
  /** 0-100 */
  score: number;
  /** aporte al score final */
  points: number;
  detail: string;
};

export type RepPeriodStat = {
  period: string;
  quota: number;
  wonAmount: number;
  wonCount: number;
  lostAmount: number;
  lostCount: number;
  attainment: number;
  wr: { won: number; lost: number };
  meetings: number;
  warningCount: number;
  warningAmount: number;
  score: number;
  tone: Tone;
  components: ScoreComponent[];
  wonModal: string;
  lostModal: string;
};

export type RepMonthStat = {
  month: string;
  label: string;
  wonAmount: number;
  wonCount: number;
};

export type StageTime = {
  key: string;
  avgDays: number;
  count: number;
  teamAvgDays: number;
};

export type RepScorecard = {
  id: string;
  name: string;
  tenureStart: string;
  tenureLabel: string;
  tenureMonths: number;
  /** snapshot de gestión (pipeline abierto hoy) */
  openAmount: number;
  openCount: number;
  weightedQ: number;
  onTrackCount: number;
  onTrackAmount: number;
  onTrackPct: number;
  offTrackCount: number;
  pinzasCount: number;
  pinzasAmount: number;
  noNextActivity: number;
  overdueCount: number;
  overdueAmount: number;
  avgAdobo: number;
  currentStageDays: number;
  cycleDays: number;
  teamCycleDays: number;
  stageTimes: StageTime[];
  wrHist: { won: number; lost: number };
  periods: RepPeriodStat[];
  months: RepMonthStat[];
  lostReasons: { reason: string; count: number; amount: number }[];
  modals: {
    open: string;
    weighted: string;
    onTrack: string;
    offTrack: string;
    pinzas: string;
    overdue: string;
    noActivity: string;
  };
};

export type TeamScorecardReport = {
  generatedAt: string;
  currentPeriod: string;
  currentLabel: string;
  periods: string[];
  years: string[];
  reps: RepScorecard[];
  weights: { key: string; label: string; weight: number; help: string }[];
  wrCross: WrScope[];
  ramp: RampScope[];
  rampDev: RampScope[];
  drilldowns: Record<string, Drilldown>;
};

export type WrBucketStat = { won: number; lost: number; wonAmount: number; lostAmount: number };

export type WrBucket = {
  key: string;
  label: string;
  byPeriod: Record<string, WrBucketStat>;
  wonModal: string;
  lostModal: string;
};

export type WrDimension = {
  id: string;
  label: string;
  help: string;
  buckets: WrBucket[];
};

export type WrScope = {
  id: string;
  name: string;
  isAE: boolean;
  dimensions: WrDimension[];
};

export type RampPeriodStat = {
  period: string;
  /** días entre entrada a etapa 6 (propuesta firmada) e inicio de servicio */
  days: number[];
  mrrSum: number;
  pendingCount: number;
  pendingDays: number[];
  modal: string;
  pendingModal: string;
};

export type RampScope = {
  id: string;
  name: string;
  periods: RampPeriodStat[];
};
