import { useMemo, useState } from 'react';
import { buildLossReasonWords, type LossNarrative } from '@/lib/loss-reason-words';
import './LossReasonWords.css';

export function LossReasonWords({ deals, available }: { deals: LossNarrative[]; available: boolean }) {
  const cloud = useMemo(() => buildLossReasonWords(deals), [deals]);
  const context = JSON.stringify(cloud.words.map(word => [word.term, word.comments.map(comment => [comment.id, comment.text])]));
  const [selection, setSelection] = useState<{ context: string; term: string; expanded: boolean } | null>(null);
  const selected = selection?.context === context ? cloud.words.find(word => word.term === selection.term) : undefined;
  const max = Math.max(1, ...cloud.words.map(word => word.count));
  return <section className="loss-reason-words" aria-label="Palabras en las razones de pérdida">
    <div className="loss-words-heading"><h3>¿Qué dicen las razones de pérdida?</h3><span>Fuente: Closed Lost Reason</span></div>
    {!available ? <p>Actualiza el dashboard para cargar las explicaciones de pérdida.</p> : <>
      <p>{cloud.commented} de {cloud.total} {cloud.total === 1 ? "deal" : "deals"} con explicación · tamaño = deals que mencionan cada palabra</p>
      {cloud.words.length ? <div className="loss-words-cloud" aria-label="Nube de palabras">
        {cloud.words.map(word => <button type="button" key={word.term} aria-pressed={selected?.term === word.term}
          aria-label={`Ver ${word.count} ${word.count === 1 ? 'comentario' : 'comentarios'} con ${word.term}`}
          title={`${word.count} ${word.count === 1 ? 'deal menciona' : 'deals mencionan'} «${word.term}»`}
          style={{ fontSize: `${15 + 19 * Math.sqrt(word.count / max)}px` }}
          onClick={() => setSelection(selected?.term === word.term ? null : { context, term: word.term, expanded: false })}>
          {word.term}<small>{word.count}</small>
        </button>)}
      </div> : <p>{cloud.commented ? 'Las explicaciones no contienen palabras significativas para una nube.' : 'Sin explicaciones registradas en este alcance.'}</p>}
      {selected ? <div className="loss-words-evidence" aria-live="polite">
        <div className="loss-words-evidence-heading"><strong>Comentarios con «{selected.term}» · {selected.count} deals</strong><button type="button" onClick={() => setSelection(null)}>Cerrar comentarios</button></div>
        {(selection?.expanded ? selected.comments : selected.comments.slice(0, 5)).map(comment => <blockquote key={comment.id}>
          <p>{comment.text}</p><footer>{comment.url ? <a href={comment.url} target="_blank" rel="noopener noreferrer">{comment.name}</a> : <span>{comment.name}</span>}</footer>
        </blockquote>)}
        {selected.comments.length > 5 && !selection?.expanded ? <button type="button" className="cell-button" onClick={() => setSelection({ context, term: selected.term, expanded: true })}>Ver los {selected.comments.length} comentarios</button> : null}
      </div> : cloud.words.length ? <p>Pulsa una palabra para leer los comentarios originales. Palabras literales; no causas inferidas.</p> : null}
    </>}
  </section>;
}
