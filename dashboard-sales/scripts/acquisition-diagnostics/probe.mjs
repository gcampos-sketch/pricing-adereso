/** Operator-only read probe. No route, scheduler, credentials, writes or activation. */
const id = (v) => typeof v === 'string' && /^\d{1,30}$/.test(v);
const key = (v) => typeof v === 'string' && /^[a-z][a-z0-9_]{0,99}$/.test(v);
const enumValue = (v) => typeof v === 'string' && v.length > 0 && v.length <= 200 && !/[\u0000-\u001f\u007f]/.test(v);
const date = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const fail = () => { throw new Error('Invalid diagnostic configuration'); };
function versions(record, property, allowed) {
  const raw = record.propertiesWithHistory?.[property];
  if (!Array.isArray(raw)) return { status: 'history_missing', versions: [] };
  const valid = raw.every(v => v && date(v.timestamp) && typeof v.value === 'string' && (v.value === '' || allowed.includes(v.value)));
  if (!valid) return { status: 'history_invalid', versions: [] };
  return { status: 'available', versions: raw.map(v => ({ timestamp: v.timestamp, value: v.value })).sort((a,b) => Date.parse(a.timestamp)-Date.parse(b.timestamp)) };
}
export function asOf(history, createdAt) {
  if (history.status !== 'available' || !date(createdAt)) return { status: 'unknown', value: null };
  const rows = history.versions.filter(v => Date.parse(v.timestamp) <= Date.parse(createdAt));
  if (!rows.length) return { status: 'unknown', value: null };
  const time = Math.max(...rows.map(v => Date.parse(v.timestamp)));
  const values = [...new Set(rows.filter(v => Date.parse(v.timestamp) === time).map(v => v.value))];
  if (values.length !== 1) return { status: 'conflicting', value: null };
  return { status: values[0] === '' ? 'cleared' : 'observed', value: values[0] || null, timestamp: new Date(time).toISOString() };
}
export async function inspectAcquisition(get, config) {
  // get must be a trusted server adapter: path => gateway(path), never browser input.
  const { dealIds, contactIds, pipelines, acquisitionProperty, acquisitionValues, dealTypeValues, events } = config;
  if (!Array.isArray(dealIds) || !Array.isArray(contactIds) || dealIds.length + contactIds.length > 10 ||
      ![...dealIds,...contactIds].every(id) || !Array.isArray(pipelines) || pipelines.length !== 2 || !pipelines.every(id) ||
      !key(acquisitionProperty) || !Array.isArray(acquisitionValues) || !acquisitionValues.length || !acquisitionValues.every(enumValue) ||
      !Array.isArray(dealTypeValues) || !dealTypeValues.length || !dealTypeValues.every(enumValue)) fail();
  if (events && (!id(events.contactId) || !contactIds.includes(events.contactId) || !key(events.type) || !key(events.formProperty) ||
      !Array.isArray(events.formIds) || !events.formIds.length || events.formIds.length > 20 || !events.formIds.every(v => typeof v === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(v)) ||
      !date(events.since) || !date(events.until) || Date.parse(events.until) <= Date.parse(events.since) || Date.parse(events.until)-Date.parse(events.since)>7*86400000)) fail();
  const result = { activationAllowed: false, contacts: [], deals: [], events: null };
  const safeGet = async path => {
    try { return { data: await get(path) }; }
    catch(e) { return { error: e?.status === 401 || e?.status === 403 ? 'access_denied' : 'read_failed' }; }
  };
  for (const contactId of [...new Set(contactIds)]) {
    const q = new URLSearchParams({ properties: acquisitionProperty, propertiesWithHistory: acquisitionProperty });
    const r = await safeGet(`/crm/v3/objects/contacts/${contactId}?${q}`);
    result.contacts.push({ id: contactId, ...(r.error ? { status:r.error } : r.data?.id !== contactId ? {status:'identity_mismatch'} : versions(r.data, acquisitionProperty, acquisitionValues)) });
  }
  for (const dealId of [...new Set(dealIds)]) {
    const q = new URLSearchParams({ properties:`pipeline,dealtype,${acquisitionProperty}`, propertiesWithHistory:`dealtype,${acquisitionProperty}` });
    const r = await safeGet(`/crm/v3/objects/deals/${dealId}?${q}`);
    if (r.error) { result.deals.push({id:dealId,status:r.error}); continue; }
    const d = r.data;
    if (d?.id !== dealId || !date(d.createdAt) || !pipelines.includes(d.properties?.pipeline)) {
      result.deals.push({id:dealId,status:'invalid_or_out_of_scope'}); continue;
    }
    const associationIds = new Set(); let after; let complete = false; let associationStatus = 'bounded_partial';
    for(let page=0;page<3;page++) {
      const q = new URLSearchParams({limit:'100'}); if(after) q.set('after',after);
      const a = await safeGet(`/crm/v4/objects/deals/${dealId}/associations/contacts?${q}`);
      if(a.error) { associationStatus = a.error; break; }
      if(!Array.isArray(a.data?.results) || !a.data.results.every(x => id(String(x.toObjectId)))) { associationStatus='invalid'; break; }
      for(const row of a.data.results) associationIds.add(String(row.toObjectId));
      after=a.data.paging?.next?.after;
      if(after === undefined) {complete=true;associationStatus='complete_current_only';break;}
      if(typeof after !== 'string' && typeof after !== 'number') {associationStatus='invalid';break;}
      after=String(after);
    }
    result.deals.push({id:dealId,createdAt:d.createdAt,pipeline:d.properties.pipeline,
      acquisition:versions(d,acquisitionProperty,acquisitionValues), dealType:versions(d,'dealtype',dealTypeValues),
      associations:{status:associationStatus,complete,identityAtCreationProven:false,contactIds:[...associationIds].filter(x=>contactIds.includes(x)),unlistedCount:[...associationIds].filter(x=>!contactIds.includes(x)).length}});
  }
  if(events) {
    const rows=[]; let scanned=0; let after; let complete=false; let status='bounded_partial';
    for(let page=0;page<3 && scanned<50;page++) {
      const q=new URLSearchParams({objectType:'0-1',objectId:events.contactId,eventType:events.type,occurredAfter:events.since,occurredBefore:events.until,properties:events.formProperty,limit:String(50-scanned)});
      if(after) q.set('after',after);
      const r=await safeGet(`/events/v3/events?${q}`);
      if(r.error){status=r.error;break;}
      if(!Array.isArray(r.data?.results)){status='invalid';break;}
      const remaining = 50-scanned;
      scanned += Math.min(remaining,r.data.results.length);
      const truncated = r.data.results.length > remaining;
      for(const e of r.data.results.slice(0,remaining)) {
        if(!e || typeof e.id !== 'string' || !/^[a-zA-Z0-9_-]{1,250}$/.test(e.id) || !date(e.occurredAt) || !['CONTACT','0-1'].includes(e.objectType) || String(e.objectId)!==events.contactId || e.eventType!==events.type ||
          Date.parse(e.occurredAt)<Date.parse(events.since) || Date.parse(e.occurredAt)>Date.parse(events.until) || !events.formIds.includes(e.properties?.[events.formProperty])) continue;
        rows.push({id:e.id,occurredAt:e.occurredAt,contactId:events.contactId,formId:e.properties[events.formProperty]});
      }
      if(truncated){status='bounded_partial';break;}
      after=r.data.paging?.next?.after;
      if(after===undefined){complete=true;status=rows.length?'occurrences_observed':'no_matching_occurrences';break;}
      if(typeof after !== 'string' && typeof after !== 'number'){status='invalid';break;}
      after=String(after);
    }
    result.events={status,complete,occurrences:rows};
  }
  return result;
}
