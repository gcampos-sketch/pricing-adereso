/** Only exact deal associations; a contact/company association never proves deal attribution. */
export function countDealWhatsApp(associatedIds:string[], records:{id:string;properties:Record<string,string|null>}[]):number|null {
  const byId=new Map(records.map(r=>[r.id,r]));
  const ids=[...new Set(associatedIds)];
  if(ids.some(id=>!byId.has(id)))return null;
  return ids.filter(id=>['WHATS_APP','WHATSAPP'].includes((byId.get(id)!.properties['hs_communication_channel_type']??'').trim().toUpperCase())).length;
}
