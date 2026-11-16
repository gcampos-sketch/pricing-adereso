/** Tipos del reporte "Calidad Comercial" (oportunidades de mejora por reunión). */

export type CoachingStatus = "pendiente" | "abordado";

export type CoachingRow = {
  /** clave del evento histórico: coaching-improvement/<diio_id> */
  eventKey: string;
  dealId: string;
  dealName: string;
  ownerId: string;
  ownerName: string;
  /** fecha de la reunión analizada (ISO) o null si no viene */
  date: string | null;
  /** A/B/C exclusively from verified Diio evidence; never a legacy snapshot. */
  meetingType: string;
  /** Stage recorded by the historical event; never replaced by the current deal stage. */
  stage: string;
  categoryKey: string;
  categoryLabel: string;
  evidence: string | null;
  status: CoachingStatus;
  actionNote: string | null;
  closedAt: string | null;
  meetingId?: string;
  meetingUrl?: string;
  classification?: string;
  sourceDocument?: string;
  persisted?: boolean;
};

export type CoachingReport = {
  generatedAt: string;
  evidenceVersion?: string;
  evidenceSourceAt?: string;
  snapshots?: CoachingSnapshot[];
  coverage?: {
    partial: true;
    source: string;
    candidates: number;
    verified: number;
    pending: number;
    pendingReasons?: { reason: string; count: number }[];
    legacyRows: number;
    firstDate: string | null;
    lastDate: string | null;
    note: string;
  };

  years: string[];
  owners: { id: string; name: string }[];
  /** orden oficial de categorías de HubSpot */
  categories: { key: string; label: string }[];
  rows: CoachingRow[];
};

/** Acción sugerida por categoría (guía de coaching, no dato de HubSpot). */
export const COACHING_ACTIONS: Record<string, string> = {
  romper_hielo: "Abrir la reunión con contexto del cliente antes de entrar a producto.",
  levantamiento_dolores: "Usar pauta de 3 preguntas de dolor antes de pasar a solución.",
  demo_valor_agregado: "Amarrar cada capacidad mostrada al dolor operativo y al valor económico.",
  consultoria_valor_agregado:
    "Aportar una recomendación concreta del negocio del cliente, no solo features.",
  cierre_timing_proximos_pasos:
    "Definir próximo paso con fecha y dueño antes de cerrar la reunión.",
};

/** Current deal state, never a historical meeting or a unique-meeting count. */
export type CoachingSnapshot = {
  dealId: string;
  dealName: string;
  ownerId: string;
  ownerName: string;
  stage: string;
  date: string | null;
  meetingId: string | null;
  rawMeetingType: string;
  categoryKey: string;
  categoryLabel: string;
  evidence: string | null;
  informationQuality: string | null;
  recordedMeetingCount: number | null;
};
