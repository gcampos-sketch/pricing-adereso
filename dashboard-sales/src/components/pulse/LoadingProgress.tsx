import type { ReactNode } from 'react';
import { HubLoading } from '@/components/HubLoading';

/** Same visual loader as the Hub; embedded reports delegate to its single host. */
export function LoadingProgress({ tabs, title = 'Consultando datos comerciales' }: { tabs?: ReactNode; title?: string }) {
  return <main className="pulse-main" aria-busy="true">{tabs}<HubLoading message={title} /></main>;
}
