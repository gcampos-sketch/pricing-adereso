import { useEffect, useRef, useState } from "react";
import { Check, Copy, LoaderCircle, X } from "lucide-react";
import { buildDealListClipboard, type CopyableDeal } from "@/lib/deal-list-clipboard";
import { copyBlockImage, copyElementImage, copyText } from "@/lib/snapshot";

type State = "idle" | "busy" | "ok" | "fail";

function label(state: State, base: string) {
  if (state === "busy") return "Copiando…";
  if (state === "ok") return "¡Copiado!";
  if (state === "fail") return "No se pudo";
  return base;
}

function CopyStateIcon({ state }: { state: State }) {
  if (state === "busy") return <LoaderCircle aria-hidden="true" className="copy-btn-icon is-spinning" />;
  if (state === "ok") return <Check aria-hidden="true" className="copy-btn-icon" />;
  if (state === "fail") return <X aria-hidden="true" className="copy-btn-icon" />;
  return <Copy aria-hidden="true" className="copy-btn-icon" />;
}

/** Copia una sección o la figura que contiene el botón. */
export function CopySectionButton({ widgetLabel }: { widgetLabel?: string } = {}) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const title = widgetLabel ? `Copiar «${widgetLabel}» como imagen` : "Copiar sección como PNG";
  const message = state === "ok" ? "Imagen copiada al portapapeles" : state === "fail" ? "No se pudo copiar. Revisa el permiso del portapapeles." : "";
  return (
    <span className={widgetLabel ? "section-copy won-widget-copy" : "section-copy"} data-capture-ignore>
      <button
        type="button"
        className="copy-btn section-copy-btn"
        data-state={state}
        title={title}
        aria-label={title}
        aria-busy={state === "busy"}
        disabled={state === "busy"}
        onClick={async event => {
          event.stopPropagation();
          const target = event.currentTarget.closest<HTMLElement>(widgetLabel ? "figure" : "[data-section-head]");
          if (!target) return;
          if (timer.current) clearTimeout(timer.current);
          setState("busy");
          const ok = await (widgetLabel ? copyElementImage(target) : copyBlockImage(target));
          setState(ok ? "ok" : "fail");
          timer.current = setTimeout(() => setState("idle"), ok ? 5000 : 7000);
        }}
      >
        <CopyStateIcon state={state} />
      </button>
      <span className="section-copy-feedback" role="status" aria-live="polite">{message}</span>
    </span>
  );
}

/** Botón genérico que copia texto al portapapeles. */
export function CopyTextButton({
  getText,
  children,
  compact,
  title,
}: {
  getText: () => string;
  children?: React.ReactNode;
  compact?: boolean;
  title?: string;
}) {
  const [state, setState] = useState<State>("idle");
  return (
    <button
      type="button"
      className="copy-btn"
      data-compact={compact ? "1" : undefined}
      data-state={state}
      title={title ?? "Copiar al portapapeles"}
      onClick={async (event) => {
        event.stopPropagation();
        setState("busy");
        const ok = await copyText(getText());
        setState(ok ? "ok" : "fail");
        setTimeout(() => setState("idle"), 1600);
      }}
    >
      <CopyStateIcon state={state} />
      {compact ? <span className="sr-only">{label(state, String(children ?? "Copiar"))}</span> : (
        <span>{label(state, String(children ?? "Copiar"))}</span>
      )}
    </button>
  );
}

/** Rich deal links, with a URL-preserving plain-text alternative for plain editors. */
export function CopyDealLinksButton({ getDeals, heading, title = "Copiar deals como hipervínculos", disabled = false }: {
  getDeals: () => readonly CopyableDeal[];
  heading?: readonly string[];
  title?: string;
  disabled?: boolean;
}) {
  const [state, setState] = useState<State>("idle");
  const [count, setCount] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const message = state === "ok" ? `${count} ${count === 1 ? "deal copiado" : "deals copiados"}` : state === "fail" ? "No se pudo copiar. Revisa el permiso del portapapeles." : "";

  return <span className="deal-links-copy" data-capture-ignore>
    <button type="button" className="copy-btn section-copy-btn" title={title} aria-label={title}
      aria-busy={state === "busy"} disabled={disabled || state === "busy"} data-state={state} onClick={async event => {
        event.stopPropagation();
        if (timer.current) clearTimeout(timer.current);
        const { count, html, text } = buildDealListClipboard(getDeals(), heading);
        if (!count) return;
        setState("busy");
        let copied = false;
        if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
          try {
            await navigator.clipboard.write([new ClipboardItem({
              "text/html": new Blob([html], { type: "text/html" }),
              "text/plain": new Blob([text], { type: "text/plain" }),
            })]);
            copied = true;
          } catch {
            // Some apps or browsers only support plain text.
          }
        }
        if (!copied) copied = await copyText(text);
        setCount(count);
        setState(copied ? "ok" : "fail");
        timer.current = setTimeout(() => setState("idle"), 5000);
      }}><CopyStateIcon state={state} /></button>
    <span className="section-copy-feedback" role="status" aria-live="polite">{message}</span>
  </span>;
}
