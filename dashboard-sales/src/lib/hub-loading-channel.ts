export const HUB_LOADING_EVENT = 'adereso:loading/v1';
export function canShareHubLoading() {
  try { return window.top !== window && window.top?.location.origin === window.location.origin && window.top.document.documentElement.dataset['hubLoadingHost'] === 'true'; }
  catch { return false; }
}
export function beginSharedHubLoading(message = '') {
  if (!canShareHubLoading()) return null;
  const id = crypto.randomUUID();
  let closed = false;
  const send = (action: string, success?: boolean) => window.top!.postMessage({ type: HUB_LOADING_EVENT, action, id, message, success }, window.location.origin);
  send('start');
  return {
    update(nextMessage: string) { if (!closed && nextMessage !== message) { message = nextMessage; send('update'); } },
    finish(success: boolean) { if (!closed) { closed = true; send('end', success); } },
    cancel() { if (!closed) { closed = true; send('cancel'); } },
  };
}

/** Only visible descendants of the authenticated private Hub can control its loader. */
export function isActiveHubSource(frame: HTMLIFrameElement | null, source: MessageEventSource | null, visibleOnly = true): boolean {
  const visit = (win: Window, depth: number): boolean => {
    if (win === source) return true;
    if (depth > 4) return false;
    try {
      for (const child of [...win.document.querySelectorAll('iframe')].slice(0, 24)) {
        const rect = child.getBoundingClientRect();
        if ((!visibleOnly || rect.width > 0 && rect.height > 0) && child.contentWindow && visit(child.contentWindow, depth + 1)) return true;
      }
    } catch { /* Third-party pages remain outside the same-origin loading channel. */ }
    return false;
  };
  return !!frame?.contentWindow && visit(frame.contentWindow, 0);
}
