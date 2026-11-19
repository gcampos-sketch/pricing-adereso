import { useEffect, useMemo, useRef, useState } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getLossPriorScores } from '@/lib/loss-prior-score.functions';
import { lossIcpBuckets, type IcpBasis, type IcpMetric, type LossPriorScore } from '@/lib/loss-prior-score';
import type { InsightDeal } from '@/lib/insights-types';
import { money } from './insights-shared';
import { LossClusterDetail } from './LossClusterDetail';
import './LossScoreClusters.css';
import './LossIcpTable.css';

export function LossIcpTable({deals,scope,readAt,available,onOpen,basis='prior'}:{deals:InsightDeal[];scope:string;readAt:string;available:boolean;onOpen:(title:string,deals:InsightDeal[])=>void;basis?:IcpBasis}) {
  const [metric,setMetric]=useState<IcpMetric>('score');
  const [opened,setOpened]=useState<string|null>(null);
  const [visible,setVisible]=useState(false);
  const [retry,setRetry]=useState(0);
  const root=useRef<HTMLElement>(null);
  const ids=[...new Set(deals.map(d=>d.id))].sort();
  const idsKey=JSON.stringify(ids),cohort=JSON.stringify([idsKey,scope,basis]),key=JSON.stringify([cohort,readAt,retry]);
  const [state,setState]=useState<{key:string;cohort?:string;rows?:Record<string,LossPriorScore>;error?:string}>({key:''});
  useEffect(()=>{const observer=new IntersectionObserver(entries=>setVisible(entries.some(e=>e.isIntersecting)),{rootMargin:'160px'});if(root.current)observer.observe(root.current);return()=>observer.disconnect();},[]);
  useEffect(()=>{
    if(!visible)return;
    let cancelled=false;
    const ids:string[]=JSON.parse(idsKey);
    setState(previous=>({key,cohort,...(previous.cohort===cohort && previous.rows?{rows:previous.rows}:{})}));
    void(async()=>{
      const rows:Record<string,LossPriorScore>={};
      try {
        for(let i=0;i<ids.length;i+=50){
          const batchIds=ids.slice(i,i+50),batch=await getLossPriorScores({data:{ids:batchIds}});
          if(cancelled)return;
          if(batchIds.some(id=>batch[id]?.icpVersion!=='native-icp/v1'))throw Error('ICP no disponible en esta versión');
          Object.assign(rows,batch);
        }
        if(!cancelled)setState({key,cohort,rows});
      }catch{if(!cancelled)setState({key,cohort,error:'No se pudo completar la lectura ICP. Vuelve a intentar.'});}
    })();
    return()=>{cancelled=true;};
  },[idsKey,cohort,key,visible]);
  const evidence=state.cohort===cohort && !state.error?state.rows:undefined;
  const groups=useMemo(()=>evidence?lossIcpBuckets(deals,evidence,metric,basis):[],[deals,evidence,metric,basis]);
  const total=groups.reduce((n,g)=>n+g.deals.length,0);
  const amount=(rows:InsightDeal[])=>rows.reduce((n,d)=>n+d.amountValue,0);
  const label=metric==='score'?'ICP Score Adobo':'ICP fit Adobo';
  return <section ref={root} className="rep-chart loss-icp-table" aria-label="Deals perdidos por ICP">
    <div className="loss-analysis-heading"><div><h2 className="pulse-h2">¿Qué encaje ICP tenían?</h2><p>{basis==='prior'?'Último valor anterior a entrar a perdido':'Valor actual registrado en HubSpot'} · {scope}</p></div>
      <div className="tabs" aria-label="Propiedad ICP del análisis">{(['score','fit'] as const).map(value=><button type="button" key={value} data-active={metric===value} aria-pressed={metric===value} onClick={()=>{setMetric(value);setOpened(null);}}>{value==='score'?'ICP Score Adobo':'ICP fit Adobo'}</button>)}</div>
    </div>
    {!evidence?<div className="loss-cluster-status" role="status">{state.key===key && state.error?<>{state.error} <button type="button" className="cell-button" onClick={()=>setRetry(n=>n+1)}>Reintentar</button></>:'Leyendo datos ICP…'}</div>:<>
      <div className="loss-icp-scroll"><table className="loss-icp-grid"><caption className="sr-only">Deals actualmente perdidos agrupados por {label}. Porcentajes sobre todos los grupos, incluido sin dato.</caption>
        <thead><tr><th scope="col">{metric==='score'?'Rango ICP Score':'ICP fit'}</th><th scope="col">Deals</th><th scope="col">% del total</th><th scope="col">MRR perdido</th><th scope="col"><span className="sr-only">Detalle</span></th></tr></thead>
        <tbody key={cohort+metric}>{groups.map(group=><tr key={group.key}>
          <td>{group.label}</td><td>{group.deals.length}</td><td>{total?`${(group.deals.length/total*100).toLocaleString('es-CL',{maximumFractionDigits:1})}%`:'—'}</td><td>{money(amount(group.deals))}</td>
          <td><Popover open={opened===`${cohort}:${metric}:${group.key}`} onOpenChange={open=>setOpened(open?`${cohort}:${metric}:${group.key}`:null)}>
            <PopoverTrigger asChild><button type="button" className="loss-icp-open" disabled={!group.deals.length} aria-label={`Ver detalle de ${label} ${group.label}: ${group.deals.length} deals`}>Ver detalle <ChevronRight size={13} aria-hidden="true"/></button></PopoverTrigger>
            <PopoverContent className="loss-cluster-popover loss-icp-popover" aria-label={`${label} ${group.label}`} style={{width:'min(740px, calc(100vw - 32px))',maxHeight:'min(760px, calc(100dvh - 48px))'}} onEscapeKeyDown={event=>event.stopPropagation()}>
              <header className="loss-reason-popup-heading"><div><h3>{label} · {group.label}</h3><p>{group.deals.length} deals · {basis==='prior'?'ICP previo a la pérdida':'ICP actual'} · {scope}</p></div><button type="button" className="loss-reason-popup-close" aria-label="Cerrar detalle ICP" onClick={()=>setOpened(null)}><X size={17} aria-hidden="true"/></button></header>
              <LossClusterDetail key={JSON.stringify(group.deals.map(d=>[d.id,d.lostReason]))} deals={group.deals} available={available} onOpen={(reason,rows)=>{setOpened(null);onOpen(`${label} ${group.label} · ${reason}`,rows);}}/>
            </PopoverContent>
          </Popover></td>
        </tr>)}</tbody>
        <tfoot><tr><th scope="row">Total</th><td>{total}</td><td>{total?'100%':'—'}</td><td>{money(groups.reduce((n,g)=>n+amount(g.deals),0))}</td><td/></tr></tfoot>
      </table></div>
      <p className="loss-cluster-footnote">{basis==='prior'?'Sin historial anterior verificable: sin dato previo.':'Los valores ausentes o inválidos quedan en Sin dato.'} No validado es una categoría nativa distinta de un campo vacío. {ids.length!==total?`${ids.length-total} deals ya no están perdidos en Comercial.`:''} Pulsa Ver detalle para explorar motivos y palabras.</p>
    </>}
  </section>;
}
