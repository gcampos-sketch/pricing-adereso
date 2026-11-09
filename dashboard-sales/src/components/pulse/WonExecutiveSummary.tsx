import { useId, useState, type CSSProperties } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { DealDTO } from '@/lib/pulse-types';
import { wonDistribution, wonOwnerBreakdown, type WonDistributionRow } from '@/lib/won-distribution';

type Measure = 'mrr' | 'count';
const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const percentage = (value: number) => `${value.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`;
const share = (row: WonDistributionRow, measure: Measure) => measure === 'mrr' ? row.mrrShare ?? 0 : row.countShare;

function DistributionOption({ row, measure, period, segment = false }: { row: WonDistributionRow; measure: Measure; period: string; segment?: boolean }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      {segment ? <button type="button" className="won-mix-segment" style={{ width: `${share(row, measure)}%`, background: row.color }} aria-label={`Ver ${row.count} negocios de ${row.label} · ${percentage(share(row, measure))}`} title={`${row.label} · ${percentage(share(row, measure))} · Ver negocios`} /> :
        <button type="button" className="won-mix-option" style={{ '--mix-color': row.color } as CSSProperties} title={`Ver ${row.count} negocios de ${row.label}`}>
          <i aria-hidden="true" /><div><strong>{row.label}</strong><small>{row.count} {row.count === 1 ? 'negocio' : 'negocios'} · {money(row.mrr)} MRR</small></div><b>{percentage(share(row, measure))}</b>
        </button>}
    </PopoverTrigger>
    <PopoverContent className="won-mix-popover" data-won-distribution-popup="" align="start" sideOffset={8} collisionPadding={12} sticky="always" aria-labelledby={titleId} onKeyDown={event => event.stopPropagation()}>
      <header><div><h4 id={titleId}>{row.label}</h4><p>{period} · {row.count} {row.count === 1 ? 'negocio' : 'negocios'} · {money(row.mrr)} MRR · {percentage(share(row, measure))} {measure === 'mrr' ? 'del MRR' : 'de los negocios'}</p></div><button type="button" aria-label="Cerrar negocios de la categoría" onClick={() => setOpen(false)}><X size={16} aria-hidden="true" /></button></header>
      <ul>{row.deals.map(deal => <li key={deal.id}><a href={deal.url} target="_blank" rel="noopener noreferrer"><span>{deal.name}<small>{deal.owner}</small></span><ExternalLink size={13} aria-hidden="true" /></a><strong>{money(deal.amountValue || 0)}</strong></li>)}</ul>
      <small className="won-mix-popup-note">Mismo período y filtros del tablero. Los enlaces abren el negocio en HubSpot.</small>
    </PopoverContent>
  </Popover>;
}

function Distribution({ title, note, rows, measure, period }: { title: string; note: string; rows: WonDistributionRow[]; measure: Measure; period: string }) {
  const visible = rows.filter(row => measure === 'mrr' ? row.mrr > 0 : row.count > 0);
  return <figure className="won-mix-chart">
    <figcaption title={note}><h3>{title}</h3></figcaption>
    {visible.length ? <>
      <div className="won-mix-track" role="group" aria-label={`${title}: selecciona una categoría para ver sus negocios`}>
        {visible.map(row => <DistributionOption key={row.key} row={row} measure={measure} period={period} segment />)}
      </div>
      <ul className="won-mix-legend">{visible.map(row => <li key={row.key}><DistributionOption row={row} measure={measure} period={period} /></li>)}</ul>
    </> : <p className="won-mix-empty">{measure === 'mrr' ? 'Sin MRR ganado en este período. Puedes ver la distribución por negocios.' : 'Sin negocios ganados en este período.'}</p>}
  </figure>;
}

