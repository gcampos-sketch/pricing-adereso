export const COMMISSION_BANDS = [
  {from:0,to:20,factor:.32768}, {from:20,to:40,factor:.4096}, {from:40,to:60,factor:.512},
  {from:60,to:80,factor:.64}, {from:80,to:100,factor:.8}, {from:100,to:120,factor:1},
  {from:120,to:150,factor:1.2,asterisk:true}, {from:150,to:Infinity,factor:1.5,asterisk:true},
];
export function commissionRate(attainment: number | null, target: number | null) {
  if (attainment == null || target == null || !Number.isFinite(attainment) || !Number.isFinite(target) || attainment < 0 || target < 0 || target > 100) return null;
  const band = COMMISSION_BANDS.find(b=>attainment >= b.from && attainment < b.to)!;
  return {rate:Math.round((target*band.factor+Number.EPSILON)*100)/100, ...band};
}
const DAY=86400000;
export function quarterPace(period: string, quota: number, actual: number, now: number) {
  const match=period.match(/^(\d{4})-Q([1-4])$/);
  if (!match || !Number.isFinite(now) || !Number.isFinite(quota) || quota<=0 || !Number.isFinite(actual) || actual<0) return null;
  const year=Number(match[1]), month=(Number(match[2])-1)*3;
  const start=Date.UTC(year,month,1), end=Date.UTC(year,month+3,1);
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Coyhaique',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=(key:string)=>Number(parts.find(p=>p.type===key)!.value);
  const today=Date.UTC(part('year'),part('month')-1,part('day'));
  const days=(end-start)/DAY, elapsed=Math.max(0,Math.min(days,Math.floor((today-start)/DAY)+1));
  const expected=elapsed/days*100, achieved=actual/quota*100;
  const rounded=(n:number)=>Math.round(n*10);
  return {days,elapsed,expected,achieved,expectedAmount:quota*elapsed/days,
    state:rounded(achieved)===rounded(expected)?'En línea':achieved>expected?'Sobre':'Bajo'};
}
