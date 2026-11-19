import { useMemo } from 'react';
import type { DealDTO } from '@/lib/pulse-types';
import { summarizeLossByOwner } from '@/lib/loss-summary';
import { money } from './insights-shared';

export function LossTicketByOwner({ deals }: { deals: DealDTO[] }) {
  const { count, mrr, owners } = useMemo(() => summarizeLossByOwner(deals), [deals]);
  const bars = owners.map(owner => ({ ...owner, ticket: owner.mrr / owner.count }))
    .sort((a, b) => b.ticket - a.ticket || b.count - a.count || a.name.localeCompare(b.name, 'es'));
  const min = Math.min(0, ...bars.map(owner => owner.ticket));
  const max = Math.max(0, ...bars.map(owner => owner.ticket));
  const span = max - min || 1;

  return <section className="modal-owner-bars loss-ticket-owners" aria-labelledby="loss-ticket-owners-title">
    <header>
      <h3 id="loss-ticket-owners-title">Ticket medio perdido por comercial</h3>
      {count > 0 && <p className="loss-ticket-team">Ticket del equipo <strong>{money(mrr / count)}</strong> · {count} {count === 1 ? 'deal' : 'deals'}</p>}
    </header>
    {count ? <>
      <p>MRR perdido por deal, en USD. Incluye los deals de $0.</p>
      <ul className="owner-bar-list loss-ticket-bars" tabIndex={0} aria-label="Promedio de MRR perdido y cantidad de deals por comercial">
        {bars.map(owner => <li key={owner.id} className="owner-bar-row">
          <span className="loss-ticket-owner">{owner.name}<small>{owner.count} {owner.count === 1 ? 'deal' : 'deals'}</small></span>
          <span className="owner-bar-track" aria-hidden="true">
            <span style={{
              insetInlineStart: `${(Math.min(owner.ticket, 0) - min) / span * 100}%`,
              width: `${Math.abs(owner.ticket) / span * 100}%`,
            }} />
          </span>
          <strong className="owner-bar-amount">{money(owner.ticket)}</strong>
        </li>)}
      </ul>
    </> : <p>Sin deals perdidos con los filtros seleccionados.</p>}
  </section>;
}
