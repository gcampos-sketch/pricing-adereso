import { useEffect, useState } from 'react';

/** Elapsed waiting is reassurance, never an invented progress milestone. */
export function scheduleLoadingWait(show: (message: string) => void) {
  const moment = setTimeout(() => show('Un momentito…'), 8_000);
  const longer = setTimeout(() => show('Está tomando más tiempo de lo habitual…'), 20_000);
  return () => { clearTimeout(moment); clearTimeout(longer); };
}

export function useLoadingWait(message: string, active: boolean) {
  const [notice, setNotice] = useState({ message, text: '' });
  useEffect(() => {
    setNotice({ message, text: '' });
    if (!active) return;
    return scheduleLoadingWait(text => setNotice({ message, text }));
  }, [message, active]);
  return active && notice.message === message ? notice.text : '';
}
