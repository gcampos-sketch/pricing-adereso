import type { DealDTO } from './pulse-types';

const TIME_ZONE = 'America/Coyhaique';
/** HubSpot close dates are calendar dates, even when transported as midnight UTC. */
export function closeMonthKey(value: string): string | null {
  if (!value?.trim()) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const date = new Date(time);
  const day = value.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/)?.[1];
  if (day && date.toISOString().slice(0,10) !== day) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;
}
export function currentMonthKey(now: number, offset = 0): string {
  const parts = new Intl.DateTimeFormat('en', {timeZone:TIME_ZONE,year:'numeric',month:'2-digit'}).formatToParts(now);
  const year = Number(parts.find(p=>p.type==='year')!.value), month = Number(parts.find(p=>p.type==='month')!.value)-1;
  const target = new Date(Date.UTC(year,month+offset,1));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth()+1).padStart(2,'0')}`;
}
export function summarizeDealMonths(deals: (Pick<DealDTO,'amountValue'|'closeDateValue'> & Partial<Pick<DealDTO,'stage'>>)[], now: number) {
  const current = currentMonthKey(now);
  const year = Number(current.slice(0,4)), month = Number(current.slice(5))-1;
  const quarter = Math.floor(month/3)+1;
  const months = Array.from({length:quarter*3-month},(_,offset)=>{
    const key = `${year}-${String(month+offset+1).padStart(2,'0')}`;
    return {key,label:new Intl.DateTimeFormat('es-CL',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(year,month+offset,1))),current:offset===0,amount:0,count:0};
  });
  const previous = new Map<string, {key:string,label:string,year:number,current:boolean,amount:number,count:number,overdue:number}>();
  const outside = {amount:0,count:0}, undated = {amount:0,count:0};
  for (const deal of deals) {
    const key = closeMonthKey(deal.closeDateValue);
    if (key && key < current) {
      let bucket = previous.get(key);
      if (!bucket) {
        bucket = {key,label:new Intl.DateTimeFormat('es-CL',{month:'long',timeZone:'UTC'}).format(new Date(`${key}-01T12:00:00Z`)),year:Number(key.slice(0,4)),current:false,amount:0,count:0,overdue:0};
        previous.set(key,bucket);
      }
      bucket.count++;
      bucket.amount += Number.isFinite(deal.amountValue) ? deal.amountValue : 0;
      if (/^E[0-5](?:\.|$)/.test(deal.stage ?? '')) bucket.overdue++;
      continue;
    }
    const bucket = key ? months.find(m=>m.key===key) ?? outside : undated;
    bucket.count++;
    bucket.amount += Number.isFinite(deal.amountValue) ? deal.amountValue : 0;
  }
  return {year,quarter,months:months.map(m=>({...m,year,overdue:0})),previous:[...previous.values()].sort((a,b)=>a.key.localeCompare(b.key)),outside,undated,total:{amount:months.reduce((n,m)=>n+m.amount,0),count:months.reduce((n,m)=>n+m.count,0)}};
}
