import { useEffect, useRef } from 'react';
import { beginSharedHubLoading } from '@/lib/hub-loading-channel';

/** Retains the task through the actual query, including its error outcome. */
export function useSharedReportLoading(pending: boolean, success: boolean, message: string) {
  const task = useRef<ReturnType<typeof beginSharedHubLoading>>(null);
  useEffect(() => {
    if (pending) { if (!task.current) task.current = beginSharedHubLoading(message); else task.current.update(message); }
    else { task.current?.finish(success); task.current = null; }
  }, [pending, success, message]);
  useEffect(() => () => { task.current?.cancel(); task.current = null; }, []);
}
