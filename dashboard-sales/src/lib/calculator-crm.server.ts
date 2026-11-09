import { COMMERCIAL_PIPELINE, gateway } from './hubspot.server';
import { hubspotConfig } from './hubspot-config.server';
import type { RawDeal, Props } from './hubspot.server';
import { RoiError } from './roi-sharing';
import type { RoiContact } from './roi-sharing';

function requireCrm() {
 try { hubspotConfig(); } catch { throw new RoiError(503, 'crm_not_configured'); }
}
export async function commercialDeal(id: string) {
 requireCrm();
 const deal = await gateway<RawDeal & { archived?: boolean }>('/crm/v3/objects/deals/' + id + '?properties=dealname,pipeline');
 if (deal.archived || deal.properties['pipeline'] !== COMMERCIAL_PIPELINE) throw new RoiError(400, 'invalid_deal');
 return { id: deal.id, name: deal.properties['dealname'] || deal.id };
}
export const calculatorCrm = {
 async deals(query: string) {
  requireCrm();
  const filters: Record<string, string>[] = [{ propertyName: 'pipeline', operator: 'EQ', value: COMMERCIAL_PIPELINE }];
  if (/^\d+$/.test(query)) filters.push({ propertyName: 'hs_object_id', operator: 'EQ', value: query });
  const result = await gateway<{ results: RawDeal[] }>('/crm/v3/objects/deals/search', { method: 'POST', body: JSON.stringify({ filterGroups: [{ filters }], ...(/^\d+$/.test(query) ? {} : { query }), properties: ['dealname'], limit: 20 }) });
  return result.results.map(d => ({ id: d.id, name: d.properties['dealname'] || d.id }));
 },
 async contacts(id: string) {
  await commercialDeal(id);
  const ids = new Set<string>(); let after: string | undefined;
  for (let page = 0; page < 10; page++) {
   const response = await gateway<{ results: { toObjectId: number | string }[]; paging?: { next?: { after: string } } }>('/crm/v4/objects/deals/' + id + '/associations/contacts?limit=100' + (after ? '&after=' + encodeURIComponent(after) : ''));
   response.results.forEach(c => ids.add(String(c.toObjectId)));
   after = response.paging?.next?.after;
   if (!after) break;
  }
  if (after) throw new RoiError(503, 'contacts_incomplete');
  const contacts: RoiContact[] = [], allIds = [...ids];
  for (let i = 0; i < allIds.length; i += 100) {
   const response = await gateway<{ results: { id: string; properties: Props }[]; errors?: unknown[]; numErrors?: number }>('/crm/v3/objects/contacts/batch/read', { method: 'POST', body: JSON.stringify({ properties: ['email', 'firstname', 'lastname'], inputs: allIds.slice(i, i + 100).map(id => ({ id })) }) });
   if (response.errors?.length || response.numErrors || response.results.length !== allIds.slice(i, i + 100).length) throw new RoiError(503, 'contacts_incomplete');
   response.results.forEach(c => { if (c.properties['email']) contacts.push({ id: c.id, name: [c.properties['firstname'], c.properties['lastname']].filter(Boolean).join(' '), email: c.properties['email'] }); });
  }
  return contacts;
 },
};
