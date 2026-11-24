import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FlipHorizontal2 } from "lucide-react";

export function LossConclusionFlip({ label, front, back, compact }: {
  label: string;
  front: ReactNode;
  back: ReactNode;
  compact?: boolean;
}) {
  const [flipped, setFlipped] = useState(false);
  const id = useId();
  const analyze = useRef<HTMLButtonElement>(null);
  const restore = useRef<HTMLButtonElement>(null);
  const transferFocus = useRef(false);
  useLayoutEffect(() => {
    if (!transferFocus.current) return;
    transferFocus.current = false;
    (flipped ? restore : analyze).current?.focus({ preventScroll: true });
  }, [flipped]);

  const toggle = () => {
    transferFocus.current = true;
    setFlipped(value => !value);
  };
  const analyzeLabel = `Analizar ${label}`;
  const restoreLabel = `Volver al resumen de ${label}`;

  return <article className="loss-conclusion-flip" data-flipped={flipped} data-compact={compact || undefined}
    onKeyDown={event => {
      if (flipped && event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        event.stopPropagation();
        toggle();
      }
    }}>
    <div className="loss-conclusion loss-conclusion-face loss-conclusion-front" inert={flipped}>
      {front}
      <button ref={analyze} type="button" className="loss-conclusion-flip-button" aria-label={analyzeLabel} title={analyzeLabel}
        aria-controls={id} aria-expanded={flipped} onClick={toggle}>
        <FlipHorizontal2 size={15} aria-hidden="true" />
      </button>
    </div>
    <div id={id} className="loss-conclusion loss-conclusion-face loss-conclusion-back" inert={!flipped}>
      <header className="loss-conclusion-back-header">
        <h3>{label}</h3>
        <button ref={restore} type="button" className="loss-conclusion-flip-button" aria-label={restoreLabel} title={restoreLabel} onClick={toggle}>
          <FlipHorizontal2 size={15} aria-hidden="true" />
        </button>
      </header>
      {back}
    </div>
  </article>;
}
