export const REPORT_VIEWS = ['comercial', 'proyectos', 'partners', 'equipo', 'crecimiento', 'simulador', 'embudo', 'perdidos', 'calidad', 'diagnostico', 'pipeline', 'forecast', 'conversion'] as const;
export type ReportView = typeof REPORT_VIEWS[number];
const KEY = 'adereso_report_view_v1';

export function readReportView(): ReportView {
  try {
    const saved = sessionStorage.getItem(KEY);
    return REPORT_VIEWS.find(view => view === saved) ?? 'comercial';
  } catch { return 'comercial'; }
}

export function saveReportView(view: ReportView) {
  try { sessionStorage.setItem(KEY, view); } catch { /* Navigation still works without storage. */ }
}

/** These views reuse one mounted Pulse report, its filters and its query cache. */
const PULSE_SECTIONS = { comercial: 'general', proyectos: 'proyectos', embudo: 'embudo', pipeline: 'pipeline', forecast: 'forecast', conversion: 'conversion' } as const;
export type PulseSection = typeof PULSE_SECTIONS[keyof typeof PULSE_SECTIONS];
export function isPulseReportView(view: ReportView): view is keyof typeof PULSE_SECTIONS {
  return Object.prototype.hasOwnProperty.call(PULSE_SECTIONS, view);
}
export function pulseSectionForView(view: ReportView): PulseSection {
  return isPulseReportView(view) ? PULSE_SECTIONS[view] : 'general';
}
export const PULSE_FOCUS_PAGES = [
  { id: 'pipeline', title: 'Pipeline y reuniones', description: 'Generación, reuniones y avance de oportunidades.' },
  { id: 'forecast', title: 'Forecast y prioridades', description: 'Qué trabajar hoy, próximos cierres y calidad de la gestión.' },
  { id: 'conversion', title: 'Resultados y conversión', description: 'Win rate, ticket promedio y comparación por comercial.' },
] as const;
export type PulseFocusView = typeof PULSE_FOCUS_PAGES[number]['id'];
