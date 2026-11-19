import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { buildLossReasonWords, summarizeLossReasons, type LossNarrative } from '@/lib/loss-reason-words';
import type { InsightDeal } from '@/lib/insights-types';
import { money } from './insights-shared';
import './LossReasonWords.css';

type ReasonDeal = LossNarrative & Pick<InsightDeal, 'owner' | 'ownerId' | 'amountValue'>;
const share = new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 1 });

function LossBreakdown({ deals }: { deals: readonly ReasonDeal[] }) {
  const { count, mrr, owners } = useMemo(() => summarizeLossReasons(deals), [deals]);
  if (!count) return null;
  return <details className="loss-words-breakdown">
    <summary>
      <strong>{money(mrr)} USD de MRR perdido</strong>
      <span>{count} {count === 1 ? 'deal' : 'deals'} · Desglose por comercial</span>
    </summary>
    <div className="loss-words-breakdown-table">
      <table aria-label="Distribución de las pérdidas del grupo por comercial">
        <thead><tr>
          <th scope="col">Comercial</th><th scope="col">Deals</th><th scope="col">% de deals</th>
          <th scope="col">MRR perdido</th><th scope="col">% del MRR</th>
        </tr></thead>
        <tbody>{owners.map(owner => <tr key={owner.id}>
          <th scope="row">{owner.name}</th>
          <td>{owner.count}</td><td>{share.format(owner.count / count)}</td>
          <td>{money(owner.mrr)}</td><td>{mrr > 0 ? share.format(owner.mrr / mrr) : '—'}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p>Porcentajes sobre el total de este grupo, con los filtros aplicados.</p>
  </details>;
}

export function LossReasonWords({ deals, available, compact = false, initialLimit = 12 }: {
  deals: readonly ReasonDeal[]; available: boolean; compact?: boolean; initialLimit?: number;
}) {
  const cloud = useMemo(() => buildLossReasonWords(deals), [deals]);
  const context = useMemo(() => JSON.stringify(deals.map(deal => [
    deal.id, deal.ownerId, deal.amountValue, deal.lostReasonNarrative,
  ])), [deals]);
  const [selection, setSelection] = useState<{ context: string; term: string; expanded: boolean } | null>(null);
  const selected = selection?.context === context ? cloud.words.find(word => word.term === selection.term) : undefined;
  const selectedTerm = selected?.term;
  const evidenceId = useId();
  const evidenceHeading = useRef<HTMLHeadingElement>(null);
  const activeBubble = useRef<HTMLButtonElement>(null);
  const [expandedContext, setExpandedContext] = useState<string | null>(null);
  const wordsExpanded = !compact || expandedContext === context;
  const visibleWords = wordsExpanded ? cloud.words : cloud.words.slice(0, initialLimit);
  const max = Math.max(1, ...cloud.words.map(word => word.count));

  useEffect(() => {
    if (selectedTerm) evidenceHeading.current?.focus();
  }, [selectedTerm]);

  return <section className="loss-reason-words" data-compact={compact || undefined} aria-label="Palabras en las razones de pérdida">
    <LossBreakdown deals={deals} />
    {selected && available && <section id={evidenceId} className="loss-words-evidence" aria-labelledby={`${evidenceId}-heading`}>
      <div className="loss-words-evidence-heading">
        <h4 id={`${evidenceId}-heading`} ref={evidenceHeading} tabIndex={-1}>
          «{selected.term}» en Closed Lost Reason
        </h4>
        <button type="button" onClick={() => { setSelection(null); activeBubble.current?.focus(); }}>Cerrar comentarios</button>
      </div>
      <LossBreakdown key={selected.term} deals={selected.comments} />
      {(selection?.expanded ? selected.comments : selected.comments.slice(0, 5)).map(comment => <blockquote key={comment.id}>
        <p>{comment.text}</p>
        <footer>
          {comment.url ? <a href={comment.url} target="_blank" rel="noopener noreferrer">{comment.name}</a> : <span>{comment.name}</span>}
          <span>{comment.owner || 'Sin comercial'} · {money(comment.amountValue)} USD de MRR</span>
        </footer>
      </blockquote>)}
      {selected.comments.length > 5 && !selection?.expanded &&
        <button type="button" className="cell-button" onClick={() => setSelection({ context, term: selected.term, expanded: true })}>
          Ver los {selected.comments.length} comentarios
        </button>}
    </section>}
    <div className="loss-words-heading">
      <h3>{compact ? 'Palabras más mencionadas' : '¿Qué dicen las razones de pérdida?'}</h3><span>Fuente: Closed Lost Reason</span>
    </div>
    {!available ? <p>Actualiza el dashboard para cargar las explicaciones de pérdida.</p> : <>
      <p>{cloud.commented} de {cloud.total} {cloud.total === 1 ? 'deal' : 'deals'} con explicación
        {cloud.words.length > 0 && ' · Pulsa una palabra para leer los comentarios completos.'}</p>
      {cloud.words.length ? <div className="loss-words-cloud" aria-label="Nube de palabras">
        {visibleWords.map(word => <button type="button" key={word.term} aria-expanded={selectedTerm === word.term}
          aria-controls={selectedTerm === word.term ? evidenceId : undefined}
          aria-label={`Ver ${word.count} ${word.count === 1 ? 'comentario' : 'comentarios'} con ${word.term}`}
          style={{ '--bubble-size': `${Math.round(76 + (compact ? 28 : 62) * Math.sqrt((word.count - 1) / Math.max(1, max - 1)))}px` } as CSSProperties}
          onClick={event => {
            activeBubble.current = event.currentTarget;
            setSelection(selectedTerm === word.term ? null : { context, term: word.term, expanded: false });
          }}>
          <span className="loss-word-label">{word.term}</span><small>{word.count} {word.count === 1 ? 'deal' : 'deals'}</small>
        </button>)}
      </div> : <p>{cloud.commented ? 'Sin palabras clave después de quitar el relleno. Puedes revisar las explicaciones en los deals.' : 'Sin explicaciones registradas en este alcance.'}</p>}
      {compact && cloud.words.length > initialLimit &&
        <button type="button" className="loss-words-more" onClick={() => { setExpandedContext(wordsExpanded ? null : context); if (wordsExpanded) setSelection(null); }}>
          {wordsExpanded ? `Mostrar las ${initialLimit} principales` : `Ver las ${cloud.words.length - initialLimit} palabras restantes`}
        </button>}
    </>}
  </section>;
}
