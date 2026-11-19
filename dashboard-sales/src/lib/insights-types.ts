import type { DealDTO } from "./pulse-types";

import type { LossClusterFields, LOSS_CLUSTER_VERSION } from "./loss-monthly-clusters";

export type DealFamily = "Expansión" | "Venta nueva" | "Renovación" | "Sin clasificar";
export type DealMotion = "Upsell" | "Cross sell" | "Venta nueva" | "Renovación" | "Sin clasificar";
export type SizeBucket = "SMB" | "Mid Market" | "Enterprise" | "Sin dato";
export type DealStatus = "won" | "lost" | "open";

export type InsightDeal = DealDTO & {
  ownerId: string;
  status: DealStatus;
  /** trimestre de referencia: cierre para ganados/perdidos, cierre estimado para abiertos */
  period: string;
  family: DealFamily;
  motion: DealMotion;
  mrr: number;
  products: string[];
  size: string;
  sizeBucket: SizeBucket;
  sourceLabel: string;
  stageKey: string;
  stageDays: number;
  lostReason: string | null;
  lostReasonText: string | null;
  /** Exact native closed_lost_reason free text, without category/development fallback. */
  lostReasonNarrative?: string | null;
  lostStage: string;
  lostStageDays: number;
  /** Native entry to the current exact lost stage; never falls back to close/creation. Absent in older editions. */
  lostEnteredAt?: string | null;
  lossClusters?: LossClusterFields;
  daysToKickoff: number | null;
  daysToService: number | null;
  onTrack: string | null;
  createdAt: string;
  /** objeción principal registrada por Adobo (adobo_current_objecion) */
  objection: string | null;
  /** actividades del deal (solo deals perdidos por ghosting); null si no aplica */
  ghost: { emails: number; calls: number; whatsapp: number | null } | null;
};

export type InsightsReport = {
  lossClusterVersion?: typeof LOSS_CLUSTER_VERSION;
  lossCompanySizeAvailable?: boolean;
  lossNarrativesVersion?: "closed-lost-reason/v1";
  lossEntryDatesVersion?: "native-loss-entry/v1";
  generatedAt: string;
  currentPeriod: string;
  periods: string[];
  years: string[];
  owners: { id: string; name: string }[];
  quotas: Record<string, Record<string, number>>;
  deals: InsightDeal[];
};
