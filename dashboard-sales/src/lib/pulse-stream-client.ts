import { supabase } from '@/integrations/supabase/client';
import { readTrustToken } from './mfa-trust';
import { decodeReportStream } from './report-stream';
import { recordReportPhase } from './report-phase-client';

export async function fetchPulseStream(key: string, role?: 'AE' | 'KAM', signal?: AbortSignal) {
  recordReportPhase(key, 'access');
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Invalid token: no hay sesión');
  const trust = readTrustToken();
  const response = await fetch('/api/reports/pulse-stream', { method: 'POST', credentials: 'same-origin', signal: signal ?? null,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token, ...(trust ? { 'x-mfa-trust': trust } : {}) },
    body: JSON.stringify({ role }),
  });
  return decodeReportStream<unknown>(response, phase => recordReportPhase(key, phase));
}
