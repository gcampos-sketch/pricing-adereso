import {useEffect,useRef,useState} from 'react';
import {ArrowRight,ChevronLeft} from 'lucide-react';
import type {DealDTO} from '@/lib/pulse-types';
import {scenarioMonths,suggestedScenarioMonth,scenarioMonthLabel,type ScenarioScope} from '@/lib/quota-scenarios';
import type {dealSelectionTotal,SelectionQuota} from '@/lib/deal-selection-total';
import {DealSelectionSummary} from './DealSelectionSummary';
import {ScenarioSaveButton} from './ScenarioSaveButton';
import {ScenarioDrawer} from './ScenarioDrawer';
const money=(v:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);
export function ScenarioProjection({summary,quota,scope,deals,onClear}:{summary:ReturnType<typeof dealSelectionTotal>;quota:SelectionQuota;scope:ScenarioScope;deals:DealDTO[];onClear:()=>void}) {
 const [open,setOpen]=useState(false),previous=useRef(0);
 const months=scenarioMonths(scope.periods);
 const [simulationMonth,setSimulationMonth]=useState(()=>suggestedScenarioMonth(scope.periods,deals));
 const month=months.includes(simulationMonth)?simulationMonth:months[0]??'';
 useEffect(()=>{if(summary.count>0&&previous.current===0){setOpen(true);setSimulationMonth(suggestedScenarioMonth(scope.periods,deals));}if(!summary.count)setOpen(false);previous.current=summary.count;},[summary.count]);
 if(!summary.count)return null;
 return <ScenarioDrawer open={open} onOpenChange={setOpen} title="Proyección del escenario" description={`${quota.label} · ${scope.basis==='stage6'?'Entrada a ganado · E6':'Fecha de cierre'}`} trigger={
  <button type="button" className="scenario-projection-launch"><span><small>{summary.count} {summary.count===1?'negocio seleccionado':'negocios seleccionados'}</small><strong>{money(summary.total??0)} <small>proyectado</small></strong></span><span>Ver y guardar <ArrowRight size={16}/></span></button>
 }>
  <div className="scenario-month-choice"><label htmlFor="scenario-close-month">Cierre simulado</label><select id="scenario-close-month" value={month} onChange={event=>setSimulationMonth(event.target.value)}>{months.map(m=><option key={m} value={m}>{scenarioMonthLabel(m)}</option>)}</select><small>Para los {deals.length} negocios marcados · solo en este escenario</small></div>
  <DealSelectionSummary summary={summary} quota={quota} onClear={onClear}/>
  <div className="scenario-drawer-deals"><h4>Negocios del escenario <span>{deals.length}</span></h4>{deals.map(d=><div key={d.id}><a href={d.url} target="_blank" rel="noreferrer">{d.name} ↗<small>{d.owner} · cierre simulado: {scenarioMonthLabel(month)}</small></a><strong>{money(d.amountValue+(d.otfValue||0)/12)}</strong></div>)}</div>
  <footer className="scenario-drawer-footer">{summary.contribution!==null&&summary.excluded===0 ? <ScenarioSaveButton simulationMonth={month} scope={scope} ids={deals.map(d=>d.id)} expected={{target:summary.total!,baseline:quota.won,quota:quota.quota}}/> : <p>Quita los negocios que no suman a la cuota para guardar.</p>}<button className="scenario-continue" type="button" onClick={()=>setOpen(false)}><ChevronLeft size={15}/> Seguir seleccionando</button></footer>
 </ScenarioDrawer>;
}
