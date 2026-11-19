import { useEffect, useId, useRef, useState } from "react";

export function ExpandableCellText({
  text,
  label,
  tone,
}: {
  text: string;
  label: string;
  tone?: "danger";
}) {
  const id = useId();
  const textRef = useRef<HTMLDivElement>(null);
  const [expandedText, setExpandedText] = useState<string | null>(null);
  const [overflows, setOverflows] = useState(false);
  const expanded = expandedText === text;

  useEffect(() => {
    const element = textRef.current;
    if (!element || expanded) return;

    const measure = () => setOverflows(element.scrollHeight > element.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded, text]);

  return (
    <div className="expandable-cell" data-tone={tone}>
      <div
        className="expandable-cell-text"
        data-collapsed={!expanded}
        id={id}
        ref={textRef}
      >
        {text}
      </div>
      {overflows || expanded ? (
        <button
          type="button"
          className="expandable-cell-toggle"
          aria-label={`${expanded ? "Ver menos" : "Ver más"} · ${label}`}
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpandedText(expanded ? null : text)}
        >
          {expanded ? "Ver menos" : "Ver más"}
        </button>
      ) : null}
    </div>
  );
}
