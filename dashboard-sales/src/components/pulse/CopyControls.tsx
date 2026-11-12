import { useEffect, useRef, useState } from "react";
import { Check, Copy, LoaderCircle, X } from "lucide-react";
import { copyBlockImage, copyText } from "@/lib/snapshot";

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

/** Botón que copia la sección completa como imagen al portapapeles. */
export function CopySectionButton() {
  const ref = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<State>("idle");
  const message = state === "ok" ? "Imagen copiada al portapapeles" : state === "fail" ? "No se pudo copiar. Revisa el permiso del portapapeles." : "";
  return (
    <span className="section-copy" data-capture-ignore>
      <button
        ref={ref}
        type="button"
        className="copy-btn section-copy-btn"
        data-state={state}
        title="Copiar sección como PNG"
        aria-label="Copiar sección como PNG"
        aria-busy={state === "busy"}
        disabled={state === "busy"}
        onClick={async event => {
          event.stopPropagation();
          const head = ref.current?.closest("[data-section-head]") as HTMLElement | null;
          if (!head) return;
          setState("busy");
          const ok = await copyBlockImage(head).catch(() => false);
          setState(ok ? "ok" : "fail");
          setTimeout(() => setState("idle"), ok ? 5000 : 7000);
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
export function CopyDealLinksButton({ getDeals }: { getDeals: () => { name: string; url: string }[] }) {
  const [state, setState] = useState<State>("idle");
  const [count, setCount] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const message = state === "ok" ? `${count} ${count === 1 ? "deal copiado como hipervínculo" : "deals copiados como hipervínculos"}` : state === "fail" ? "No se pudo copiar. Revisa el permiso del portapapeles." : "";
  return <span className="deal-links-copy" data-capture-ignore>
    <button type="button" className="copy-btn section-copy-btn" title="Copiar deals como hipervínculos" aria-label="Copiar deals como hipervínculos" aria-busy={state === "busy"} disabled={state === "busy"} data-state={state} onClick={async event => {
      event.stopPropagation();
      if (timer.current) clearTimeout(timer.current);
      setState("busy");
      try {
        const deals = [...new Map(getDeals().map(deal => [deal.url, deal])).values()];
        if (!deals.length) throw new Error("No deals");
        const list = document.createElement("ul");
        for (const deal of deals) {
          const item = document.createElement("li"), link = document.createElement("a");
          link.href = deal.url;
          link.textContent = deal.name;
          item.append(link);
          list.append(item);
        }
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([list.outerHTML], { type: "text/html" }),
          "text/plain": new Blob([deals.map(deal => `${deal.name} — ${deal.url}`).join("\n")], { type: "text/plain" }),
        })]);
        setCount(deals.length);
        setState("ok");
      } catch { setState("fail"); }
      timer.current = setTimeout(() => setState("idle"), 5000);
    }}><CopyStateIcon state={state} /></button>
    <span className="section-copy-feedback" role="status" aria-live="polite">{message}</span>
  </span>;
}
