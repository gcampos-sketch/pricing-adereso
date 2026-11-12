import type { PulseReport } from './pulse-types';
import type { ReportPhase } from './report-phases';
import { SERVICE_MRR_CALCULATION } from './service-mrr';

/** The regular function and streaming transport use the same authorized report build. */
export async function readPulseReport(fresh: boolean, role?: 'AE' | 'KAM', phase: (phase: ReportPhase) => void = () => {}, force = false) {
  const [{ buildPulseReport }, { withSnapshot, readActiveMrrHistory }] = await Promise.all([import('./pulse.server'), import('./report-cache.server')]);
  const key = role ? `pulse-${role.toLowerCase()}` : 'pulse';
  phase('snapshot');
  return withSnapshot(key, fresh, async () => {
    if (fresh) (await import('./hubspot.server')).invalidateCache('adobo-history:');
    const history = fresh ? await readActiveMrrHistory(key) : undefined;
    const previous = history ? ({ activeMrr: { calculation: SERVICE_MRR_CALCULATION, history } } as unknown as PulseReport) : undefined;
    return buildPulseReport(previous, role, phase);
  }, report => report.activeMrr?.calculation === SERVICE_MRR_CALCULATION, force);
}
