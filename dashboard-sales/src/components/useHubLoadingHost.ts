import { useEffect, useRef, useState, type RefObject } from 'react';
import { HubLoadingState, type LoadingSnapshot } from '@/lib/hub-loading-state';
import { HUB_LOADING_EVENT, isActiveHubSource } from '@/lib/hub-loading-channel';

export function useHubLoadingHost(frame: RefObject<HTMLIFrameElement | null>, bootPending: boolean) {
  const [snapshot, setSnapshot] = useState<LoadingSnapshot>({ visible: true, complete: false, revealed: false, message: '' });
  const host = useRef<HubLoadingState | null>(null);
  useEffect(() => {
    const state = new HubLoadingState(setSnapshot); host.current = state;
    const previous = document.documentElement.dataset['hubLoadingHost'];
    document.documentElement.dataset['hubLoadingHost'] = 'true';
    const message = (event: MessageEvent) => {
      if (event.origin !== location.origin || !event.data || event.data.type !== HUB_LOADING_EVENT) return;
      if (!isActiveHubSource(frame.current, event.source, false)) return;
      const { action, id, message: label, success } = event.data;
      if (action === 'navigate' && event.source === frame.current?.contentWindow) {
        state.activate(source => isActiveHubSource(frame.current, source as Window)); return;
      }
      if (typeof id !== 'string' || id.length > 100) return;
      const source = event.source as object;
      if (action === 'start') state.start(id, source, typeof label === 'string' ? label.slice(0, 100) : '', isActiveHubSource(frame.current, event.source));
      else if (action === 'update') state.update(id, source, typeof label === 'string' ? label.slice(0, 100) : '');
      else if (action === 'end' || action === 'cancel') state.end(id, source, action === 'end' ? success === true : undefined);
    };
    window.addEventListener('message', message);
    return () => { state.dispose(); host.current = null; window.removeEventListener('message', message); if (previous === undefined) delete document.documentElement.dataset['hubLoadingHost']; else document.documentElement.dataset['hubLoadingHost'] = previous; };
  }, [frame]);
  useEffect(() => { host.current?.setBoot(bootPending); }, [bootPending]);
  return { ...snapshot, finish: () => host.current?.finished() };
}
