import { useRef, useState } from "react";
import { Check, ClipboardCopy, Copy, LoaderCircle, X } from "lucide-react";
import { copyBlockImage, copyText } from "@/lib/snapshot";

type State = "idle" | "busy" | "ok" | "fail";

function label(state: State, base: string) {
  if (state === "busy") return "Copiando…";
  if (state === "ok") return "¡Copiado!";
  if (state === "fail") return "No se pudo";
  return base;
}

function CopyStateIcon({ state, capture = false }: { state: State; capture?: boolean }) {
  if (state === "busy") return <LoaderCircle aria-hidden="true" className="copy-btn-icon is-spinning" />;
  if (state === "ok") return <Check aria-hidden="true" className="copy-btn-icon" />;
  if (state === "fail") return <X aria-hidden="true" className="copy-btn-icon" />;
  const Icon = capture ? ClipboardCopy : Copy;
  return <Icon aria-hidden="true" className="copy-btn-icon" />;
}

/** Botón que copia la sección completa como imagen al portapapeles. */
export function CopySectionButton() {
  const ref = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<State>("idle");
  return (
    <button
      ref={ref}
      type="button"
      className="copy-btn"
      data-state={state}
      title="Copiar esta sección como imagen"
      onClick={async () => {
        const head = ref.current?.closest("[data-section-head]") as HTMLElement | null;
        if (!head) return;
        setState("busy");
        const ok = await copyBlockImage(head).catch(() => false);
        setState(ok ? "ok" : "fail");
        setTimeout(() => setState("idle"), 1800);
      }}
    >
      <CopyStateIcon state={state} capture />
      <span>{label(state, "Captura")}</span>
    </button>
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
