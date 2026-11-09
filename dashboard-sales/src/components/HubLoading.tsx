import { useEffect, useId, useRef, useState } from 'react';
import wordmark from '../../../logoadereso.webp';
import { mountLoadingPace } from '@/lib/loading-pace';
import { completeLoading } from '@/lib/loading-completion';
import { beginSharedHubLoading, canShareHubLoading } from '@/lib/hub-loading-channel';
import { useLoadingWait } from './useLoadingWait';

// Clip the original artwork into its three separate lobes, preserving its edges.
const LOBES = [
  '48,1 49,0 67,0 71,1 80,4 84,6 90,10 94,13 100,19 103,23 105,26 110,36 111,39 112,43 113,49 113,64 112,69 111,73 110,76 108,81 107,82 98,82 95,81 89,78 86,76 82,72 80,69 78,65 48,2',
  '0,46 1,41 3,35 7,27 11,21 21,11 23,10 28,10 31,11 36,13 38,14 44,18 53,27 55,30 58,36 58,40 8,83 6,83 5,82 4,80 1,71 0,67',
  '20,96 21,92 22,89 24,84 27,79 29,76 33,71 36,68 41,64 44,62 52,58 58,56 60,56 94,96 94,99 91,102 88,104 83,107 81,108 76,110 73,111 69,112 63,113 49,113 44,112 40,111 34,109 26,105 23,103 20,100',
];

/** Shared logo, actual task and reassurance during prolonged waits. */
export function HubLoading({ complete = false, onComplete, message = 'Preparando la página' }: { complete?: boolean; onComplete?: () => void; message?: string } = {}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const root = useRef<HTMLElement>(null);
  const done = useRef(onComplete);
  done.current = onComplete;
  const [delegated] = useState(canShareHubLoading);
  const task = useRef<ReturnType<typeof beginSharedHubLoading>>(null);
  useEffect(() => {
    if (!delegated) return;
    task.current = beginSharedHubLoading();
    return () => { task.current?.cancel(); task.current = null; };
  }, [delegated]);
  useEffect(() => { if (delegated) task.current?.update(message); }, [delegated, message]);
  useEffect(() => {
    if (delegated) { if (complete) { task.current?.finish(true); done.current?.(); } return; }
    if (!root.current) return;
    return complete ? completeLoading(root.current, () => done.current?.()) : mountLoadingPace(root.current);
  }, [complete, delegated]);
  const currentMessage = message.trim() || 'Preparando la página';
  const waitNotice = useLoadingWait(currentMessage, !delegated && !complete);
  if (delegated) return null;
  return <section ref={root} className="hub-loading" role="status" aria-label={complete ? 'Carga completa' : 'Cargando'}>
    <div className="hub-loading-center">
    <svg className="hub-loading-symbol" viewBox="-6 -6 125 125" aria-hidden="true">
      <defs>
        {LOBES.map((points, index) => <clipPath key={index} id={`${id}-lobe-${index}`}><polygon points={points} /></clipPath>)}
      </defs>
      {LOBES.map((_, index) => <g key={index} clipPath={`url(#${id}-lobe-${index})`}>
        <image className="hub-loading-lobe" href={wordmark} width="566" height="113" />
      </g>)}
    </svg>
    {!complete && <p className="hub-loading-message"><span key={currentMessage} className="hub-loading-task">{currentMessage}</span>{waitNotice && <span key={waitNotice} className="hub-loading-wait">{waitNotice}</span>}</p>}
    </div>
  </section>;
}
