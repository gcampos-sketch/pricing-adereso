import { useMemo, useState, type CSSProperties } from 'react';
import { buildLossReasonWords, type LossNarrative } from '@/lib/loss-reason-words';
import './LossReasonWords.css';

export function LossReasonWords({ deals, available, compact = false, initialLimit = 12 }: { deals: LossNarrative[]; available: boolean; compact?: boolean; initialLimit?: number }) {
  const cloud = useMemo(() => buildLossReasonWords(deals), [deals]);
  const context = JSON.stringify(cloud.words.map(word => [word.term, word.comments.map(comment => [comment.id, comment.text])]));
  const [selection, setSelection] = useState<{ context: string; term: string; expanded: boolean } | null>(null);
  const selected = selection?.context === context ? cloud.words.find(word => word.term === selection.term) : undefined;
  const [expandedContext, setExpandedContext] = useState<string | null>(null);
  const wordsExpanded = !compact || expandedContext === context;
  const visibleWords = wordsExpanded ? cloud.words : cloud.words.slice(0, initialLimit);
  const max = Math.max(1, ...cloud.words.map(word => word.count));
  return <section className="loss-reason-words" data-compact={compact || undefined} aria-label="Palabras en las razones de pérdida">
    <div className="loss-words-heading"><h3>{compact ? "Palabras más mencionadas" : "¿Qué dicen las razones de pérdida?"}</h3><span>Fuente: Closed Lost Reason</span></div>
    {!available ? <p>Actualiza el dashboard para cargar las explicaciones de pérdida.</p> : <>
      <p>{cloud.commented} de {cloud.total} {cloud.total === 1 ? "deal" : "deals"} con explicación · {compact ? "mayor frecuencia primero" : "tamaño = deals que mencionan cada palabra"}</p>
      {cloud.words.length ? <div className="loss-words-cloud" aria-label="Nube de palabras">
        {visibleWords.map(word => <button type="button" key={word.term} aria-pressed={selected?.term === word.term}
          aria-label={`Ver ${word.count} ${word.count === 1 ? 'comentario' : 'comentarios'} con ${word.term}`}
          title={`${word.count} ${word.count === 1 ? 'deal menciona' : 'deals mencionan'} «${word.term}»`}
          style={{ '--bubble-size': `${Math.round(76 + (compact ? 28 : 62) * Math.sqrt((word.count - 1) / Math.max(1, max - 1)))}px` } as CSSProperties}
          onClick={() => setSelection(selected?.term === word.term ? null : { context, term: word.term, expanded: false })}>
          <span className="loss-word-label">{word.term}</span><small>{word.count} {word.count === 1 ? "deal" : "deals"}</small>
        </button>)}
      </div> : <p>{cloud.commented ? 'Sin palabras clave después de quitar el relleno. Puedes revisar las explicaciones en los deals.' : 'Sin explicaciones registradas en este alcance.'}</p>}
      {compact && cloud.words.length > initialLimit && <button type="button" className="loss-words-more" onClick={() => { setExpandedContext(wordsExpanded ? null : context); if (wordsExpanded) setSelection(null); }}>
        {wordsExpanded ? `Mostrar las ${initialLimit} principales` : `Ver las ${cloud.words.length - initialLimit} palabras restantes`}
      </button>}
      {selected ? <div className="loss-words-evidence" aria-live="polite">
        <div className="loss-words-evidence-heading"><strong>Comentarios con «{selected.term}» · {selected.count} deals</strong><button type="button" onClick={() => setSelection(null)}>Cerrar comentarios</button></div>
        {(selection?.expanded ? selected.comments : selected.comments.slice(0, 5)).map(comment => <blockquote key={comment.id}>
          <p>{comment.text}</p><footer>{comment.url ? <a href={comment.url} target="_blank" rel="noopener noreferrer">{comment.name}</a> : <span>{comment.name}</span>}</footer>
        </blockquote>)}
        {selected.comments.length > 5 && !selection?.expanded ? <button type="button" className="cell-button" onClick={() => setSelection({ context, term: selected.term, expanded: true })}>Ver los {selected.comments.length} comentarios</button> : null}
      </div> : cloud.words.length ? <p>Pulsa una palabra para leer los comentarios completos. Se omiten palabras de relleno.</p> : null}
    </>}
  </section>;
}
