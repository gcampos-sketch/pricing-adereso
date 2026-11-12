import { useRef, useState } from "react";
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
