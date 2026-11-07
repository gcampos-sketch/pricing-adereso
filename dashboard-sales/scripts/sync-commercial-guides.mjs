/** Called after a verified Notion edit requested in chat; no Notion credentials reach the browser. */
import { createHash } from 'node:crypto';
const selected=process.argv.slice(2);
if(!selected.length||selected.some(x=>!['playbook','operativa'].includes(x)))throw Error('Use: sync-commercial-guides.mjs playbook|operativa [playbook|operativa]');
const env=process.env;for(const k of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','ACADEMY_SYNC_SECRET'])if(!env[k])throw Error('Missing '+k);
const headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
if(!env.SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_secret_'))headers.Authorization='Bearer '+env.SUPABASE_SERVICE_ROLE_KEY;
for(const source of new Set(selected)){
 const r=await fetch(env.SUPABASE_URL+'/rest/v1/rpc/academy_request_sync',{method:'POST',headers,body:JSON.stringify({p_source:source})});if(!r.ok)throw Error('Could not enqueue '+source);
}
const r=await fetch('https://adereso-hub-comercial.onrender.com/api/academy/sync',{method:'POST',headers:{Authorization:'Bearer '+env.ACADEMY_SYNC_SECRET},signal:AbortSignal.timeout(420000)});
if(!r.ok)throw Error('Sync request failed: '+r.status);const result=await r.json();console.log(JSON.stringify(result));
for(const source of new Set(selected)){
 const stateResponse=await fetch(env.SUPABASE_URL+'/rest/v1/academy_source_state?source=eq.'+source+'&select=version,pending,error_code,checked_at',{headers});
 if(!stateResponse.ok)throw Error('Could not verify '+source);const [state]=await stateResponse.json();
 if(!state?.version||state.pending||state.error_code)throw Error(source+' not yet synchronized; retry after the current worker finishes');
 const data=await fetch(env.SUPABASE_URL+'/rest/v1/academy_source_versions?source=eq.'+source+'&version=eq.'+state.version+'&select=payload',{headers});if(!data.ok)throw Error('Snapshot unavailable');const [row]=await data.json();
 const version=createHash('sha256').update(JSON.stringify(row.payload.documents.map(d=>[d.id,d.hash,d.sourceEditedAt]))).digest('hex');
 if(version!==state.version)throw Error('Published version mismatch');
 console.log(JSON.stringify({source,verified:true,version,checkedAt:state.checked_at,documents:row.payload.documents.length}));
}
