import { REPORT_PHASE_LABELS, type ReportPhase } from './report-phases';
const EVENT = 'adereso:report-phase';
const phases = new Map<string, ReportPhase>();
export function recordReportPhase(key: string, phase: ReportPhase) {
  phases.set(key, phase);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { key, phase } }));
}
export function currentReportPhase(key: string) { const phase = phases.get(key); return phase ? REPORT_PHASE_LABELS[phase] : undefined; }
export function subscribeReportPhase(key: string, changed: () => void) {
  const listener = (event: Event) => { if ((event as CustomEvent).detail?.key === key) changed(); };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
