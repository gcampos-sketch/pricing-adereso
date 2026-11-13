import {createHash,timingSafeEqual} from 'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
const id=v=>Number.isSafeInteger(v)&&v>0||typeof v==='string'&&/^\d{1,30}$/.test(v);
const int=v=>Number.isSafeInteger(v)&&v>=0;
const values=['Inbound','Outbound','No aplica',''];
export function validSignature(body, signature, secret) {
  if(!Buffer.isBuffer(body)||typeof secret!=='string'||!secret||typeof signature!=='string'||!/^[a-f0-9]{64}$/i.test(signature))return false;
  const expected=createHash('sha256').update(secret).update(body).digest();
  return timingSafeEqual(expected,Buffer.from(signature,'hex'));
}
export function normalize(event,config) {
  if(!event||String(event.portalId)!==config.portalId||String(event.appId)!==config.appId||!id(event.eventId)||!id(event.subscriptionId)||!int(event.occurredAt))throw Error('invalid_event');
  if(event.occurredAt<config.captureStart||event.occurredAt>config.now+300000)throw Error('outside_capture');
  const base={portalId:config.portalId,appId:config.appId,eventId:String(event.eventId),subscriptionId:String(event.subscriptionId),occurredAt:event.occurredAt,type:event.subscriptionType};
  if(event.subscriptionType==='deal.creation') {
    if(!id(event.objectId))throw Error('invalid_event');
    return {...base,dealId:String(event.objectId)};
  }
  if(event.subscriptionType==='contact.propertyChange') {
    if(!id(event.objectId)||event.propertyName!=='tipo_de_adquisicion'||!values.includes(event.propertyValue))throw Error('unsupported_property');
    return {...base,contactId:String(event.objectId),value:event.propertyValue};
  }
  if(['deal.associationChange','contact.associationChange'].includes(event.subscriptionType)) {
    const reverse=event.subscriptionType==='contact.associationChange';
    if(event.associationType!==(reverse?'CONTACT_TO_DEAL':'DEAL_TO_CONTACT')||!id(event.fromObjectId)||!id(event.toObjectId)||typeof event.associationRemoved!=='boolean')throw Error('unsupported_association');
    return {...base,dealId:String(reverse?event.toObjectId:event.fromObjectId),contactId:String(reverse?event.fromObjectId:event.toObjectId),removed:event.associationRemoved};
  }
  // Merge/deletion/restore and other subscriptions require explicit handling, not inferred support.
  throw Error('unsupported_event');
}
export function eventKey(event){return sha(JSON.stringify(event));}
export function createReceiver({secret,portalId,appId,captureStart,persistBatch,now=Date.now,maxBytes=262144}) {
  if(typeof secret!=='string'||!secret||!id(portalId)||!id(appId)||!int(captureStart)||typeof persistBatch!=='function'||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>262144)throw Error('invalid_configuration');
  return async request=>{
    if(request.method!=='POST')return new Response(null,{status:405});
    if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return new Response(null,{status:415});
    // This adapter is ONLY for the documented v1 legacy webhook body signature.
    // Never silently downgrade v2/v3 traffic to v1; verify actual app delivery before activation.
    const version=request.headers.get('x-hubspot-signature-version');
    if(version&&version!=='v1'||request.headers.has('x-hubspot-signature-v3'))return new Response(null,{status:401});
    let reader;const chunks=[];let size=0;
    try {
      reader=request.body?.getReader();if(!reader)return new Response(null,{status:400});
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();return new Response(null,{status:413});}chunks.push(value);}
      const raw=Buffer.concat(chunks);
      if(!validSignature(raw,request.headers.get('x-hubspot-signature'),secret))return new Response(null,{status:401});
      let events;try{events=JSON.parse(raw.toString('utf8'));}catch{return new Response(null,{status:400});}
      if(!Array.isArray(events)||!events.length||events.length>100)return new Response(null,{status:400});
      let records;try{records=events.map(e=>normalize(e,{portalId:String(portalId),appId:String(appId),captureStart,now:now()})).map(e=>({eventKey:eventKey(e),event:e}));}catch{return new Response(null,{status:422});}
      // Contract: one durable atomic transaction, deduplicate eventKey, reject conflicting content.
      // Never acknowledge before commit or start discarded background promises.
      try{await persistBatch(records);}catch{return new Response(null,{status:503});}
      return new Response(null,{status:204});
    } catch {return new Response(null,{status:400});} finally{reader?.releaseLock();}
  };
}
export function reconstructSnapshot({dealId,createdAt,pipeline,pipelines,dealTypeAtCreation,renewalValue,events,history,coverage}) {
  const pending=reason=>({status:'pending',reason,value:null,writeAllowed:false});
  if(!id(dealId)||!int(createdAt)||!pipelines.includes(pipeline))return pending('invalid_or_out_of_scope');
  if(!coverage?.associationAtCreationVerified||!coverage?.historyComplete||!coverage?.captureComplete||coverage?.invalidatingEvent)return pending('unproven_coverage');
  if(!dealTypeAtCreation)return pending('type_missing_at_creation');
  if(dealTypeAtCreation===renewalValue)return {status:'candidate',value:'No aplica',writeAllowed:false};
  const creation=events.filter(e=>e.type==='deal.creation'&&e.dealId===String(dealId)&&e.occurredAt===createdAt);
  if(!creation.length)return pending('creation_missing');
  const assoc=events.filter(e=>e.dealId===String(dealId)&&e.contactId&&e.type.endsWith('.associationChange')&&e.occurredAt<=createdAt);
  const active=[];
  for(const contactId of new Set(assoc.map(e=>e.contactId))){const rows=assoc.filter(e=>e.contactId===contactId);const t=Math.max(...rows.map(e=>e.occurredAt));const states=new Set(rows.filter(e=>e.occurredAt===t).map(e=>e.removed));if(states.size!==1)return pending('association_conflict');if(states.has(false))active.push(contactId);}
  if(active.length!==1)return pending('ambiguous_contact');
  const rows=history.filter(v=>v.contactId===active[0]&&int(v.timestamp)&&v.timestamp<=createdAt);
  if(!rows.length)return pending('history_missing');
  const t=Math.max(...rows.map(v=>v.timestamp));const candidates=[...new Set(rows.filter(v=>v.timestamp===t).map(v=>v.value))];
  if(candidates.length!==1||!values.includes(candidates[0]))return pending('history_conflict');
  if(candidates[0]==='')return pending('explicitly_cleared');
  return {status:'candidate',contactId:active[0],value:candidates[0],asOf:createdAt,versionAt:t,writeAllowed:false};
}
