import { useSyncExternalStore } from 'react';
import { currentReportPhase, subscribeReportPhase } from '@/lib/report-phase-client';
export function useReportPhase(key: string) {
  return useSyncExternalStore(changed => subscribeReportPhase(key, changed), () => currentReportPhase(key), () => undefined);
}
