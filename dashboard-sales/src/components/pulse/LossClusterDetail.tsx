import { useMemo, useState } from 'react';
import type { InsightDeal } from '@/lib/insights-types';
import { LossReasonWords } from './LossReasonWords';

export function LossClusterDetail({ deals, available, onOpen }: { deals: InsightDeal[]; available: boolean; onOpen: (title: string, deals: InsightDeal[]) => void }) {
  const [reason, setReason] = useState('');
  const [all, setAll] = useState(false);
  const reasons = useMemo(() => {
    const groups = new Map<string,InsightDeal[]>();
    for (const deal of deals) { const key = deal.lostReason || 'Sin motivo listado'; groups.set(key,[...(groups.get(key) ?? []),deal]); }
    return [...groups].map(([name,rows])=>({name,deals:rows})).sort((a,b)=>b.deals.length-a.deals.length || a.name.localeCompare(b.name,'es'));
  }, [deals]);
  const selected = reason ? reasons.find(row=>row.name===reason) : null;
  const scoped = selected?.deals ?? deals;
  return <>
    <div className="loss-cluster-reasons" aria-label="Motivos de este grupo">
      <button type="button" className="loss-cluster-reason" aria-pressed={!reason} onClick={()=>setReason('')}><span>Todos los motivos</span><strong>{deals.length}</strong></button>
      {(all ? reasons : reasons.slice(0,5)).map(row=><button type="button" key={row.name} className="loss-cluster-reason" aria-pressed={reason===row.name} onClick={()=>setReason(reason===row.name?'':row.name)}>
        <span>{row.name}</span><span className="loss-cluster-reason-bar"><i style={{width:`${row.deals.length/deals.length*100}%`}} /></span><strong>{row.deals.length} <small>· {Math.round(row.deals.length/deals.length*100)}%</small></strong>
      </button>)}
      {reasons.length>5 && <button type="button" className="loss-words-more" onClick={()=>setAll(!all)}>{all?'Mostrar los 5 principales':`Ver ${reasons.length-5} motivos restantes`}</button>}
    </div>
    <div className="loss-cluster-selection"><span>{selected?.name || 'Todos los motivos'}</span><button type="button" className="cell-button" onClick={()=>onOpen(selected?.name || 'Todos los motivos',scoped)}>Ver {scoped.length} deals</button></div>
    <LossReasonWords key={reason} deals={scoped} available={available} compact initialLimit={6} />
  </>;
}

