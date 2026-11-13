import { createServerFn } from '@tanstack/react-start';
import { requireMfa } from './require-mfa';
import { validateScenarioTiming,type ScenarioRequest,type QuotaScenario } from './quota-scenarios';
export const listQuotaScenarios=createServerFn({method:'GET'}).middleware([requireMfa]).handler(async({context}):Promise<QuotaScenario[]>=>{
 const {listScenarios}=await import('./quota-scenarios.server');return listScenarios(context.userId);
});
export const saveQuotaScenario=createServerFn({method:'POST'}).middleware([requireMfa]).inputValidator((input:ScenarioRequest)=>{
 if(!input||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(input.requestId)||!Array.isArray(input.ids)||input.ids.length<1||input.ids.length>500||input.ids.some(id=>typeof id!=='string'||!/^\d+$/.test(id))||new Set(input.ids).size!==input.ids.length)throw Error('Selección inválida');
 if(!input.expected||![input.expected.target,input.expected.baseline,input.expected.quota].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0))throw Error('Valores de proyección inválidos');
 const s=input.scope;
 if(!s||!['all','AE','KAM'].includes(s.role)||!['all','inbound','outbound','upsell','crossSell'].includes(s.type)||!['close','stage6'].includes(s.basis)||!Array.isArray(s.periods)||!s.periods.length||s.periods.length>4||new Set(s.periods).size!==s.periods.length||new Set(s.periods.map(p=>p.slice(0,4))).size!==1||s.periods.some(p=>!/^20\d{2}-Q[1-4]$/.test(p))||! /^(team|\d+)$/.test(s.owner))throw Error('Filtros inválidos');
 validateScenarioTiming(input);
 return input;
}).handler(async({context,data}):Promise<QuotaScenario>=>{
 const {saveScenario}=await import('./quota-scenarios.server');return saveScenario(context.userId,data);
});
