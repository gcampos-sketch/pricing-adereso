export const REPORT_PHASE_LABELS = {
  access: 'Confirmando acceso al reporte',
  snapshot: 'Buscando la última vista disponible',
  records: 'Consultando negocios, equipo y metas',
  metrics: 'Calculando pipeline e indicadores',
  mrr: 'Revisando MRR y proyectos',
  tasks: 'Revisando tareas y próximos pasos',
  assembling: 'Organizando tu dashboard',
  ready: 'Preparando la vista',
} as const;
export type ReportPhase = keyof typeof REPORT_PHASE_LABELS;
export function isReportPhase(value: unknown): value is ReportPhase { return typeof value === 'string' && Object.hasOwn(REPORT_PHASE_LABELS, value); }
