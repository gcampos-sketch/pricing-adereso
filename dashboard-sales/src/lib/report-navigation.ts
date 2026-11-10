export const REPORT_VIEWS = ['comercial', 'proyectos', 'partners', 'equipo', 'crecimiento', 'simulador', 'embudo', 'perdidos', 'calidad', 'diagnostico'] as const;
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
