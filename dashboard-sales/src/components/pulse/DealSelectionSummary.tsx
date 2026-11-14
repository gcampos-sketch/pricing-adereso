import {useId, useState, type ReactNode} from 'react';
import type { dealSelectionTotal, SelectionQuota } from '@/lib/deal-selection-total';

const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);

export function DealSelectionSummary({ summary, quota, onClear, actions, compact = false }: {
  summary: ReturnType<typeof dealSelectionTotal>;
  quota?: SelectionQuota | null;
  onClear: () => void;
  actions?:ReactNode;
  compact?:boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const breakdownId = useId();
  if (!summary.count) return null;
  const scenario = quota && summary.total !== null && summary.contribution !== null;
  const attainment = summary.attainment !== null && Number.isFinite(summary.attainment) ? summary.attainment : null;
  const progress = attainment === null ? 0 : Math.max(0, Math.min(100, attainment));
  const currentAttainment = quota && quota.quota > 0 ? quota.won / quota.quota * 100 : 0;
  const tone = attainment !== null && attainment > 80 ? 'green' : attainment !== null && attainment > 40 ? 'yellow' : 'red';
  const breakdown = scenario ? <>
      <div className="selection-equation">
        <div className="selection-term"><span>Ganado actual</span><strong>{money(quota.won)}</strong></div>
        <span className="selection-operator" aria-label="más">+</span>
        <div className="selection-term"><span>Si ganas los marcados</span><strong>{money(summary.contribution!)}</strong></div>
        <span className="selection-operator" aria-label="igual a">=</span>
        <div className="selection-term selection-result"><span>Total del escenario</span><strong>{money(summary.total!)}</strong></div>
      </div>
      {attainment !== null ? <div className="selection-quota-progress" data-tone={tone}>
        <div className="selection-quota-label"><span>Ganado actual: {currentAttainment.toFixed(1)}%</span><strong>Escenario: {attainment.toFixed(1)}% de cuota</strong></div>
        <div className="selection-quota-track" role="progressbar" aria-label="Avance de cuota si ganas los deals marcados" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`${attainment.toFixed(1)}% de cuota en el escenario; ganado actual ${currentAttainment.toFixed(1)}%`}>
          <span className="selection-quota-fill" style={{ width: `${progress}%` }} />
          <span className="selection-quota-current" style={{ left: `${Math.max(0, Math.min(100, currentAttainment))}%` }} title={`Ganado actual: ${currentAttainment.toFixed(1)}%`} />
        </div>
      </div> : null}
      {summary.otfBonus > 0 || summary.excluded > 0 ? <div className="selection-details">
        {summary.otfBonus > 0 ? <span>Los marcados suman {money(summary.contribution! - summary.otfBonus)} MRR + {money(summary.otfBonus)} de OTF/12.</span> : null}
        {summary.excluded > 0 ? <span title="Ya ganados, fuera del período seleccionado, fuera del pipeline abierto o no elegibles para cuota.">{summary.excluded} {summary.excluded === 1 ? 'deal marcado no suma' : 'deals marcados no suman'} a este escenario.</span> : null}
      </div> : null}
    </> : <div className="selection-term"><span>MRR de los marcados</span><strong>{money(summary.amount)}</strong></div>;
  return <section className="deal-selection-total" data-compact={compact} data-tone={tone} aria-label={scenario ? 'Escenario si ganas los deals marcados' : 'Resumen de los deals marcados'} aria-live={compact ? undefined : 'polite'}>
    <div className="selection-heading">
      <span><strong>{scenario ? 'Escenario' : 'Selección'}</strong> · {summary.count} {summary.count === 1 ? 'deal marcado' : 'deals marcados'}{quota ? ` · ${quota.label}` : ''}</span>
      {compact ? <div className="selection-headline" aria-live="polite"><strong>{money(scenario ? summary.total! : summary.amount)}</strong>{attainment !== null ? <span>{attainment.toFixed(1)}% de cuota</span> : null}</div> : null}
      <button type="button" onClick={onClear}>Limpiar selección</button>
    </div>
    {compact ? <>
      <div className="selection-tools">
        <button type="button" className="selection-expand" aria-expanded={expanded} aria-controls={breakdownId} onClick={()=>setExpanded(!expanded)}><span aria-hidden="true">{expanded ? '−' : '+'}</span> {expanded ? 'Ocultar desglose' : 'Ver desglose'}{summary.excluded > 0 ? ` · ${summary.excluded} sin aporte` : ''}</button>
        {actions}
      </div>
      <div className="selection-breakdown" id={breakdownId} hidden={!expanded} tabIndex={0} role="region" aria-label="Desglose del escenario">{breakdown}</div>
    </> : <>{breakdown}{actions}</>}
  </section>;
}