/** Only the eligible won population for the selected period and dashboard filters. */
export function WonExecutiveSummary({ rangeLabel, deals, periods, periodWr, showOwners = false, ownerQuotas = {}, selectedOwner = null, onOwnerSelect, ownerPeriodWr = {} }: {
  rangeLabel: string; deals: DealDTO[]; periods: string[]; periodWr: { won: number; lost: number }; showOwners?: boolean; ownerQuotas?: Record<string, number>;
  selectedOwner?: string | null; onOwnerSelect?: (owner: string | null) => void; ownerPeriodWr?: Record<string, { won: number; lost: number }>;
}) {
  const [measure, setMeasure] = useState<Measure>('mrr');
  const teamMix = wonDistribution(deals, periods);
  const mix = selectedOwner ? wonDistribution(teamMix.deals.filter(deal => (deal.owner || 'Sin comercial') === selectedOwner), periods) : teamMix;
  const owners = showOwners ? wonOwnerBreakdown(teamMix.deals, ownerQuotas) : [];
  const activeWr = selectedOwner ? ownerPeriodWr[selectedOwner] ?? { won: 0, lost: 0 } : periodWr;
  const maxOwnerMrr = Math.max(0, ...owners.map(owner => owner.mrr));
  const closed = activeWr.won + activeWr.lost;
  const wr = closed > 0 ? activeWr.won / closed * 100 : null;
  const methodology = `Base: ${money(mix.totalMrr)} MRR · ${mix.count} negocios · ${rangeLabel}. Aplica los filtros del tablero y el comercial seleccionado aquí; la búsqueda y los demás filtros del listado no alteran este resumen. Outbound: Prospección SDR Adereso. Inbound: Form de contacto Inbound Adereso. CS: Customer Success. KAM: KAM Adereso, incluida Recuperación. Las demás fuentes se muestran aparte.`;
  return <section className="won-executive won-mix-summary won-widget-summary" aria-label="Composición de los ganados del período">
    <header className="won-mix-heading"><span title={methodology}>RESUMEN · {rangeLabel}{selectedOwner ? ` · ${selectedOwner}` : ''}</span>
      <div className="won-mix-measure" role="group" aria-label="Medida de la distribución">
        <button type="button" aria-pressed={measure === 'mrr'} onClick={() => setMeasure('mrr')}>Por MRR</button>
        <button type="button" aria-pressed={measure === 'count'} onClick={() => setMeasure('count')}>Por negocios</button>
      </div>
    </header>
    <div className="won-widgets-grid" data-with-owners={showOwners}>
      {showOwners ? <article className="won-owners-widget" aria-label="Ganado por comercial">
        <header><h3>Ganado por comercial</h3><small>{owners.length} comerciales · MRR</small></header>
        <p className="won-owner-legend">Largo: MRR vendido · relleno: % de cuota</p>
        <div className="won-owner-widget-list">{owners.map(row => <button type="button" className="won-owner-widget-row" key={row.owner} aria-label={`Filtrar ganados de ${row.owner}`} aria-pressed={selectedOwner === row.owner} data-muted={Boolean(selectedOwner && selectedOwner !== row.owner)} onClick={() => onOwnerSelect?.(selectedOwner === row.owner ? null : row.owner)}>
          <div className="won-owner-widget-head"><span>{row.owner}</span><strong>{money(row.mrr)}</strong><small>{row.count} {row.count === 1 ? 'deal' : 'deals'}</small></div>
          <div className="won-owner-widget-meter" title={`Cuota de ${row.owner} · ${rangeLabel}: ${row.quota > 0 ? money(row.quota) : 'sin cuota'}. Cumplimiento = MRR vendido ÷ cuota.`}>
            <span className="owner-bar-track"><span className="owner-bar-sold" style={{ width: `${maxOwnerMrr > 0 ? row.mrr / maxOwnerMrr * 100 : 0}%` }}><span className="owner-bar-fill" style={{ width: `${Math.min(100, Math.max(0, row.attainment ?? 0))}%` }} /></span></span>
            <small>{row.attainment === null ? 'Sin cuota' : `${percentage(row.attainment)} cuota`}</small>
          </div>
        </button>)}</div>
        {!owners.length ? <p className="won-mix-empty">Sin ganados en este período.</p> : null}
      </article> : null}
      <Distribution title="Qué vendimos" note="Tipo de negocio registrado en HubSpot. Categorías en cero ocultas." rows={mix.types} measure={measure} period={rangeLabel} />
      <Distribution title="De dónde vino" note="Outbound: Prospección SDR Adereso. Inbound: Form de contacto Inbound Adereso. CS: Customer Success. KAM: KAM Adereso, incluida Recuperación. Otras fuentes se muestran aparte." rows={mix.sources} measure={measure} period={rangeLabel} />
      <article className="won-wr-widget" title="WR = ganados ÷ (ganados + perdidos), con monto mayor a $0. Aplica el período, comercial, rol y tipo del tablero, además del comercial seleccionado aquí. Incluye todos los cierres de ese alcance, no solo los ganados elegibles para cuota. La búsqueda y los demás filtros de la tabla no cambian este indicador.">
        <h3>WR del período filtrado</h3>
        <p>{rangeLabel} · {selectedOwner ?? 'filtros actuales del tablero'}</p>
        <div className="won-wr-split">
          <div className="won-wr-donut" role="img" aria-label={wr === null ? 'Sin cierres en el período filtrado' : `${activeWr.won} de ${closed} cierres ganados: WR ${percentage(wr)}`}>
            <svg viewBox="0 0 80 80" aria-hidden="true"><circle className="won-wr-ring-base" cx="40" cy="40" r="34" />{wr !== null ? <circle className="won-wr-ring-won" cx="40" cy="40" r="34" pathLength="100" strokeDasharray={`${wr} ${100 - wr}`} transform="rotate(-90 40 40)" /> : null}</svg>
            <strong>{wr === null ? '—' : percentage(wr)}</strong>
          </div>
          <dl className="won-wr-outcomes"><div><dt><i aria-hidden="true" />Ganados</dt><dd>{activeWr.won}</dd></div><div><dt><i aria-hidden="true" />Perdidos</dt><dd>{activeWr.lost}</dd></div></dl>
        </div>
        <span className="won-wr-ratio">{closed ? `${activeWr.won} de ${closed} cierres se ganaron` : 'Sin negocios cerrados en este período'}</span>
        <small>Solo negocios con monto &gt; $0</small>
      </article>
    </div>
  </section>;
}
