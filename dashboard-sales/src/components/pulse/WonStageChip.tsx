import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { DealDTO, Tone } from '@/lib/pulse-types';

export type WonStageDetail = { deals: DealDTO[]; description: string; period: string; quota: number; mrr: number; otfMonthly: number; historical?: boolean; countsOfficially?: boolean };
const money = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
export function WonStageChip({ label, value, tone, detail }: { label: string; value: string; tone?: Tone; detail: WonStageDetail }) {
  const id = useId();
  const [infoOpen, setInfoOpen] = useState(false);
  return <div className="won-stage-chip" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    <Popover><PopoverTrigger asChild><button type="button" className="metric-chip" data-tone={tone} title={`Ver ${detail.deals.length} deals · ${detail.period}`}>
      <span className="metric-chip-label">{label}</span><span className="metric-chip-value">{value}</span>
    </button></PopoverTrigger>
    <PopoverContent className="won-stage-popover" align="start" sideOffset={8} collisionPadding={12} sticky="always" aria-labelledby={id}>
      <h4 id={id}>{label} · {detail.period}</h4>
      <div className="won-stage-description"><Info size={15} aria-hidden="true" /><p>{detail.description}</p></div>
      <div className="won-stage-totals"><strong>{money(detail.mrr)} MRR</strong><span>{detail.historical ? 'NO SUMA AL PERÍODO' : detail.quota > 0 ? `${(detail.mrr / detail.quota * 100).toFixed(1)}% ${detail.countsOfficially === false ? 'EQUIVALENTE DE CUOTA · AÚN NO OFICIAL' : 'DE CUOTA'}` : 'SIN CUOTA'} · {detail.deals.length} deals</span></div>
      <p className="won-stage-formula">{detail.historical ? "Referencia histórica, fuera del cumplimiento actual." : `Ganados elegibles de ${detail.period}. MRR del grupo ÷ cuota del período (${money(detail.quota)}).`} OTF/12 del grupo: {money(detail.otfMonthly)}{detail.historical ? "." : ", separado de este porcentaje."}</p>
      <ul>{detail.deals.map(d => <li key={d.id}><a href={d.url} target="_blank" rel="noopener noreferrer">{d.name}</a><strong>{money(d.amountValue || 0)}</strong></li>)}</ul>
      {!detail.deals.length ? <p>No hay deals de este período en esta etapa.</p> : null}
    </PopoverContent></Popover>
    {!detail.historical ? <TooltipProvider delayDuration={150}><Tooltip open={infoOpen} onOpenChange={setInfoOpen}>
      <TooltipTrigger asChild><button type="button" className="won-stage-info" aria-label={`Información sobre ${label}`} onClick={event => { event.preventDefault(); setInfoOpen(current => !current); }}><Info size={13} aria-hidden="true" /></button></TooltipTrigger>
      <TooltipContent className="won-stage-tooltip" side="top" sideOffset={7} collisionPadding={12}>{detail.description}</TooltipContent>
    </Tooltip></TooltipProvider> : null}
  </div>;
}
