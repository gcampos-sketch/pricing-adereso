import type { DealDTO, PulseReport } from './pulse-types';
import { quotaStats, periodOfDate } from './quota-eligibility';
import { CUSTOMER_WON_STAGES } from './customer-accounts';
import { TASK_OPEN_STAGES } from './overdue-tasks';
import { roleOfOwner } from './owner-roles';
import { wonByStage6Entry } from './won-result-period';
export type ScenarioScope = {owner:string;role:'all'|'AE'|'KAM';type:string;periods:string[];basis:'close'|'stage6'};
export type ScenarioRequest = {requestId:string;scope:ScenarioScope;ids:string[];simulationMonth:string;expected:{target:number;baseline:number;quota:number}};
export type QuotaScenario = {version:"quota-scenario/v1";id:string;createdAt:string;reportAt:string;scope:ScenarioScope;ownerName:string;quota:number;baseline:number;target:number;contribution:number;simulationMonth?:string;deals:(Pick<DealDTO,'id'|'name'|'url'|'ownerId'|'amountValue'|'otfValue'|'closeDateValue'>&{simulatedCloseMonth?:string})[]};
/** Month precision only: do not invent a day or overwrite the native HubSpot close date. */
export function scenarioMonths(periods:string[]) {
 return [...new Set(periods.flatMap(p=>{const match=/^(20\d{2})-Q([1-4])$/.exec(p);return match?Array.from({length:3},(_,i)=>`${match[1]}-${String((Number(match[2])-1)*3+i+1).padStart(2,'0')}`):[];}))].sort();
}
export function suggestedScenarioMonth(periods:string[],deals:Pick<DealDTO,'closeDateValue'>[],now=new Date()) {
 const months=scenarioMonths(periods),native=[...new Set(deals.map(d=>d.closeDateValue?.slice(0,7)).filter(m=>months.includes(m)))];
 const current=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
 return native.length===1?native[0]!:months.includes(current)?current:months[0]??'';
}
export const scenarioMonthLabel=(month:string)=>new Date(`${month}-01T12:00:00Z`).toLocaleDateString('es-CL',{month:'long',year:'numeric',timeZone:'UTC'});
const typeNames:Record<string,string>={inbound:'Inbound',outbound:'Outbound',upsell:'Upsell',crossSell:'Cross sell'};
export const scenarioScopeMatches=(d:DealDTO,s:ScenarioScope)=>(s.owner==='team'||d.ownerId===s.owner)&&(s.role==='all'||roleOfOwner(d.ownerId)===s.role)&&(s.type==='all'||d.segment===typeNames[s.type]);
export function scenarioWins(report:PulseReport,scope:ScenarioScope) {
 const rows=scope.basis==='stage6'?wonByStage6Entry(report.stageJourneys??[],scope.periods):scope.periods.flatMap(p=>report.periods.data[p]?.team.wonDeals??[]);
 return quotaStats(rows.filter(d=>scenarioScopeMatches(d,scope)));
}
export function buildQuotaScenario(report:PulseReport,input:ScenarioRequest,createdAt:string):QuotaScenario {
 const scope=input.scope;
 if(!scenarioMonths(scope.periods).includes(input.simulationMonth))throw Error('Elige un mes de cierre simulado dentro del período del filtro principal.');
 const all=[...new Map((report.stageJourneys??[]).map(r=>[r.deal.id,r.deal])).values()];
 const chosen=all.filter(d=>input.ids.includes(d.id)&&scenarioScopeMatches(d,scope)&&TASK_OPEN_STAGES[d.stageId]&&scope.periods.includes(periodOfDate(d.closeDateValue)));
 const eligible=quotaStats(chosen).eligible;
 if(eligible.length!==input.ids.length)throw Error('La selección cambió o contiene negocios que no suman a la cuota. Revisa y vuelve a guardar.');
 const won=scenarioWins(report,scope);
 const quota=scope.periods.reduce((sum,p)=>sum+Object.entries(report.periods.quotas[p]??{}).filter(([id])=>(scope.owner==='team'||scope.owner===id)&&(scope.role==='all'||roleOfOwner(id)===scope.role)).reduce((n,[,value])=>n+value,0),0);
 const contribution=eligible.reduce((n,d)=>n+d.amountValue+(d.otfValue||0)/12,0),baseline=won.wonAmount+won.wonOtf/12;
 if(Math.abs(input.expected.target-(baseline+contribution))>0.01||Math.abs(input.expected.baseline-baseline)>0.01||Math.abs(input.expected.quota-quota)>0.01)throw Error("El informe cambió desde que abriste el escenario. Actualiza el dashboard y revisa los valores antes de guardar.");
 return {version:"quota-scenario/v1",id:input.requestId,createdAt,reportAt:report.generatedAt,scope,ownerName:scope.owner==='team'?'Equipo':report.periods.owners[scope.owner]??'Comercial',quota,baseline,contribution,target:baseline+contribution,simulationMonth:input.simulationMonth,deals:eligible.map(({id,name,url,ownerId,amountValue,otfValue,closeDateValue})=>({id,name,url,ownerId,amountValue,otfValue,closeDateValue,simulatedCloseMonth:input.simulationMonth}))};
}
export function compareQuotaScenario(saved:QuotaScenario,report:PulseReport,now=Date.now()) {
 const available=saved.scope.basis==='close'?saved.scope.periods.every(p=>Boolean(report.periods.data[p])):Array.isArray(report.stageJourneys);
 const won=scenarioWins(report,saved.scope),actual=won.wonAmount+won.wonOtf/12;
 const wins=new Set(won.eligible.map(d=>d.id));
 const current=new Map((report.stageJourneys??[]).map(r=>[r.deal.id,r.deal]));
 const rows=saved.deals.map(d=>{const live=current.get(d.id);const planned=d.simulatedCloseMonth??saved.simulationMonth;const actualCloseMonth=live&&CUSTOMER_WON_STAGES.has(live.stageId)&&/^\d{4}-\d{2}-\d{2}/.test(live.closeDateValue)?live.closeDateValue.slice(0,7):null;return {...d,actualCloseMonth,closedInPlannedMonth:planned&&actualCloseMonth?planned===actualCloseMonth:null,status:!available?'Sin cobertura del período':wins.has(d.id)?'Ganado en el período':!live?'Sin dato actual':CUSTOMER_WON_STAGES.has(live.stageId)?'Ganado fuera del criterio':TASK_OPEN_STAGES[live.stageId]?'Sigue abierto':live.stageId==='171385869'?'Perdido':'Fuera del pipeline activo'};});
 const end=Math.max(...saved.scope.periods.map(p=>{const [y,q]=p.split('-Q').map(Number);return Date.UTC(y!,q!*3,1)+3*3600000;}));
 return {available,closedInPlannedMonth:rows.filter(d=>d.closedInPlannedMonth===true).length,actual,delta:actual-saved.target,attainment:saved.quota>0?actual/saved.quota*100:null,finished:now>=end,rows,won:rows.filter(d=>d.status==='Ganado en el período').length};
}
