import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getLossPriorScores } from '@/lib/loss-prior-score.functions';
import { priorScoreBuckets, type LossPriorScore, type PriorMetric } from '@/lib/loss-prior-score';
import type { InsightDeal } from '@/lib/insights-types';
import { LossClusterDetail } from './LossClusterDetail';
import './LossScoreClusters.css';


export function LossScoreClusters({ deals, scope, readAt, available, onOpen }: {
  deals: InsightDeal[]; scope: string; readAt: string; available: boolean; onOpen: (title: string, deals: InsightDeal[]) => void;
}) {
  const [metric,setMetric] = useState<PriorMetric>('adobo');
  const [visible,setVisible] = useState(false);
  const [retry,setRetry] = useState(0);
  const root = useRef<HTMLElement>(null);
  const ids = [...new Set(deals.map(d=>d.id))].sort();
  const idsKey = JSON.stringify(ids);
  const cohort = JSON.stringify([idsKey,scope]);
  const key = JSON.stringify([cohort,readAt,retry]);
  const [state,setState] = useState<{key:string; cohort?:string; rows?:Record<string,LossPriorScore>; error?:string; loaded?:number}>({key:''});
  const [opened,setOpened] = useState<string|null>(null);
  useEffect(()=>{ const observer=new IntersectionObserver(entries=>setVisible(entries.some(e=>e.isIntersecting)),{rootMargin:'160px'}); if(root.current)observer.observe(root.current);return()=>observer.disconnect(); },[]);
  useEffect(()=>{
    if (!visible) return;
    let cancelled=false;
    const ids: string[] = JSON.parse(idsKey);
    setState(previous=>({key,cohort,loaded:0,...(previous.cohort===cohort && previous.rows ? {rows:previous.rows} : {})}));
    void (async()=>{
      const rows:Record<string,LossPriorScore>={};
      try {
        for(let i=0;i<ids.length;i+=50) {
          Object.assign(rows,await getLossPriorScores({data:{ids:ids.slice(i,i+50)}}));
          if(cancelled)return;
          setState(previous=>({...previous,key,cohort,loaded:Math.min(ids.length,i+50)}));
        }
        if(!cancelled)setState({key,cohort,rows});
      } catch { if(!cancelled)setState({key,cohort,error:'No se pudo completar la lectura del historial. Vuelve a intentar.'}); }
    })();
    return()=>{cancelled=true;};
  },[idsKey,key,cohort,visible]);
  const rows = state.cohort===cohort && !state.error ? state.rows : undefined;
  const buckets = useMemo(()=>rows ? priorScoreBuckets(deals,rows,metric) : [],[deals,rows,metric]);
  const total = buckets.reduce((n,b)=>n+b.deals.length,0);
  const missing = buckets.find(b=>b.key==='unknown')?.deals.length ?? 0;
  const max = Math.max(1,...buckets.map(b=>b.deals.length));
  const label = metric==='adobo'?'Adobo Score':'Probabilidad de cierre';
  return <section ref={root} className="rep-chart loss-score-clusters" aria-label="Score antes de perderse">
    <div className="loss-analysis-heading"><div><h2>¿Con qué score se perdieron?</h2><p>Último valor registrado antes de entrar a perdido · {scope}</p></div>
      <div className="tabs" aria-label="Score del análisis">{(['adobo','probability'] as const).map(value=><button type="button" key={value} aria-pressed={metric===value} data-active={metric===value} onClick={()=>{setMetric(value);setOpened(null);}}>{value==='adobo'?'Adobo Score':'Probabilidad de cierre'}</button>)}</div>
    </div>
    {!rows ? <div className="loss-cluster-status" role="status">{state.key===key && state.error ? <>{state.error} <button type="button" className="cell-button" onClick={()=>setRetry(r=>r+1)}>Reintentar</button></> : `Leyendo historial${state.key===key && state.loaded ? ` · ${state.loaded} de ${ids.length}` : '…'}`}</div> : <>
      <div className="loss-cluster-coverage">{total-missing} de {total} con valor previo verificable de {label.toLowerCase()}{ids.length!==total ? ` · ${ids.length-total} ya no están perdidos en Comercial` : ''}. Pulsa una barra para explorar motivos.</div>
      <div className="loss-cluster-chart" aria-label={`Distribución por ${label}`} key={metric+cohort}>
        {buckets.map(bucket=><Popover key={bucket.key} open={opened===`${cohort}:${metric}:${bucket.key}`} onOpenChange={open=>setOpened(open?`${cohort}:${metric}:${bucket.key}`:null)}>
          <PopoverTrigger asChild><button type="button" className="loss-cluster-column" disabled={!bucket.deals.length} aria-label={`${label} ${bucket.label}: ${bucket.deals.length} deals; ver motivos`}>
            <span className="loss-cluster-count">{bucket.deals.length}</span><span className="loss-cluster-bar-space"><i className="loss-cluster-bar" data-unknown={bucket.key==='unknown'} style={{height:`${bucket.deals.length/max*100}%`}} /></span><span>{bucket.label}</span>
          </button></PopoverTrigger>
          <PopoverContent className="loss-cluster-popover" aria-label={`${label} ${bucket.label}`} style={{width:'min(740px, calc(100vw - 32px))',maxHeight:'min(760px, calc(100dvh - 48px))'}} onEscapeKeyDown={event=>event.stopPropagation()}>
            <header className="loss-reason-popup-heading"><div><h3>{label} · {bucket.label}</h3><p>{bucket.deals.length} deals · {scope}</p></div><button type="button" className="loss-reason-popup-close" aria-label="Cerrar grupo de score" onClick={()=>setOpened(null)}><X size={17}/></button></header>
            <LossClusterDetail key={JSON.stringify(bucket.deals.map(deal=>[deal.id,deal.lostReason]))} deals={bucket.deals} available={available} onOpen={(reason,selected)=>{setOpened(null);onOpen(`${label} ${bucket.label} · ${reason}`,selected);}} />
          </PopoverContent>
        </Popover>)}
      </div>
      <p className="loss-cluster-footnote">Solo deals actualmente perdidos en Comercial. Los rangos incluyen el límite inferior y excluyen el superior, salvo 100. Sin historial o con valores ambiguos: sin dato previo. No usa el score actual ni infiere causas.</p>
    </>}
  </section>;
}
