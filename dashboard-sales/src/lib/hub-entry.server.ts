import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../integrations/supabase/client.server';
import { verifyHubIdentity } from './hub-auth.server';
import { createHubEntryGateway } from './hub-entry-gateway';

const db = supabaseAdmin as unknown as SupabaseClient;
export const handleHubEntryRequest = createHubEntryGateway({
  verify: verifyHubIdentity,
  publicOrigin: process.env['RENDER_EXTERNAL_URL'],
  record: async (userId, visitId, sessionId) => {
    const { error } = await db.from('hub_entry_events').upsert({ user_id: userId, visit_id: visitId, auth_session_id: sessionId }, {
      onConflict: 'user_id,visit_id', ignoreDuplicates: true,
    });
    if (error) throw new Error('entry_storage_unavailable');
  },
});
