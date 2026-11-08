import type { ReactNode } from 'react';
import type { DealDTO, Tone } from '@/lib/pulse-types';
import { WonStageChip, type WonStageDetail } from './WonStageChip';

type Chip = { label: string; value: string; tone?: Tone; onClick?: () => void; detail?: WonStageDetail };
type Point = { label: string; value: number; count: number };
const money = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
const names: Record<string, string> = {
  'Último': 'ÚLTIMO CIERRE', Inb: 'INBOUND', Out: 'OUTBOUND', Up: 'UPSELL', Cross: 'CROSS SELL',
  'Renov./contr. fuera': 'RENOV. / CONTR.', 'Billeteras vendidas': 'BILLETERAS', 'Revisar clasificación': 'TIPO A REVISAR',
};
function Stat({ chip }: { chip: Chip }) {
  if (chip.detail) return <WonStageChip label={chip.label} value={chip.value} tone={chip.tone ?? "neutral"} detail={chip.detail} />;
  const contents = <><span>{names[chip.label] ?? chip.label.toUpperCase()}</span><strong>{chip.value}</strong></>;
  return chip.onClick
    ? <button type="button" className="won-exec-stat" data-tone={chip.tone} onClick={chip.onClick} title="Ver deals de este indicador">{contents}</button>
    : <div className="won-exec-stat" data-tone={chip.tone}>{contents}</div>;
}
function Bars({ title, note, points }: { title: string; note: string; points: Point[] }) {
  const max = Math.max(1, ...points.map(p => p.value));
  return <figure className="won-exec-chart"><figcaption><strong>{title}</strong><small>{note}</small></figcaption>
    {points.length ? <svg viewBox={`0 0 ${Math.max(points.length, 1) * 74} 108`} role="img" aria-label={`${title}. ${points.map(p => `${p.label}: ${money(p.value)}, ${p.count} deals`).join('; ')}`}>
      {points.map((p, i) => {
        const height = p.value / max * 62;
        return <g key={p.label}><title>{p.label}: {money(p.value)} · {p.count} deals</title>
          <text x={i * 74 + 37} y={Math.max(12, 76 - height)} textAnchor="middle" className="won-exec-bar-value">{money(p.value)}</text>
          <rect x={i * 74 + 17} y={82 - height} width="40" height={height} rx="4" />
          <text x={i * 74 + 37} y="101" textAnchor="middle">{p.label}</text>
        </g>;
      })}
    </svg> : <p>Sin datos para este período.</p>}
  </figure>;
}

/** Supplied only by the Ganado card; the table's other entry points keep their own presentation. */
export function WonExecutiveSummary({ rangeLabel, amount, quota, count, mrr, otf, chips, cornerChips, commission, deals, periods, history }: {
  rangeLabel: string; amount: number; quota: number; count: number; mrr: number; otf: number;
  chips: Chip[]; cornerChips: Chip[]; commission: ReactNode; deals: DealDTO[]; periods: string[]; history: Point[];
}) {
  const months = periods.flatMap(p => {
    const [year, quarter] = p.split('-Q').map(Number);
    return Array.from({ length: 3 }, (_, i) => {
      const month = (quarter! - 1) * 3 + i;
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;
      const list = deals.filter(d => d.closeDateValue?.slice(0, 7) === key);
      return { label: new Date(Date.UTC(year!, month, 1)).toLocaleDateString('es-CL', { month: 'short', timeZone: 'UTC' }).replace('.', '').toUpperCase(), value: list.reduce((sum, d) => sum + (d.amountValue || 0), 0), count: list.length };
    });
  });
  const find = (labels: string[]) => labels.flatMap(label => chips.filter(c => c.label === label));
  return <section className="won-executive" aria-label="Resumen ejecutivo de Ganado">
    <header className="won-exec-heading"><span>RESUMEN EJECUTIVO · {rangeLabel}</span><small>Período y filtros del tablero · la búsqueda de la tabla no altera este resumen</small></header>
    <div className="won-exec-story">
      <div className="won-exec-result"><span>01 · RESULTADO</span><strong>{money(amount)} <small>/ {money(quota)} CUOTA</small></strong>
        <p>{count} deals · {money(mrr)} MRR + {money(otf)} OTF/12</p>
        <div className="won-exec-progress" role="img" aria-label={quota > 0 ? `${(amount / quota * 100).toFixed(1)}% de cuota` : 'Sin cuota'}><i style={{ width: `${quota > 0 ? Math.min(100, Math.max(0, amount / quota * 100)) : 0}%` }} /></div>
        <div className="won-exec-inline"><b>{quota > 0 ? `${(amount / quota * 100).toFixed(1)}% CUOTA` : 'SIN CUOTA'}</b>{find(['QoQ', 'YoY']).map(c => <Stat key={c.label} chip={c} />)}{commission}</div>
      </div>
      <div className="won-exec-block"><h4>02 · MATERIALIZACIÓN</h4><div className="won-exec-stats">{find(['E6 POR MOVER', 'E6.1 WARNING', '6.2 EN DESARROLLO']).map(c => <Stat key={c.label} chip={c} />)}</div><p>Mismos ganados elegibles del período, agrupados por etapa actual. Cada porcentaje es MRR ÷ cuota; OTF/12 va separado.</p></div>
      <div className="won-exec-block"><h4>03 · PENDIENTES</h4><div className="won-exec-stats">{find(['PEND. Q ANT.']).map(c => <Stat key={c.label} chip={c} />)}</div><p>Histórico por revisar · pendientes de Q previos son una propuesta y no suman a este cumplimiento.</p></div>
    </div>
    <div className="won-exec-charts"><Bars title="EVOLUCIÓN MENSUAL" note={`MRR elegible por cierre · ${rangeLabel} · mes en curso parcial`} points={months} /><Bars title="TRAYECTORIA TRIMESTRAL" note="MRR elegible · mismos filtros · trimestre en curso parcial" points={history} /></div>
    <div className="won-exec-footer"><div><h4>ORIGEN DEL MRR</h4><div className="won-exec-stats">{cornerChips.map(c => <Stat key={c.label} chip={c} />)}</div></div><div><h4>FUERA DE CUOTA / CLASIFICACIÓN</h4><div className="won-exec-stats">{find(['Renov./contr. fuera', 'Billeteras vendidas', 'Revisar clasificación']).map(c => <Stat key={c.label} chip={c} />)}{!chips.some(c => ['Renov./contr. fuera', 'Billeteras vendidas', 'Revisar clasificación'].includes(c.label)) ? <span>Sin exclusiones ni clasificación por revisar.</span> : null}</div></div></div>
  </section>;
}
