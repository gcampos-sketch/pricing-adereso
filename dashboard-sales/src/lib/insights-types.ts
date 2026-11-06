import type { DealDTO } from "./pulse-types";

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
  lostStage: string;
  lostStageDays: number;
  daysToKickoff: number | null;
  daysToService: number | null;
  onTrack: string | null;
  createdAt: string;
  /** objeción principal registrada por Adobo (adobo_current_objecion) */
  objection: string | null;
  /** actividades del deal (solo deals perdidos por ghosting); null si no aplica */
  ghost: { emails: number; calls: number; whatsapp: number } | null;
};

export type InsightsReport = {
  generatedAt: string;
  currentPeriod: string;
  periods: string[];
  years: string[];
  owners: { id: string; name: string }[];
  quotas: Record<string, Record<string, number>>;
  deals: InsightDeal[];
};
