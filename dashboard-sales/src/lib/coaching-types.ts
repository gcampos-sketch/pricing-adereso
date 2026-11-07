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
  /** Tipo A / Tipo B según adobo_last_reu_tipo */
  meetingType: string;
  /** etapa gestionable del negocio (E1-E5.1) o "" si está fuera de rango */
  stage: string;
  categoryKey: string;
  categoryLabel: string;
  evidence: string | null;
  status: CoachingStatus;
  actionNote: string | null;
  closedAt: string | null;
};

export type CoachingReport = {
  generatedAt: string;
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
  consultoria_valor_agregado: "Aportar una recomendación concreta del negocio del cliente, no solo features.",
  cierre_timing_proximos_pasos: "Definir próximo paso con fecha y dueño antes de cerrar la reunión.",
};
