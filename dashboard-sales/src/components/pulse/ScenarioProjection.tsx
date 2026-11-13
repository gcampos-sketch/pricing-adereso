import {useState} from 'react';
import {List,ArrowUpRight} from 'lucide-react';
import type {DealDTO,PulseReport} from '@/lib/pulse-types';
import {suggestedScenarioMonth,type ScenarioScope} from '@/lib/quota-scenarios';
import type {dealSelectionTotal,SelectionQuota} from '@/lib/deal-selection-total';
import {DealSelectionSummary} from './DealSelectionSummary';
import {ScenarioSaveButton} from './ScenarioSaveButton';
import {QuotaScenarios} from './QuotaScenarios';
import {ScenarioDrawer} from './ScenarioDrawer';
export function ScenarioProjection({summary,quota,scope,deals,onClear,report,onViewScenarios}:{summary:ReturnType<typeof dealSelectionTotal>;quota:SelectionQuota;scope:ScenarioScope;deals:DealDTO[];onClear:()=>void;report:PulseReport;onViewScenarios:()=>void}) {
 const [showHistory,setShowHistory]=useState(false),[revision,setRevision]=useState(0);
 const month=suggestedScenarioMonth(scope.periods,deals);
 const actions=<>
  <div className="scenario-inline-actions">
   {summary.count>0 && summary.contribution!==null&&summary.excluded===0 ? <>
    <ScenarioSaveButton simulationMonth={month} scope={scope} ids={deals.map(d=>d.id)} expected={{target:summary.total!,baseline:quota.won,quota:quota.quota}} onSaved={()=>{setRevision(n=>n+1);}}/>
   </> : null}
   <ScenarioDrawer open={showHistory} onOpenChange={setShowHistory} title="Escenarios guardados" description={quota.label} trigger={<button type="button" className="scenario-view-saved"><List size={14}/> Ver escenarios</button>}>
    <QuotaScenarios compact insideDrawer revision={revision} report={report} owner={scope.owner} role={scope.role}/>
    <button type="button" className="scenario-simulations-link" onClick={()=>{setShowHistory(false);onViewScenarios();}}>Ver en Simulaciones de escenarios <ArrowUpRight size={13}/></button>
   </ScenarioDrawer>
  </div>
 </>;
 return summary.count ? <DealSelectionSummary summary={summary} quota={quota} onClear={onClear} actions={actions}/> : <div className="scenario-no-selection" aria-label="Escenarios">{actions}</div>;
}
