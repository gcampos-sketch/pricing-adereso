import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Trash2, CheckCircle2, ExternalLink, Pencil, ListChecks, Zap, Search, X } from "lucide-react";
import type { DealDTO, Drilldown } from "@/lib/pulse-types";
import { adoboScoreComparison, closingProbabilityComparison } from "@/lib/adobo-score-comparison";
import type { PropertyHistoryV1 } from "@/lib/adobo-intelligence";
import { CommissionRate } from "./CommissionRate";
import { CopyTextButton } from "./CopyControls";
import { TrendLine } from "./MiniCharts";
import { addDealNote, addDealTask, enrollTouchpoint, getDealContacts, getAdoboHistory, markDealLostFn, updateDeals } from "@/lib/pulse.functions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDealHeaderScroll } from "@/hooks/use-deal-header-scroll";
import { compareDealClosePriority, compareDealProbabilityPriority } from "@/lib/deal-close-priority";
import { closeMonthKey, currentMonthKey, summarizeDealMonths } from "@/lib/deal-month-summary";
import { markdownToHubspotHtml } from "@/lib/markdown";

/** Cambios locales aplicados sobre el reporte mientras no se recarga desde HubSpot. */
export type DealEdit = { closeDate?: string; probability?: number };

const isoToInput = (raw: string) => {
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : "";
};

const dateLabel = (iso: string) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CL", { timeZone: "UTC" }) : "sin fecha";

/** Celda editable: guarda en HubSpot al presionar Enter o salir del campo. */
function InlineEdit({
  deal,
  field,
  onSaved,
}: {
  deal: DealDTO;
  field: "closeDate" | "probability";
  onSaved: (id: string, patch: DealEdit) => void;
}) {
  const initial =
    field === "closeDate"
      ? isoToInput(deal.closeDateValue)
      : String(Math.round((deal.probabilityValue <= 1 ? deal.probabilityValue * 100 : deal.probabilityValue)));
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "ok" | "error">("idle");
  useEffect(() => setValue(initial), [initial]);

  const commit = async () => {
    if (value === initial || state === "saving") return;
    if (field === "closeDate" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    const numeric = Number(value);
    if (field === "probability" && !Number.isFinite(numeric)) return;
    setState("saving");
    try {
      await updateDeals({
        data:
          field === "closeDate"
            ? { ids: [deal.id], closeDate: value }
            : { ids: [deal.id], probability: numeric },
      });
      setState("ok");
      onSaved(deal.id, field === "closeDate" ? { closeDate: value } : { probability: numeric });
      setTimeout(() => setState("idle"), 1400);
    } catch {
      setState("error");
      setValue(initial);
      setTimeout(() => setState("idle"), 2200);
    }
  };

  return (
    <input
      className="deal-edit"
      data-state={state}
      type={field === "closeDate" ? "date" : "number"}
      min={field === "probability" ? 0 : undefined}
      max={field === "probability" ? 100 : undefined}
      step={field === "probability" ? 5 : undefined}
      value={value}
      disabled={state === "saving"}
      title={
        field === "closeDate"
          ? "Editar la fecha de cierre en HubSpot"
          : "Editar la probabilidad de cierre en HubSpot (%)"
      }
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") setValue(initial);
      }}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

function dealLine(deal: DealDTO) {
  return [
    deal.name,
    deal.owner,
    deal.stage,
    deal.closeDate,
    deal.amount,
    deal.probability,
    deal.adoboScoreValue < 0 ? "s/n" : deal.adoboScore,
    deal.lostReason ?? "",
    deal.url,
  ].join("\t");
}

/**
 * Editor con formato: barra de acciones (negrita, cursiva, listas, link),
 * atajos de teclado y vista previa de cómo se verá en HubSpot.
 */
function RichTextArea({
  value,
  onChange,
  rows,
  placeholder,
  autoFocus,
  label,
  saveHint,
}: {
  value: string;
  onChange: (next: string) => void;
  rows: number;
  placeholder: string;
  autoFocus?: boolean;
  label: string;
  /** Texto extra al pie: p. ej. el atajo ⌘/Ctrl + Enter para guardar. */
  saveHint?: string | undefined;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [preview, setPreview] = useState(false);

  const wrap = (before: string, after = before, fallback = "texto") => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end) || fallback;
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  const prefixLines = (prefix: string) => {
    const el = ref.current;
    if (!el) return;
    const start = value.lastIndexOf("\n", el.selectionStart - 1) + 1;
    const end = value.indexOf("\n", el.selectionEnd);
    const stop = end === -1 ? value.length : end;
    const block = value.slice(start, stop) || "elemento";
    const lines = block
      .split("\n")
      .map((line, index) => `${prefix === "1. " ? `${index + 1}. ` : prefix}${line.replace(/^([-*]|\d+[.)])\s+/, "")}`)
      .join("\n");
    onChange(`${value.slice(0, start)}${lines}${value.slice(stop)}`);
    requestAnimationFrame(() => el.focus());
  };

  const tools = [
    { label: "B", title: "Negrita (Ctrl/Cmd + B)", run: () => wrap("**"), style: { fontWeight: 700 } },
    { label: "I", title: "Cursiva (Ctrl/Cmd + I)", run: () => wrap("_"), style: { fontStyle: "italic" as const } },
    { label: "S", title: "Tachado", run: () => wrap("~~"), style: { textDecoration: "line-through" as const } },
    { label: "H", title: "Título de sección", run: () => prefixLines("## "), style: {} },
    { label: "•", title: "Lista con viñetas", run: () => prefixLines("- "), style: {} },
    { label: "1.", title: "Lista numerada", run: () => prefixLines("1. "), style: {} },
    { label: "”", title: "Cita", run: () => prefixLines("> "), style: {} },
    { label: "</>", title: "Código", run: () => wrap("`"), style: {} },
    {
      label: "🔗",
      title: "Enlace",
      run: () => wrap("[", "](https://)", "texto del enlace"),
      style: {},
    },
  ];

  return (
    <div className="md-editor">
      <div className="md-toolbar" role="group" aria-label={`Formato de ${label}`}>
        {tools.map((tool) => (
          <button
            key={tool.title}
            type="button"
            className="md-tool"
            title={tool.title}
            aria-label={tool.title}
            style={tool.style}
            onClick={tool.run}
          >
            {tool.label}
          </button>
        ))}
        <button
          type="button"
          className="md-tool"
          data-active={preview}
          title="Ver cómo se verá en HubSpot"
          onClick={() => setPreview((current) => !current)}
        >
          {preview ? "Editar" : "Vista previa"}
        </button>
      </div>
      {preview ? (
        <div
          className="note-input md-preview"
          // El HTML viene de nuestro propio conversor, que escapa todo lo que escribe el usuario.
          dangerouslySetInnerHTML={{
            __html: markdownToHubspotHtml(value) || "<p>Nada escrito todavía…</p>",
          }}
        />
      ) : (
        <textarea
          ref={ref}
          className="note-input"
          autoFocus={autoFocus}
          rows={rows}
          placeholder={placeholder}
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (!(event.metaKey || event.ctrlKey)) return;
            const key = event.key.toLowerCase();
            if (key === "b") {
              event.preventDefault();
              wrap("**");
            } else if (key === "i") {
              event.preventDefault();
              wrap("_");
            }
          }}
        />
      )}
      <p className="md-hint">
        Se admite formato: **negrita**, _cursiva_, listas con - o 1., ## títulos, &gt; citas y [enlaces](https://).
        {saveHint ? <> <span className="md-hint-shortcut">{saveHint}</span></> : null}
      </p>
    </div>
  );
}

/** Popup de bitácora: escribe una nota y la envía a uno o varios deals en HubSpot. */
function NoteDialog({ deals, onClose }: { deals: DealDTO[]; onClose: () => void }) {
  const request = useRef({body:'',id:crypto.randomUUID()});
  const saving = useRef(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [error, setError] = useState("");
  const many = deals.length > 1;
  const subtitle = many
    ? `${deals.length} deals seleccionados`
    : `${deals[0]?.name ?? ""} · ${deals[0]?.owner ?? ""}`;

  const save = async () => {
    if (!text.trim() || saving.current) return;
    saving.current=true;
    if(request.current.body!==text.trim()) request.current={body:text.trim(),id:crypto.randomUUID()};
    setState("saving");
    try {
      for (const deal of deals) {
        const result=await addDealNote({ data: { dealId: deal.id, body: text.trim(),operationId:request.current.id } });
        if(!result.ok) throw new Error(result.error);
      }
      setState("ok");
      setTimeout(onClose, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la nota");
      setState("error");
    } finally {saving.current=false;}
  };

  return (
    <div
      className="modal-backdrop"
      style={{ zIndex: 90 }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal note-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Nota para ${subtitle}`}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void save();
          }
        }}
      >
        <div className="modal-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="pulse-h3">{many ? "Nota para varios deals" : "Nota de bitácora"}</h3>
            <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 14 }}>{subtitle}</p>
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div style={{ padding: "0 24px 24px" }}>
          <RichTextArea
            label="la nota"
            autoFocus
            rows={8}
            placeholder="Qué pasó en la conversación, próximos pasos, riesgos…"
            value={text}
            onChange={setText}
            saveHint={state === "saving" ? undefined : "⌘ / Ctrl + Enter guarda la nota"}
          />
          {state === "error" ? (
            <p style={{ color: "var(--bad)", fontSize: 13, margin: "8px 0 0" }}>{error}</p>
          ) : null}
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 16 }}>
            <button className="copy-btn" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="copy-btn"
              type="button"
              data-state={state === "ok" ? "ok" : "idle"}
              disabled={state === "saving" || !text.trim()}
              onClick={save}
              title={
                state === "saving"
                  ? undefined
                  : state === "ok"
                    ? undefined
                    : many
                      ? `Guardar nota en ${deals.length} deals (⌘ / Ctrl + Enter)`
                      : "Guardar nota en HubSpot (⌘ / Ctrl + Enter)"
              }
            >
              {state === "saving"
                ? "Guardando…"
                : state === "ok"
                  ? "¡Nota guardada!"
                  : many
                    ? `Guardar en ${deals.length} deals`
                    : "Guardar en HubSpot"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}


/** Popup de tarea: crea una tarea en HubSpot asociada al deal. */
function TaskDialog({ deal, onClose }: { deal: DealDTO; onClose: () => void }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [state, setState] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [error, setError] = useState("");

  const save = async () => {
    if (!subject.trim()) return;
    setState("saving");
    try {
      await addDealTask({ data: { dealId: deal.id, subject: subject.trim(), body: body.trim(), dueDate } });
      setState("ok");
      setTimeout(onClose, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la tarea");
      setState("error");
    }
  };

  return (
    <div
      className="modal-backdrop"
      style={{ zIndex: 90 }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="modal note-modal" role="dialog" aria-modal="true" aria-label={`Tarea para ${deal.name}`}>
        <div className="modal-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="pulse-h3">Nueva tarea</h3>
            <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 14 }}>{deal.name} · {deal.owner}</p>
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div style={{ padding: "0 24px 24px" }}>
          <input
            className="modal-search"
            style={{ width: "100%", marginBottom: 10 }}
            autoFocus
            placeholder="Título de la tarea (ej. Llamar para cerrar propuesta)"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            aria-label="Título de la tarea"
          />
          <label style={{ display: "block", color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>
            Fecha de vencimiento
            <input
              className="modal-search"
              style={{ width: "100%", marginTop: 6 }}
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
          <RichTextArea
            label="el detalle de la tarea"
            rows={6}
            placeholder="Detalle de la tarea (opcional)…"
            value={body}
            onChange={setBody}
          />
          {state === "error" ? (
            <p style={{ color: "var(--bad)", fontSize: 13, margin: "8px 0 0" }}>{error}</p>
          ) : null}
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 16 }}>
            <button className="copy-btn" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="copy-btn"
              type="button"
              data-state={state === "ok" ? "ok" : "idle"}
              disabled={state === "saving" || !subject.trim()}
              onClick={save}
            >
              {state === "saving" ? "Creando…" : state === "ok" ? "¡Tarea creada!" : "Crear en HubSpot"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Formulario de cierre perdido (mismas opciones que HubSpot)         */
/* ------------------------------------------------------------------ */

const LOST_MAIN_REASONS = [
  "Cambio prioridad empresa",
  "Presupuesto",
  "Competidor",
  "Ghosting",
  "No-Fit Necesidad",
  "No es Decision Maker",
  "Producto incorrecto y no fit",
  "Canales",
  "Timing",
  "SP - Proyecto Inviable",
  "Producto insuficiente",
  "Mal FUP",
  "Incompatibilidad Facturación",
  "Otro (explicar)",
];

const LOST_INDUSTRIES = [
  "Retail/Ecommerce",
  "Automotriz",
  "Servicios Básicos",
  "Salud",
  "Servicios Financieros",
  "Logistica",
  "Educación",
  "Turismo",
  "Telecomunicaciones",
  "Gobierno",
  "Agencia marketing",
  "Health & Fitness",
  "Venta al por mayor",
  "Legal/Jurídico",
  "Consultora",
  "Servicios generales",
  "Alimentos y bebidas (foodservice)",
  "Servicios IT",
  "Inmobiliaria",
  "Otro",
];

const LOST_COUNTRIES = [
  "Chile",
  "Perú",
  "Colombia",
  "Argentina",
  "Ecuador",
  "Estados Unidos",
  "España",
  "Panamá",
  "Costa Rica",
  "México",
  "Rest of Latin America",
  "Otro",
];

const LOST_DEPARTMENTS = [
  "Ventas",
  "Post Venta",
  "SAC",
  "Marketing",
  "RRSS",
  "CS",
  "RRHH",
  "TI",
  "CX",
  "Administración",
  "Operaciones",
  "Digital",
  "Innovación",
  "Otro",
];

/** Opciones exactas de la propiedad fuente_de_creacion en HubSpot. */
const LOST_SOURCES = [
  "Form de Contacto Inbound",
  "Prospección SDR",
  "Form de Contacto Inbound Cassper",
  "Prospección SDR Cassper",
  "Account Exec",
  "AE Adereso - Recuperación",
  "AE Cassper",
  "AE Cassper - Recuperación",
  "KAM",
  "KAM Adereso - Recuperación",
  "KAM Cassper",
  "KAM Cassper - Recuperación",
  "Customer Success",
  "CS Cassper",
  "Candidato partner",
  "Referido por colaborador Adereso",
  "Referido por partner",
  "Webinar / Ebook",
  "Webinar",
  "RRSS Orgánico",
  "Evento de MKT",
  "Evento WBL Retail Agosto",
  "Evento WBL (20/8)",
  "CX Day Stgo (7/25)",
  "CX Day Colombia",
  "CX Day Colombia (12/11)",
  "Desayuno Utilities Nov.",
  "Referal",
  "Partner Sixbell",
  "Partner Converza",
  "Partner ITNG",
  "Partner BiBB",
  "Partner Gaurum",
  "Partner Glow",
  "Partner Solem",
  "Partner Wise Data",
  "Partner Starmice",
];

/** Popup de cierre perdido: replica el formulario de HubSpot y mueve uno o varios deals. */
function LostDialog({
  deals,
  onClose,
  onDone,
}: {
  deals: DealDTO[];
  onClose: () => void;
  onDone: (ids: string[]) => void;
}) {
  const many = deals.length > 1;
  const first = deals[0]!;
  const [reason, setReason] = useState("");
  const [mainReason, setMainReason] = useState("");
  const [waba, setWaba] = useState(
    !many && first.adobo?.waba === "yes" ? "Sí" : !many && first.adobo?.waba === "no" ? "No" : "",
  );
  const [recontact, setRecontact] = useState("");
  const [amount, setAmount] = useState(!many && first.amountValue > 0 ? String(Math.round(first.amountValue)) : "");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState(many ? "" : (first.country ?? ""));
  const [departments, setDepartments] = useState<string[]>([]);
  const [source, setSource] = useState(
    !many && first.source && LOST_SOURCES.includes(first.source) ? first.source : "",
  );
  const [state, setState] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [error, setError] = useState("");

  const ready =
    reason.trim() && mainReason && waba && industry && country && departments.length > 0 && source;

  const save = async () => {
    if (!ready) return;
    setState("saving");
    setError("");
    try {
      for (const deal of deals) {
        await markDealLostFn({
          data: {
            id: deal.id,
            reason: reason.trim(),
            mainReason,
            waba,
            recontact,
            amount: many ? (deal.amountValue > 0 ? Math.round(deal.amountValue) : null) : amount.trim() ? Number(amount) : null,
            industry,
            country,
            departments,
            source,
          },
        });
      }
      setState("ok");
      onDone(deals.map((deal) => deal.id));
      setTimeout(onClose, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo marcar como perdido");
      setState("error");
    }
  };

  const field = (label: string, required: boolean, control: React.ReactNode) => (
    <label className="lost-field">
      <span>
        {label}
        {required ? <b> *</b> : null}
      </span>
      {control}
    </label>
  );

  return (
    <div
      className="modal-backdrop"
      style={{ zIndex: 92 }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="modal note-modal" role="dialog" aria-modal="true" aria-label={`Cerrar perdido ${first.name}`}>
        <div className="modal-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="pulse-h3">{many ? `Marcar ${deals.length} deals como perdidos` : "Marcar como Deal perdido"}</h3>
            <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 14 }}>
              {many ? "El mismo motivo se aplica a todos los seleccionados" : `${first.name} · ${first.owner}`}
            </p>

          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="lost-form">
          {field(
            "Motivo de cierres perdidos",
            true,
            <textarea
              className="modal-search"
              rows={3}
              autoFocus
              placeholder="Qué pasó, en tus palabras…"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />,
          )}
          {field(
            "Motivo principal de cierre perdido (lista de opciones)",
            true,
            <select className="modal-search" value={mainReason} onChange={(e) => setMainReason(e.target.value)}>
              <option value="">Selecciona…</option>
              {LOST_MAIN_REASONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>,
          )}
          {field(
            "¿Tiene Whatsapp B. API? (durante negociación)",
            true,
            <select className="modal-search" value={waba} onChange={(e) => setWaba(e.target.value)}>
              <option value="">Selecciona…</option>
              <option value="Sí">Sí</option>
              <option value="No">No</option>
            </select>,
          )}
          {field(
            "Recontactar",
            false,
            <input
              className="modal-search"
              type="date"
              value={recontact}
              onChange={(event) => setRecontact(event.target.value)}
            />,
          )}
          {field(
            "Valor",
            false,
            <input
              className="modal-search"
              type="number"
              min={0}
              placeholder="Monto del negocio"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />,
          )}
          {field(
            "Industria Deal",
            true,
            <select className="modal-search" value={industry} onChange={(e) => setIndustry(e.target.value)}>
              <option value="">Selecciona…</option>
              {LOST_INDUSTRIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>,
          )}
          {field(
            "País",
            true,
            <select className="modal-search" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">Selecciona…</option>
              {LOST_COUNTRIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>,
          )}
          {field(
            "DeptCliente",
            true,
            <div className="lost-checks">
              {LOST_DEPARTMENTS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="copy-btn"
                  data-compact="1"
                  data-state={departments.includes(item) ? "ok" : "idle"}
                  onClick={() =>
                    setDepartments((current) =>
                      current.includes(item) ? current.filter((d) => d !== item) : [...current, item],
                    )
                  }
                >
                  {item}
                </button>
              ))}
            </div>,
          )}
          {field(
            "Fuente de creación",
            true,
            <select className="modal-search" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Selecciona…</option>
              {LOST_SOURCES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>,
          )}
          {state === "error" ? <p style={{ color: "var(--bad)", fontSize: 13 }}>{error}</p> : null}
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button className="copy-btn" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="copy-btn"
              type="button"
              data-state={state === "ok" ? "ok" : "idle"}
              disabled={state === "saving" || !ready}
              onClick={save}
            >
              {state === "saving" ? "Guardando…" : state === "ok" ? "¡Deal perdido!" : "Mandar a Deal perdido"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}


type SortKey =
  | "financeAlert"
  | "ssppAlert"
  | "name"
  | "owner"
  | "closeDate"
  | "amount"
  | "probability"
  | "score"
  | "adobo"
  | "nextActivity"
  | "activities"
  | "closeStatus"
  | "stage"
  | "reason"
  | "source"
  | "country"
  | "sequence"
  | "contact"
  | "signal";


type Column = {
  key: SortKey;
  label: string;
  width: string;
  render: (deal: DealDTO) => React.ReactNode;
  caption: (deal: DealDTO) => string;
};

/** Semáforo de contactabilidad calculado en el servidor (fallback defensivo). */
const TEMP_META: Record<string, { label: string; tone: "ok" | "warn" | "bad" | undefined; rank: number }> = {
  cold: { label: "Frío", tone: "bad", rank: 0 },
  low: { label: "Baja contact.", tone: "warn", rank: 1 },
  unknown: { label: "Sin dato", tone: undefined, rank: 2 },
  normal: { label: "Normal", tone: "ok", rank: 3 },
  prehot: { label: "Pre-hot", tone: "ok", rank: 4 },
  hot: { label: "Hot", tone: "ok", rank: 5 },
};

function tempInfo(deal: DealDTO) {
  // Old cached snapshots may still carry inferred temperatures and caps.
  if (deal.adobo?.contactVerified !== true) return {
    state: 'unknown', label: 'Señal no verificable', tone: undefined,
    rank: 2, note: 'Contacto sin frescura y cobertura verificadas', cap: null,
  };
  const state = deal.adobo?.temp ?? null;
  const meta = (state && TEMP_META[state]) || null;
  return {
    state,
    label: deal.adobo?.tempLabel ?? meta?.label ?? "s/n",
    tone: meta?.tone,
    rank: meta?.rank ?? 2,
    note: deal.adobo?.tempNote ?? "",
    cap: deal.adobo?.scoreCap ?? null,
  };
}

function sortValue(deal: DealDTO, key: SortKey): string | number {
  switch (key) {
    case "amount":
      return deal.amountValue;
    case "closeDate":
      return deal.closeDateValue;
    case "probability":
      return deal.probabilityValue;
    case "score":
      return deal.scoreValue;
    case "adobo":
      return deal.adoboScoreValue;
    case "nextActivity":
      return deal.nextActivityValue || "9999";
    case "activities":
      return deal.activities ?? -1;
    case "closeStatus":
      return deal.closeStatusValue;
    case "financeAlert":
      return (deal.financeAlert ?? "").toLowerCase();
    case "ssppAlert":
      return (deal.ssppAlert ?? "").toLowerCase();
    case "reason":
      return (deal.lostReason ?? "").toLowerCase();
    case "source":
      return (deal.source ?? "").toLowerCase();
    case "country":
      return (deal.country ?? "").toLowerCase();
    default:
      return String(deal[key as "name" | "owner" | "stage"] ?? "").toLowerCase();
  }
}

const pretty = (raw: string | null) => {
  if (!raw) return "s/n";
  const clean = String(raw).replace(/_/g, " ").trim();
  if (!clean) return "s/n";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

type Sign = "ok" | "bad" | "warn" | "none";
type Signal = { label: string; value: string; sign: Sign };

const NO_EVIDENCE = "sin evidencia";

const HIDDEN_COLS_KEY = "deal-modal-hidden-columns";

const dateEs = (raw: string | null | undefined) => {
  if (!raw) return NO_EVIDENCE;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return NO_EVIDENCE;
  return new Date(ts).toLocaleDateString("es-CL", { timeZone: "UTC" });
};

const textOr = (raw: string | null | undefined) => (raw && raw.trim() ? raw.trim() : NO_EVIDENCE);

const listOr = (list: string[] | undefined) =>
  list && list.length ? list.map((item) => pretty(item)).join(", ") : NO_EVIDENCE;

const numOr = (value: number | null | undefined, suffix = "") =>
  value === null || value === undefined || !Number.isFinite(value) ? NO_EVIDENCE : `${value}${suffix}`;

/** Señales agrupadas del score; nunca oculta un dato faltante (auditoría de gaps). */
function adoboSignals(deal: DealDTO) {
  const a = deal.adobo;
  const positive: Signal[] = [];
  const risk: Signal[] = [];
  const context: Signal[] = [];

  const tri = (value: string | null | undefined): Sign =>
    value === "si" ? "ok" : value === "no" ? "bad" : value ? "warn" : "none";

  const push = (bucket: Signal[], label: string, value: string, sign: Sign) =>
    bucket.push({ label, value, sign });

  // Positivo / riesgo según evidencia real
  const timing = a?.timing ?? null;
  const timingSign: Sign =
    timing === "0_30" ? "ok" : timing === "sin_timing" || timing === "90_plus" ? "bad" : timing ? "warn" : "none";
  push(timingSign === "bad" ? risk : timingSign === "ok" ? positive : context, "Timing", pretty(timing), timingSign);

  const urgency = a?.urgency ?? null;
  const urgencySign: Sign =
    urgency === "alta" ? "ok" : urgency === "baja" || urgency === "no_detectada" ? "bad" : urgency ? "warn" : "none";
  push(urgencySign === "bad" ? risk : urgencySign === "ok" ? positive : context, "Urgencia", pretty(urgency), urgencySign);

  const gates: { label: string; value: string | null | undefined }[] = [
    { label: "Next step claro", value: a?.nextStepClear },
    { label: "Decisor presente", value: a?.decisionMaker },
    { label: "Presupuesto mencionado", value: a?.budget },
  ];
  for (const gate of gates) {
    const sign = tri(gate.value);
    push(sign === "ok" ? positive : sign === "bad" ? risk : context, gate.label, pretty(gate.value ?? null), sign);
  }

  const fitSign: Sign = a?.fit === "alto" ? "ok" : a?.fit === "bajo" ? "bad" : a?.fit ? "warn" : "none";
  push(fitSign === "ok" ? positive : fitSign === "bad" ? risk : context, "Deal fit", pretty(a?.fit ?? null), fitSign);

  const icpSign: Sign = a?.icpFit === "alto" ? "ok" : a?.icpFit === "bajo" ? "bad" : a?.icpFit ? "warn" : "none";
  push(icpSign === "ok" ? positive : icpSign === "bad" ? risk : context, "ICP fit", pretty(a?.icpFit ?? null), icpSign);

  const wabaSign = tri(a?.waba);
  push(wabaSign === "ok" ? positive : context, "WhatsApp API", pretty(a?.waba ?? null), wabaSign);

  const objection = a?.objection ?? null;
  const objectionSign: Sign = objection === "ninguna" ? "ok" : objection ? "bad" : "none";
  push(objectionSign === "ok" ? positive : objectionSign === "bad" ? risk : context, "Objeción", pretty(objection), objectionSign);

  push(
    a?.risks?.length ? risk : context,
    "Riesgos / restricciones",
    listOr(a?.risks),
    a?.risks?.length ? "bad" : "none",
  );
  push(
    a?.commitments?.length ? risk : context,
    "Compromisos especiales",
    listOr(a?.commitments),
    a?.commitments?.length ? "warn" : "none",
  );

  const rate = a?.contactRate ?? null;
  push(context, "Ratio legado respuestas / intentos", rate === null ? NO_EVIDENCE : `${rate}%`, rate === null ? "none" : "warn");

  // Semáforo de contactabilidad y tope aplicado al score
  const temp = tempInfo(deal);
  const tempSign: Sign = temp.tone === "ok" ? "ok" : temp.tone === "warn" || temp.tone === "bad" ? "bad" : "none";
  push(
    tempSign === "ok" ? positive : tempSign === "bad" ? risk : context,
    "Temperatura",
    temp.note ? `${temp.label} · ${temp.note}` : temp.label,
    tempSign,
  );
  if (temp.cap !== null) {
    push(
      risk,
      "Tope de score",
      `máximo ${temp.cap} por contactabilidad (bruto ${deal.adoboScoreValue < 0 ? NO_EVIDENCE : deal.adoboScore})`,
      "bad",
    );
  }

  // Contexto puro
  push(context, "Pain", pretty(a?.pain ?? null), a?.pain ? "warn" : "none");
  push(context, "Motivo de compra", textOr(a?.buyingMotive), a?.buyingMotive ? "warn" : "none");
  push(context, "Competidor", textOr(a?.competitor), a?.competitor ? "warn" : "none");
  push(context, "Stakeholders", listOr(a?.stakeholders), a?.stakeholders?.length ? "warn" : "none");
  push(context, "Confianza snapshot", pretty(a?.confidence ?? null), a?.confidence ? "warn" : "none");
  push(
    context,
    "Última reunión",
    a?.lastMeetingDate
      ? `${dateEs(a.lastMeetingDate)} · ${pretty(a.lastMeetingType)} · calidad ${pretty(a.lastMeetingQuality)}`
      : NO_EVIDENCE,
    a?.lastMeetingDate ? "warn" : "none",
  );
  push(context, "Intentos de contacto", numOr(a?.contactAttempts), a?.contactAttempts ? "warn" : "none");
  push(context, "Respuestas del prospecto", numOr(a?.contactReplies), a?.contactReplies ? "warn" : "none");
  push(context, "ICP evidencia", textOr(a?.icpEvidence), a?.icpEvidence ? "warn" : "none");

  const missing = [...positive, ...risk, ...context].filter((signal) => signal.sign === "none");
  return { positive, risk, context, missing };
}

/** Full evidence stays behind the score trigger, outside the table's scrolling layers. */
function AdoboDetails({ deal }: { deal: DealDTO }) {
  const a = deal.adobo;
  const { positive, risk, context, missing } = useMemo(() => adoboSignals(deal), [deal]);

  const trend = a?.scoreTrend ?? null;
  const upLabels = positive.filter((s) => s.sign === "ok").map((s) => `${s.label} (${s.value})`);
  const downLabels = risk.filter((s) => s.sign === "bad" || s.sign === "warn").map((s) => `${s.label} (${s.value})`);

  const breakdown = () =>
    [
      `${deal.name} · ${deal.owner}`,
      `Adobo score: ${deal.adoboScoreValue < 0 ? NO_EVIDENCE : deal.adoboScore} · tendencia ${pretty(trend)}`,
      `Driver principal: ${textOr(a?.scoreDriver)}`,
      `Último cambio: ${textOr(a?.scoreChangeReason)} (${dateEs(a?.scoreChangedAt)})`,
      `% cierre HubSpot: ${deal.probability} · etapa ${deal.stage} · cierre ${deal.closeDate}`,
      "",
      `Sube por: ${upLabels.length ? upLabels.join("; ") : NO_EVIDENCE}`,
      `Baja por: ${downLabels.length ? downLabels.join("; ") : NO_EVIDENCE}`,
      `Sin evidencia: ${missing.length ? missing.map((s) => s.label).join("; ") : "ninguna propiedad vacía"}`,
      "",
      ...[...positive, ...risk, ...context].map((s) => `${s.label}: ${s.value}`),
      deal.url,
    ].join("\n");

  const group = (title: string, signals: Signal[], tone: "ok" | "bad" | "warn") => (
    <div className="adobo-group" data-group={tone}>
      <span className="adobo-group-title">{title}</span>
      <div className="adobo-chips">
        {signals.length ? (
          signals.map((signal) => (
            <span className="chip adobo-chip" key={`${title}-${signal.label}`} data-tone={signal.sign === "none" ? undefined : signal.sign} data-empty={signal.sign === "none" ? "1" : undefined}>
              {signal.label}: {signal.value}
            </span>
          ))
        ) : (
          <span className="chip adobo-chip" data-empty="1">{NO_EVIDENCE}</span>
        )}
      </div>
    </div>
  );

  const comparison=adoboScoreComparison(deal,Date.now());
  return (
        <div className="adobo-panel">
          <p className="adobo-comparison-detail">{comparison.detail}</p>
          <div className="adobo-panel-head">
            <div className="adobo-facts">
              <p>
                <strong>Driver principal:</strong> {textOr(a?.scoreDriver)}
              </p>
              <p>
                <strong>Último cambio:</strong> {textOr(a?.scoreChangeReason)} · {dateEs(a?.scoreChangedAt)}
              </p>
              <p>
                <strong>Base HubSpot:</strong> % cierre {deal.probability} · etapa {deal.stage} · cierre {deal.closeDate}
              </p>
            </div>
            <CopyTextButton compact getText={breakdown} title="Copiar el desglose de este deal">
              Copiar desglose
            </CopyTextButton>
          </div>
          {group("Positivo", positive, "ok")}
          {group("Riesgo", risk, "bad")}
          <details className="adobo-extra-context"><summary>Contexto y datos pendientes · {missing.length} campos sin evidencia</summary>
          {group("Contexto", context, "warn")}
          <div className="adobo-explain">
            <p data-sign="ok">
              <strong>Sube por:</strong> {upLabels.length ? upLabels.join(" · ") : NO_EVIDENCE}
            </p>
            <p data-sign="bad">
              <strong>Baja por:</strong> {downLabels.length ? downLabels.join(" · ") : NO_EVIDENCE}
            </p>
            <p data-sign="none">
              <strong>Sin evidencia:</strong>{" "}
              {missing.length ? missing.map((signal) => signal.label).join(" · ") : "ninguna propiedad vacía"}
            </p>
          </div>
          </details>
        </div>
  );
}

function AdoboScoreCell({deal}:{deal:DealDTO}) {
  const [open,setOpen]=useState(false);
  const comparison=adoboScoreComparison(deal,Date.now());
  const capped=deal.adobo?.contactVerified===true ? deal.adobo.cappedScore : null;
  const shown=capped!==null && capped!==undefined && capped>=0 ? capped : deal.adoboScoreValue;
  const score=shown<0 ? '—' : String(Math.round(shown));
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" className="adobo-score-trigger" data-tone={shown<0?'none':shown>=65?'ok':shown>=45?'warn':'bad'} aria-label={`Adobo ${score}: ver detalle de ${deal.name}`} title="Ver composición y cambio del Adobo Score">
      {score}{comparison.delta!==null ? <span className="deal-value-trend" aria-label={comparison.label}>{comparison.delta>0?'↑':comparison.delta<0?'↓':'→'}</span> : null}
    </button></PopoverTrigger>
    <PopoverContent className="adobo-score-popup" align="start" sideOffset={8} role="dialog" aria-label={`Adobo Score de ${deal.name}`} data-adobo-score-popup="true" onEscapeKeyDown={event=>event.stopPropagation()}>
      <header className="adobo-score-popup-heading"><div><h3>Adobo Score · {score}</h3><p>{deal.name}</p></div><button type="button" onClick={()=>setOpen(false)} aria-label="Cerrar detalle Adobo"><X size={16}/></button></header>
      {shown>=0 && shown<deal.adoboScoreValue ? <p className="adobo-comparison-detail">Score bruto {deal.adoboScoreValue} · tope de contactabilidad {shown}. La tendencia compara el score bruto.</p> : null}
      {shown<0 ? <p className="adobo-comparison-detail">Sin score registrado. Los datos ausentes no equivalen a cero.</p> : null}
      <AdoboDetails deal={deal}/>
    </PopoverContent>
  </Popover>;
}

/** Contacto principal del deal + si ya está en una secuencia activa de HubSpot. */
type ContactRow = {
  contactCount: number;
  sequenceActive: boolean | null;
  sequenceEver: boolean | null;
  contactName: string | null;
  contactEmail: string | null;
  contactTitle: string | null;
};

const normText = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\s]+/g, " ");
/** Upsell/Cross sell cuentan como upsell; el resto es oportunidad nueva. */
export const isUpsellDeal = (deal: DealDTO) => /upsell|up sell|cross/.test(normText(deal.segment ?? ""));
/** Producto a contratar = Billetera Engage. */
export const isWalletEngage = (deal: DealDTO) => /billetera/.test(normText(deal.productToHire ?? ""));

/** Texto del contacto para el prompt y la columna Secuencia. */
const contactLabel = (info: ContactRow | undefined) => {
  if (!info) return "sin datos de contacto";
  if (!info.contactEmail && !info.contactName) return "sin contacto asociado en HubSpot";
  const name = info.contactName ?? "sin nombre";
  const mail = info.contactEmail ? ` <${info.contactEmail}>` : "";
  const title = info.contactTitle ? ` · ${info.contactTitle}` : "";
  return `${name}${mail}${title}`;
};

type GlassOption = { value: string; label: string };

const SORT_OPTIONS: GlassOption[] = [
  { value: "adobo", label: "Adobo" },
  { value: "probability", label: "% cierre" },
  { value: "amount", label: "Monto" },
  { value: "closeDate", label: "Fecha · % cierre" },
];

/** Selector desplegable liquid glass: botón compacto + panel flotante translúcido. */
function GlassSelect({
  id,
  label,
  display,
  options,
  activeValues,
  onSelect,
  open,
  onToggle,
}: {
  id: string;
  label: string;
  display: string;
  options: GlassOption[];
  activeValues: string[];
  onSelect: (value: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  return <div className="glass-select" data-open={open ? "1" : undefined}>
    <Popover open={open} onOpenChange={next => { if (next !== open) onToggle(); }}>
      <PopoverTrigger asChild>
        <button type="button" className="glass-select-trigger" aria-expanded={open} aria-haspopup="listbox" aria-controls={`glass-menu-${id}`}>
          <span className="glass-select-label">{label}</span><span className="glass-select-value">{display}</span>
          <svg className="glass-select-chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="glass-select-panel deal-filter-popover" role="listbox" aria-label={label} id={`glass-menu-${id}`} onEscapeKeyDown={event=>event.stopPropagation()}>
        {options.map(option=><button key={option.value} type="button" role="option" aria-selected={activeValues.includes(option.value)} data-active={activeValues.includes(option.value)} onClick={()=>onSelect(option.value)}>{option.label}</button>)}
      </PopoverContent>
    </Popover>
  </div>;
}


export function DealModal({
  payload,
  onClose,
  initialStages,
  pipelineTrend,
  simulation,
  fix,
  ownerBreakdown,
  ownerQuotas,
}: {
  payload: Drilldown | null;
  onClose: () => void;
  /** etapas preseleccionadas por el filtro maestro del tablero */
  initialStages?: string[];
  pipelineTrend?: { labels: string[]; values: number[] } | null;
  /** muestra barras de monto por comercial (solo vista equipo) */
  ownerBreakdown?: boolean;
  /** cuota del período por nombre de comercial (para el % de cumplimiento) */
  ownerQuotas?: Record<string, number> | null;
  /** habilita el modo simulación de cuota dentro del popup */
  simulation?: { quota: number; won: number; label: string; commissionScope?: string } | null;
  /** si viene, muestra el botón Fix con el problema que describe la tarjeta */
  fix?: { problem: string; mode?: "task" | "fup" } | null;
}) {
  const [fixState, setFixState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [fixMsg, setFixMsg] = useState("");
  const [contacts, setContacts] = useState<Record<string, ContactRow>>({});
  const [contactsState, setContactsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [seqFilter, setSeqFilter] = useState<"all" | "active" | "past">("all");
  const [kindFilter, setKindFilter] = useState<"all" | "opportunity" | "upsell">("all");
  const [hideWallet, setHideWallet] = useState(false);
  /** filtro de activación (solo cuando el payload trae los ids sin activar) */
  const [actFilter, setActFilter] = useState<"all" | "off" | "on">("all");

  const [simMode, setSimMode] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "probability",
    dir: "desc",
  });
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [monthFilter, setMonthFilter] = useState<"all" | "this" | "next">("all");
  const [hidden, setHidden] = useState<string[]>([]);
  const [stageFilter, setStageFilter] = useState<string[]>(initialStages ?? []);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, DealEdit>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkDate, setBulkDate] = useState("");
  const [bulkProb, setBulkProb] = useState("");
  const [bulkState, setBulkState] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [bulkError, setBulkError] = useState("");

  const applyEdit = useCallback((id: string, patch: DealEdit) => {
    setEdits((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }, []);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_COLS_KEY);
      if (raw) setHidden(JSON.parse(raw) as string[]);
    } catch {
      /* preferencia local opcional */
    }
  }, []);
  const persistHidden = useCallback((next: string[]) => {
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_COLS_KEY, JSON.stringify(next));
    } catch {
      /* preferencia local opcional */
    }
  }, []);
  const [noteDeal, setNoteDeal] = useState<DealDTO[] | null>(null);
  const [taskDeal, setTaskDeal] = useState<DealDTO | null>(null);
  const [lostDeal, setLostDeal] = useState<DealDTO[] | null>(null);
  // Deals ya mandados a perdido en esta sesión: se marcan hasta el próximo refresco.
  const [lostDone, setLostDone] = useState<string[]>([]);
  const [visiblePayload, setVisiblePayload] = useState<Drilldown | null>(payload);
  const [motionState, setMotionState] = useState<"opening" | "open" | "closing">("opening");
  const closeRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const originRef = useRef<DOMRect | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    if (!payload) return;
    const active = document.activeElement;
    originRef.current = active instanceof HTMLElement ? active.getBoundingClientRect() : null;
    setVisiblePayload(payload);
    setMotionState("opening");
  }, [payload]);

  useEffect(() => {
    if (!visiblePayload || motionState !== "opening") return;
    const frame = requestAnimationFrame(() => setMotionState("open"));
    return () => cancelAnimationFrame(frame);
  }, [visiblePayload, motionState]);

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  const requestClose = useCallback(() => {
    if (motionState === "closing") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    setMotionState("closing");
    closeTimerRef.current = setTimeout(() => {
      setVisiblePayload(null);
      onClose();
    }, 580);
  }, [motionState, onClose]);

  // El reporte se refresca solo cada minuto: sin esta clave estable, cada refresco
  // reiniciaba búsqueda/orden y robaba el foco (cortando lo que se estaba escribiendo).
  const payloadKey = visiblePayload ? `${visiblePayload.title}·${visiblePayload.subtitle}` : null;

  const [scoreHistory,setScoreHistory]=useState<Record<string,PropertyHistoryV1|null>>({});
  useEffect(()=>{
    let cancelled=false;setScoreHistory({});
    if(!visiblePayload) return;
    const ids=[...new Set(visiblePayload.deals.map(d=>d.id))];
    void (async()=>{
      for(let i=0;i<ids.length;i+=50) {
        try {const batch=await getAdoboHistory({data:{ids:ids.slice(i,i+50)}});if(cancelled)return;setScoreHistory(current=>({...current,...batch}));}
        catch {if(cancelled)return; /* missing history remains explicitly unknown */}
      }
    })();
    return ()=>{cancelled=true;};
  },[visiblePayload]);
  const comparedDeal=(deal:DealDTO):DealDTO=>({...deal,adobo:{...deal.adobo,propertyHistory:scoreHistory[deal.id]??null}});
  const handleListScroll = useDealHeaderScroll(modalRef, payloadKey);

  useEffect(() => {
    if (!payloadKey) return;
    setQuery("");
    setSearchOpen(false);
    setOpenMenu(null);
    const requested = visiblePayload?.initialSort;
    setSort(
      requested
        ? { key: requested.key as SortKey, dir: requested.dir }
        : { key: "probability", dir: "desc" },
    );
    setNoteDeal(null);
    setTaskDeal(null);
    setSelected([]);
    setEdits({});
    setBulkDate("");
    setBulkProb("");
    setBulkState("idle");
    setStageFilter(initialStages ?? []);
    setSimMode(false);
    setActFilter(payload?.notActivatedIds?.length ? "off" : "all");
    const focusTimer = setTimeout(() => closeRef.current?.focus(), 380);
    return () => clearTimeout(focusTimer);
    // initialStages viene del filtro maestro: solo se aplica al abrir un listado nuevo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey]);

  useEffect(() => {
    if (!visiblePayload) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || (event.target instanceof Element && event.target.closest("[data-adobo-score-popup]"))) return;
      if (searchOpen) setSearchOpen(false);
      else if (openMenu) setOpenMenu(null);
      else if (lostDeal) setLostDeal(null);
      else if (taskDeal) setTaskDeal(null);
      else if (noteDeal) setNoteDeal(null);
      else requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visiblePayload, requestClose, noteDeal, taskDeal, lostDeal, searchOpen, openMenu]);


  /** Lista base con los cambios guardados en HubSpot ya reflejados. */
  const baseDeals = useMemo(() => {
    if (!visiblePayload) return [];
    return visiblePayload.deals.map((deal) => {
      const edit = edits[deal.id];
      if (!edit) return deal;
      const next = { ...deal };
      if (edit.closeDate) {
        next.closeDateValue = `${edit.closeDate}T00:00:00.000Z`;
        next.closeDate = dateLabel(edit.closeDate);
      }
      if (typeof edit.probability === "number") {
        next.probabilityValue = edit.probability / 100;
        next.probability = `${edit.probability}%`;
      }
      return next;
    });
  }, [visiblePayload, edits]);

  const stagesPresent = useMemo(
    () =>
      [...new Set(baseDeals.map((deal) => deal.stage).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "es", { numeric: true }),
      ),
    [baseDeals],
  );

  /** ids sin activar del listado actual (viene solo en los popups de generación) */
  const actIds = useMemo(() => new Set(visiblePayload?.notActivatedIds ?? []), [visiblePayload]);

  const deals = useMemo(() => {
    if (!visiblePayload) return [];
    const needle = query.trim().toLowerCase();
    let filtered = needle
      ? baseDeals.filter(
          (deal) =>
            deal.name.toLowerCase().includes(needle) ||
            deal.owner.toLowerCase().includes(needle) ||
            deal.stage.toLowerCase().includes(needle) ||
            (deal.lostReason ?? "").toLowerCase().includes(needle),
        )
      : baseDeals;
    if (stageFilter.length) {
      filtered = filtered.filter((deal) => stageFilter.includes(deal.stage));
    }
    if (actFilter !== "all" && actIds.size) {
      filtered = filtered.filter((deal) => (actFilter === "off" ? actIds.has(deal.id) : !actIds.has(deal.id)));
    }
    if (kindFilter !== "all") {
      filtered = filtered.filter((deal) => isUpsellDeal(deal) === (kindFilter === "upsell"));
    }
    if (hideWallet) filtered = filtered.filter((deal) => !isWalletEngage(deal));
    if (seqFilter === "active") {
      filtered = filtered.filter((deal) => contacts[deal.id]?.sequenceActive === true);
    } else if (seqFilter === "past") {
      filtered = filtered.filter(
        (deal) => contacts[deal.id]?.sequenceEver === true && contacts[deal.id]?.sequenceActive !== true,
      );
    }

    if (monthFilter !== "all") {
      const month = currentMonthKey(Date.now(), monthFilter === "next" ? 1 : 0);
      filtered = filtered.filter(deal => closeMonthKey(deal.closeDateValue) === month);
    }
    return [...filtered].sort((a, b) => {
      if (sort.key === "probability") return compareDealProbabilityPriority(a, b, sort.dir);
      if (sort.key === "closeDate") return compareDealClosePriority(a, b, sort.dir);
      const left = sortValue(a, sort.key);
      const right = sortValue(b, sort.key);
      if (left < right) return sort.dir === "asc" ? -1 : 1;
      if (left > right) return sort.dir === "asc" ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }, [visiblePayload, baseDeals, query, sort, monthFilter, stageFilter, seqFilter, contacts, actFilter, actIds, kindFilter, hideWallet]);

  // Con el botón Fix activo cargamos contactos y estado de secuencia de cada deal.
  const contactsLoadedRef = useRef(false);
  useEffect(() => {
    if (!baseDeals.length || contactsLoadedRef.current) return;
    contactsLoadedRef.current = true;
    const ids = baseDeals.map((deal) => deal.id);
    setContactsState("loading");
    void getDealContacts({ data: { ids } })
      .then((list) => {
        const map: Record<string, ContactRow> = {};
        for (const item of list) {
          map[item.dealId] = {
            contactCount: item.contactCount,
            sequenceActive: item.sequenceActive,
            sequenceEver: item.sequenceEver,
            contactName: item.contactName,
            contactEmail: item.contactEmail,
            contactTitle: item.contactTitle,
          };
        }
        setContacts(map);
        setContactsState("ready");
      })
      .catch(() => {
        setContactsState("error");
      });
  }, [baseDeals]);



  /** Prompt para pegar en Codex: deals + contactos, sin los que ya están en secuencia. */
  const fixPrompt = useCallback(() => {
    const usable = deals.filter((deal) => contacts[deal.id]?.sequenceActive !== true);
    const skipped = deals.length - usable.length;
    const head = [
      "Usa la skill de FUP: crea en Gmail un BORRADOR de seguimiento (no enviar) para el contacto principal de cada deal de la lista.",
      "",
      "Reglas:",
      "- Un borrador por deal, dirigido al correo del contacto indicado. Si el deal no tiene contacto con correo, no inventes: déjalo en una lista de pendientes al final.",
      "- No incluyas deals cuyos contactos ya estén inscritos en una secuencia activa de HubSpot (ya vienen excluidos de esta lista).",
      "- No inventes datos, montos, fechas ni compromisos: usa solo lo que aparece abajo.",
      "- Tono cercano y directo, en español de Chile, tuteo. Máximo 120 palabras por correo y cierra con una pregunta concreta que pida el siguiente paso.",
      "- Deja todo en borradores de Gmail. No envíes nada.",
      "",
      `Contexto: ${visiblePayload?.title ?? ""}${fix?.problem ? ` · problema: ${fix.problem}` : ""}.`,
      `Deals a trabajar: ${usable.length}${skipped ? ` (se excluyeron ${skipped} porque sus contactos están en secuencia activa)` : ""}.`,
      "",
    ];
    const body = usable.map((deal) => {
      const info = contacts[deal.id];
      return [
        `- ${deal.name} · ${deal.amount} · ${deal.stage} · dueño ${deal.owner}`,
        `  Contacto: ${contactLabel(info)}`,
        `  Cierre ${deal.closeDate} · próxima actividad ${deal.nextActivity}${deal.nextStep ? ` · next step: ${deal.nextStep}` : ""}`,
        `  Deal en HubSpot: ${deal.url}`,
      ].join("\n");
    });
    return [...head, ...body].join("\n");
  }, [deals, contacts, visiblePayload, fix]);

  const runFix = useCallback(async () => {
    setFixState("loading");
    try {
      if (contactsState === "loading") {
        setFixMsg("Revisando contactos y secuencias…");
      }
      const text = fixPrompt();
      await navigator.clipboard.writeText(text);
      setFixState("ok");
      setFixMsg("He copiado en tu portapapeles un prompt, pégalo en Codex para ponerte al día");
      setTimeout(() => setFixState("idle"), 9000);
    } catch {
      setFixState("error");
      setFixMsg("No pude copiar al portapapeles. Intenta de nuevo.");
    }
  }, [fixPrompt, contactsState]);



  const hasAlerts = useMemo(
    () => (visiblePayload ? visiblePayload.deals.some((deal) => deal.financeAlert || deal.ssppAlert) : false),
    [visiblePayload],
  );
  const hasLost = useMemo(
    () => (visiblePayload ? visiblePayload.deals.some((deal) => deal.lostReason) : false),
    [visiblePayload],
  );

  const hasSignal = useMemo(
    () => (visiblePayload ? visiblePayload.deals.some((deal) => deal.signalDate) : false),
    [visiblePayload],
  );

  const columns = useMemo<Column[]>(() => {
    const base: Column[] = [
      {
        key: "name",
        label: "Deal",
        width: "226px",
        render: (deal) => deal.name,
        caption: () => "",
      },
      {
        key: "owner",
        label: "Comercial",
        width: "96px",
        render: (deal) => deal.owner,
        caption: () => "Comercial",
      },
      {
        key: "closeDate",
        label: "Cierre",
        width: "126px",
        render: (deal) => <InlineEdit deal={deal} field="closeDate" onSaved={applyEdit} />,
        caption: () => "Cierre (editable)",
      },
      {
        key: "amount",
        label: "Monto",
        width: "86px",
        render: (deal) => deal.amount,
        caption: () => "Monto",
      },
      {
        key: "probability",
        label: "% cierre",
        width: "92px",
        render: (deal) => {
          const comparison=closingProbabilityComparison(comparedDeal(deal),Date.now());
          return <div className="deal-probability-value"><InlineEdit deal={deal} field="probability" onSaved={applyEdit}/>{comparison.delta!==null ? <span className="deal-value-trend" title={comparison.detail} aria-label={comparison.detail}>{comparison.delta>0?'↑':comparison.delta<0?'↓':'→'}</span> : null}</div>;
        },
        caption: () => "% cierre (editable)",
      },
      {
        key: "adobo",
        label: "Adobo",
        width: "92px",
        render: (deal) => <AdoboScoreCell deal={comparedDeal(deal)}/>,
        caption: () => "Adobo Score",
      },
      {
        key: "nextActivity",
        label: "Próx. act.",
        width: "92px",
        render: (deal) => deal.nextActivity,
        caption: () => "Próxima actividad",
      },
      {
        key: "activities",
        label: "Activ.",
        width: "64px",
        render: (deal) => (deal.activities == null ? "s/d" : String(deal.activities)),
        caption: (deal) =>
          deal.lastContacted
            ? `Actividades de venta · última ${new Date(deal.lastContacted).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" })}`
            : "Actividades de venta (llamadas, reuniones, correos)",
      },
      {
        key: "closeStatus",
        label: "Estado fecha",
        width: "96px",
        render: (deal) => deal.closeStatus,
        caption: () => "Estado fecha",
      },
      {
        key: "stage",
        label: "Etapa",
        width: "minmax(150px, 180px)",
        render: (deal) => deal.stageFull,
        caption: () => "Etapa",
      },
    ];
    if (hasLost) {
      base.push({
        key: "reason",
        label: "Motivo deal perdido",
        width: "210px",
        render: (deal) =>
          deal.lostReason ? (
            <span className="chip" data-tone="bad">
              {deal.lostReason}
            </span>
          ) : (
            <span style={{ color: "var(--label)" }}>sin motivo</span>
          ),
        caption: () => "Motivo perdido",
      });
    }
    base.push({
      key: "country",
      label: "País",
      width: "90px",
      render: (deal) => deal.country ?? "s/n",
      caption: () => "País del deal",
    },
    {
      key: "source",
      label: "Fuente",
      width: "130px",
      render: (deal) => deal.source ?? "HubSpot",
      caption: () => "Fuente de creación",
    });
    // Columna "Señal detectada" retirada: HubSpot no entrega la fecha real de la señal.
    void hasSignal;
    base.splice(1, 0, {
      key: "contact",
      label: "Contacto",
      width: "170px",
      render: (deal) => {
        const info = contacts[deal.id];
        if (!info) return contactsState === "error" ? "s/n" : "…";
        if (!info.contactName && !info.contactEmail) return <span style={{ color: "var(--label)" }}>sin contacto</span>;
        return <span title={contactLabel(info)}>{info.contactName ?? info.contactEmail}</span>;
      },
      caption: (deal) => {
        const info = contacts[deal.id];
        if (!info) return "";
        return [info.contactTitle, info.contactEmail].filter(Boolean).join(" · ") || (info.contactCount > 1 ? `${info.contactCount} contactos` : "");
      },
    });
    if (fix) {
      // Columna visible por defecto: deja claro qué deals ya están trabajados por una secuencia.
      base.splice(2, 0, {
        key: "sequence",
        label: "Secuencia",
        width: "150px",
        render: (deal) => {
          const info = contacts[deal.id];
          if (!info) return contactsState === "error" ? "s/n" : "…";
          if (info.sequenceActive === true) return <span className="chip" data-tone="ok">En secuencia</span>;
          if (info.sequenceEver === true) return <span className="chip" data-tone="warn">Estuvo en secuencia</span>;
          if (!info.contactCount) return <span className="chip" data-tone="warn">Sin contacto</span>;
          return <span className="chip">Sin secuencia</span>;
        },
        caption: (deal) => {
          const info = contacts[deal.id];
          if (!info) return contactsState === "error" ? "no se pudo revisar" : "revisando…";
          return info.contactEmail ?? `${info.contactCount} contactos`;
        },
      });
    }
    if (hasAlerts) {
      for (const [key, label, get] of [
        ["financeAlert", "Alerta Finanzas", (d: DealDTO) => d.financeAlert],
        ["ssppAlert", "Alerta SSPP", (d: DealDTO) => d.ssppAlert],
      ] as const) {
        base.splice(key === "financeAlert" ? 1 : 2, 0, {
          key,
          label,
          width: "180px",
          render: (deal) =>
            get(deal) ? (
              <span className="chip" data-tone="warn">{get(deal)}</span>
            ) : (
              <span style={{ color: "var(--label)" }}>sin alerta</span>
            ),
          caption: () => label,
        });
      }
    }
    return base;
  }, [hasAlerts, hasLost, hasSignal, applyEdit, fix, contacts, contactsState, scoreHistory]);


  const visibleColumns = useMemo(
    () => columns.filter((column) => column.key === "name" || !hidden.includes(column.key)),
    [columns, hidden],
  );

  // Monto por comercial de los deals visibles (solo se muestra en la vista equipo).
  const ownerBars = useMemo(() => {
    if (!ownerBreakdown) return [] as { owner: string; amount: number; count: number }[];
    const map = new Map<string, { owner: string; amount: number; count: number }>();
    for (const deal of deals) {
      const owner = deal.owner || "Sin comercial";
      const row = map.get(owner) ?? { owner, amount: 0, count: 0 };
      row.amount += deal.amountValue || 0;
      row.count += 1;
      map.set(owner, row);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [deals, ownerBreakdown]);

  const [enrollState, setEnrollState] = useState<"idle" | "confirm" | "saving" | "done">("idle");
  const [enrollMsg, setEnrollMsg] = useState("");

  if (!visiblePayload) return null;


  const origin = originRef.current;
  const viewportCenterX = typeof window === "undefined" ? 0 : window.innerWidth / 2;
  const viewportCenterY = typeof window === "undefined" ? 0 : window.innerHeight / 2;
  const motionStyle = origin
    ? ({
        "--modal-origin-x": `${origin.left + origin.width / 2 - viewportCenterX}px`,
        "--modal-origin-y": `${origin.top + origin.height / 2 - viewportCenterY}px`,
        "--modal-origin-scale-x": `${Math.min(0.48, Math.max(0.14, origin.width / Math.max(modalRef.current?.offsetWidth ?? 1100, 1)))}`,
        "--modal-origin-scale-y": `${Math.min(0.36, Math.max(0.08, origin.height / Math.max(modalRef.current?.offsetHeight ?? 650, 1)))}`,
      } as React.CSSProperties)
    : undefined;

  const monthlySummary = summarizeDealMonths(deals, Date.now());
  const monthMoney = (amount: number) => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:0}).format(amount);
  const total = deals.reduce((sum, deal) => sum + deal.amountValue, 0);
  const ownerBarsMax = ownerBars.length ? Math.max(...ownerBars.map((row) => row.amount)) : 0;

  const gridTemplate = `var(--deal-select-width, 34px) ${visibleColumns.map((column) => column.width).join(" ")}`;
  const selectedIds = selected.filter((id) => deals.some((deal) => deal.id === id));
  const allSelected = deals.length > 0 && selectedIds.length === deals.length;
  const toggleAll = () => setSelected(allSelected ? [] : deals.map((deal) => deal.id));
  const toggleOne = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  const enrollable = selectedIds.filter((id) => {
    const info = contacts[id];
    return info && info.contactEmail && info.sequenceActive !== true;
  });
  const runEnroll = async () => {
    setEnrollState("saving");
    try {
      const res = await enrollTouchpoint({ data: { ids: selectedIds } });
      const ok = res.filter((r) => r.status === "ok").length;
      const issues = res.filter((r) => r.status !== "ok");
      const reasons = [...new Set(issues.map((r) => r.detail))];
      setEnrollMsg(`${ok} inscritos en Touchpoint II${issues.length ? ` · ${issues.length} omitidos (${reasons.join(", ")})` : ""}`);
      setContacts((current) => {
        const next = { ...current };
        for (const r of res) if (r.status === "ok" && next[r.dealId]) next[r.dealId] = { ...next[r.dealId]!, sequenceActive: true };
        return next;
      });
    } catch (err) {
      setEnrollMsg(err instanceof Error ? err.message : "No se pudo inscribir");
    }
    setEnrollState("done");
  };

  const bulkSave = async () => {
    const prob = bulkProb.trim() === "" ? null : Number(bulkProb);
    if (!bulkDate && prob === null) return;
    setBulkState("saving");
    setBulkError("");
    try {
      await updateDeals({
        data: {
          ids: selectedIds,
          closeDate: bulkDate || null,
          probability: prob !== null && Number.isFinite(prob) ? prob : null,
        },
      });
      setEdits((current) => {
        const next = { ...current };
        for (const id of selectedIds) {
          next[id] = {
            ...next[id],
            ...(bulkDate ? { closeDate: bulkDate } : {}),
            ...(prob !== null && Number.isFinite(prob) ? { probability: Math.round(prob) } : {}),
          };
        }
        return next;
      });
      setBulkState("ok");
      setTimeout(() => setBulkState("idle"), 1800);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "No se pudo guardar en HubSpot");
      setBulkState("error");
    }
  };
  const allText = () =>
    [
      `${visiblePayload.title} · ${visiblePayload.subtitle}`,
      visibleColumns.map((column) => column.label).join("\t") + "\tLink",
      ...deals.map((deal) => dealLine(deal)),
    ].join("\n");

  return (
    <div
      className="modal-backdrop"
      data-motion-state={motionState}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section ref={modalRef} className="modal deal-modal-motion" style={motionStyle} data-motion-state={motionState} role="dialog" aria-modal="true" aria-label={visiblePayload.title}>
        <div className="modal-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="deal-modal-intro"><div className="deal-modal-intro-content"><h3 className="pulse-h3">{visiblePayload.title}</h3>
            <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 14 }}>
              {visiblePayload.subtitle} · {deals.length} deals ·{" "}
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              }).format(total)}
            </p>
            </div></div>
            <div className="deal-filter-toolbar" aria-label="Filtros del listado">
              <Popover open={searchOpen} onOpenChange={next=>{setSearchOpen(next);if(next)setOpenMenu(null);}}>
                <PopoverTrigger asChild><button type="button" className="deal-search-trigger" aria-label="Buscar deals" title={query ? `Buscar deals · filtro: ${query}` : 'Buscar deals'} data-active={!!query}><Search size={16} aria-hidden="true"/></button></PopoverTrigger>
                <PopoverContent align="start" sideOffset={10} className="deal-search-popover" onEscapeKeyDown={event=>event.stopPropagation()}>
                  <div className="deal-search-heading"><label htmlFor="deal-list-search">Buscar en el listado</label><button type="button" aria-label="Cerrar búsqueda" onClick={()=>setSearchOpen(false)}><X size={16} aria-hidden="true"/></button></div>
                  <input autoFocus id="deal-list-search" type="search" className="modal-search" placeholder="Deal, comercial, etapa o motivo…" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setSearchOpen(false);}if(event.key==='Enter'){event.preventDefault();setSearchOpen(false);}}} aria-label="Buscar en la lista de deals"/>
                  <div className="deal-search-footer"><span>{deals.length} resultados</span>{query ? <button type="button" onClick={()=>setQuery('')}>Limpiar búsqueda</button> : <span>Enter para volver al listado</span>}</div>
                </PopoverContent>
              </Popover>
              {actIds.size ? (
                <GlassSelect
                  id="activacion"
                  label="Estado"
                  display={actFilter === "off" ? "Sin activar" : actFilter === "on" ? "Activados" : "Todos"}
                  options={[
                    { value: "off", label: "Sin activar" },
                    { value: "on", label: "Activados" },
                    { value: "all", label: "Todos" },
                  ]}
                  activeValues={[actFilter]}
                  onSelect={(value) => {
                    setActFilter(value as "all" | "off" | "on");
                    setOpenMenu(null);
                  }}
                  open={openMenu === "activacion"}
                  onToggle={() => setOpenMenu(openMenu === "activacion" ? null : "activacion")}
                />
              ) : null}
              <GlassSelect
                id="cierre"
                label="Cierre"
                display={monthFilter === "all" ? "Todos" : monthFilter === "this" ? "Este mes" : "Mes siguiente"}
                options={[
                  { value: "all", label: "Todos" },
                  { value: "this", label: "Este mes" },
                  { value: "next", label: "Mes siguiente" },
                ]}
                activeValues={[monthFilter]}
                onSelect={(value) => {
                  setMonthFilter(value as "all" | "this" | "next");
                  setOpenMenu(null);
                }}
                open={openMenu === "cierre"}
                onToggle={() => setOpenMenu(openMenu === "cierre" ? null : "cierre")}
              />
              <GlassSelect
                id="orden"
                label="Orden"
                display={SORT_OPTIONS.find((option) => option.value === sort.key)?.label ?? sort.key}
                options={SORT_OPTIONS}
                activeValues={[sort.key]}
                onSelect={(value) => {
                  setSort({ key: value as SortKey, dir: value === "closeDate" ? "asc" : "desc" });
                  setOpenMenu(null);
                }}
                open={openMenu === "orden"}
                onToggle={() => setOpenMenu(openMenu === "orden" ? null : "orden")}
              />
              {stagesPresent.length > 1 ? (
                <GlassSelect
                  id="etapa"
                  label="Etapa"
                  display={stageFilter.length === 0 ? "Todas" : stageFilter.join(" · ")}
                  options={[
                    { value: "__all", label: "Todas las etapas" },
                    ...stagesPresent.map((stage) => ({ value: stage, label: stage })),
                  ]}
                  activeValues={stageFilter.length === 0 ? ["__all"] : stageFilter}
                  onSelect={(value) => {
                    if (value === "__all") {
                      setStageFilter([]);
                      setOpenMenu(null);
                      return;
                    }
                    setStageFilter((current) =>
                      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
                    );
                  }}
                  open={openMenu === "etapa"}
                  onToggle={() => setOpenMenu(openMenu === "etapa" ? null : "etapa")}
                />
              ) : null}
              <GlassSelect
                id="tipo-oportunidad"
                label="Tipo"
                display={kindFilter === "all" ? "Todos" : kindFilter === "upsell" ? "Upsell" : "Oportunidad"}
                options={[
                  { value: "all", label: "Todos" },
                  { value: "opportunity", label: "Oportunidad" },
                  { value: "upsell", label: "Upsell" },
                ]}
                activeValues={[kindFilter]}
                onSelect={(value) => {
                  setKindFilter(value as "all" | "opportunity" | "upsell");
                  setOpenMenu(null);
                }}
                open={openMenu === "tipo-oportunidad"}
                onToggle={() => setOpenMenu(openMenu === "tipo-oportunidad" ? null : "tipo-oportunidad")}
              />
              <GlassSelect
                id="secuencia"
                label="Secuencia"
                display={
                  seqFilter === "all" ? "Todos" : seqFilter === "active" ? "En secuencia" : "Estuvieron en secuencia"
                }
                options={[
                  { value: "all", label: "Todos" },
                  { value: "active", label: "En secuencia" },
                  { value: "past", label: "Estuvieron en secuencia" },
                ]}
                activeValues={[seqFilter]}
                onSelect={(value) => {
                  setSeqFilter(value as "all" | "active" | "past");
                  setOpenMenu(null);
                }}
                open={openMenu === "secuencia"}
                onToggle={() => setOpenMenu(openMenu === "secuencia" ? null : "secuencia")}
              />
              <GlassSelect
                id="columnas"
                label="Columnas"
                display={hidden.length ? `${hidden.length} ocultas` : "Todas"}
                options={[
                  { value: "__all", label: "Mostrar todas" },
                  ...columns.map((column) => ({ value: column.key, label: column.label })),
                ]}
                activeValues={
                  hidden.length === 0
                    ? ["__all"]
                    : columns
                        .filter((column) => column.key === "name" || !hidden.includes(column.key))
                        .map((column) => column.key)
                }
                onSelect={(value) => {
                  if (value === "__all") {
                    persistHidden([]);
                    setOpenMenu(null);
                    return;
                  }
                  if (value === "name") return;
                  persistHidden(hidden.includes(value) ? hidden.filter((key) => key !== value) : [...hidden, value]);
                }}
                open={openMenu === "columnas"}
                onToggle={() => setOpenMenu(openMenu === "columnas" ? null : "columnas")}
              />
              <label className="filter-chip deal-wallet-toggle" title="Oculta deals cuyo Producto a contratar es Billetera Engage">
                <input type="checkbox" checked={hideWallet} onChange={(e) => setHideWallet(e.target.checked)} aria-label="Ocultar Billetera Engage" /> Sin billeteras
              </label>
              <button
                type="button"
                className="filter-chip"
                title="Marcar o desmarcar todos los deals de la lista"
                onClick={toggleAll}
              >
                {allSelected ? "Deseleccionar" : "Seleccionar"}
              </button>

            </div>
          </div>
          <div className="deal-modal-actions">
            <div className="deal-modal-secondary"><div className="deal-modal-secondary-content">
            {simulation ? (
              <button
                type="button"
                className="copy-btn"
                data-state={simMode ? "ok" : "idle"}
                title="Simular el cierre de la cuota marcando los deals que crees ganables"
                onClick={() => {
                  const next = !simMode;
                  setSimMode(next);
                  if (next) {
                    setSort({ key: "probability", dir: "desc" });
                    setSelected([]);
                  }
                }}
              >
                {simMode ? "Salir de simulación" : "Simular"}
              </button>
            ) : null}
            {fix && payload ? (
              <>
                {fixState === "ok" || fixState === "error" ? (
                  <span className="fix-hint" data-tone={fixState}>
                    {fixMsg}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="copy-btn fix-btn"
                  data-state={fixState === "ok" ? "ok" : "idle"}
                  disabled={fixState === "loading"}
                  onClick={() => void runFix()}
                  title="Copiar al portapapeles el prompt con deals y contactos (sin los que están en secuencia) para pegarlo en Codex"
                >
                  <Zap size={14} aria-hidden="true" /> {fixState === "loading" ? "Copiando…" : "Fix"}
                </button>
              </>
            ) : null}

            <CopyTextButton getText={allText} title="Copiar toda la tabla con sus links">
              Copiar todo
            </CopyTextButton>
            </div></div>
            <button ref={closeRef} className="modal-close" type="button" onClick={requestClose} aria-label="Cerrar">
              ×
            </button>
          </div>
        </div>
        <section className="deal-month-summary" aria-label="Montos por mes según filtros">
          <div className="deal-month-summary-row">
            {monthlySummary.months.map(month=><div className="deal-month-bucket" data-current={month.current} key={month.key}>
              <span>{month.label} {monthlySummary.year}{month.current ? <small> · mes actual</small> : null}</span>
              <strong>{monthMoney(month.amount)}</strong><small>{month.count} {month.count===1?'deal':'deals'}</small>
            </div>)}
            <div className="deal-month-bucket deal-month-total"><span>Total restante Q{monthlySummary.quarter}</span><strong>{monthMoney(monthlySummary.total.amount)}</strong><small>{monthlySummary.total.count} {monthlySummary.total.count===1?'deal':'deals'}</small></div>
          </div>
          {monthlySummary.outside.count || monthlySummary.undated.count ? <p className="deal-month-remainder">
            {monthlySummary.outside.count ? <span>Fuera de estos meses: {monthMoney(monthlySummary.outside.amount)} · {monthlySummary.outside.count} deals</span> : null}
            {monthlySummary.undated.count ? <span>Sin fecha válida: {monthMoney(monthlySummary.undated.amount)} · {monthlySummary.undated.count} deals</span> : null}
          </p> : null}
        </section>
        {simulation && simMode ? (
          (() => {
            const picked = deals.filter((deal) => selectedIds.includes(deal.id));
            const pickedAmount = picked.reduce((acc, deal) => acc + deal.amountValue, 0);
            const simulated = simulation.won + pickedAmount;
            const attain = simulation.quota ? (simulated / simulation.quota) * 100 : 0;
            const left = Math.max(0, simulation.quota - simulated);
            const fmt = (value: number) =>
              new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              }).format(value);
            return (
              <div className="bulk-bar" role="group" aria-label="Simulación de cuota">
                <strong>Simulación · {simulation.label}</strong>
                <span className="bulk-divider" aria-hidden="true" />
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  Cuota {fmt(simulation.quota)} · ganado {fmt(simulation.won)}
                </span>
                <span style={{ fontSize: 13 }}>
                  <strong>{picked.length}</strong> deals marcados · {fmt(pickedAmount)}
                </span>
                <span className="chip" data-tone={attain >= 100 ? "ok" : attain >= 70 ? "warn" : "bad"}>
                  {fmt(simulated)} · {Math.round(attain)}% de la cuota
                </span>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  {left ? `faltan ${fmt(left)}` : "cuota cubierta"}
                </span>
                <CommissionRate attainment={simulation.quota>0?attain:null} scope={simulation.commissionScope??simulation.label} simulated/>
                <button type="button" className="copy-btn" onClick={() => setSelected([])}>
                  Limpiar selección
                </button>
              </div>
            );
          })()
        ) : null}
        {selectedIds.length > 0 && !simMode ? (
          <div className="bulk-bar" role="group" aria-label="Herramientas para los deals seleccionados">
            <strong>{selectedIds.length} deals seleccionados</strong>
            <label>
              Nueva fecha de cierre
              <input type="date" value={bulkDate} onChange={(event) => setBulkDate(event.target.value)} />
            </label>
            <label>
              Nuevo % de cierre
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                placeholder="0-100"
                value={bulkProb}
                onChange={(event) => setBulkProb(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="copy-btn"
              data-state={bulkState === "ok" ? "ok" : "idle"}
              disabled={bulkState === "saving" || (!bulkDate && bulkProb.trim() === "")}
              onClick={bulkSave}
            >
              {bulkState === "saving"
                ? "Guardando…"
                : bulkState === "ok"
                  ? "¡Actualizado en HubSpot!"
                  : `Aplicar a ${selectedIds.length}`}
            </button>
            <span className="bulk-divider" aria-hidden="true" />
            <button
              type="button"
              className="copy-btn"
              title="Escribir la misma nota en todos los deals seleccionados"
              onClick={() => setNoteDeal(deals.filter((deal) => selectedIds.includes(deal.id)))}
            >
              <Pencil className="deal-tool-icon" /> Nota
            </button>
            <button
              type="button"
              className="copy-btn bulk-danger"
              title="Mandar todos los seleccionados a Deal perdido"
              onClick={() => setLostDeal(deals.filter((deal) => selectedIds.includes(deal.id)))}
            >
              <Trash2 className="deal-tool-icon" /> Enviar a Deal Perdido
            </button>
            <span className="bulk-divider" aria-hidden="true" />
            {enrollState === "confirm" ? (
              <>
                <span style={{ fontSize: 13 }}>
                  Inscribir {enrollable.length} contactos · envía el dueño de cada deal
                  {selectedIds.length - enrollable.length ? ` · se omiten ${selectedIds.length - enrollable.length} (en secuencia o sin correo)` : ""}
                </span>
                <button type="button" className="copy-btn" disabled={!enrollable.length} onClick={() => void runEnroll()}>
                  Confirmar
                </button>
                <button type="button" className="copy-btn" onClick={() => setEnrollState("idle")}>
                  Cancelar
                </button>
              </>
            ) : (
              <button
                type="button"
                className="copy-btn"
                disabled={enrollState === "saving"}
                title="Inscribe el contacto principal de cada deal en la secuencia «Touchpoint seguimiento II», enviada por el dueño del deal"
                onClick={() => setEnrollState("confirm")}
              >
                {enrollState === "saving" ? "Inscribiendo…" : "Inscribir en Touchpoint II"}
              </button>
            )}
            {enrollState === "done" && enrollMsg ? <span style={{ fontSize: 13 }}>{enrollMsg}</span> : null}
            <button type="button" className="copy-btn" onClick={() => setSelected([])}>
              Quitar selección
            </button>
            {bulkState === "error" ? <span style={{ color: "var(--bad)", fontSize: 13 }}>{bulkError}</span> : null}
          </div>
        ) : null}
        {ownerBreakdown && ownerBars.length ? (
          <div className="modal-owner-bars">
            <div className="modal-pipeline-trend-head">
              <span>Ganado por comercial</span>
              <small>{`${ownerBars.length} comerciales · largo = vendido · relleno = % cuota`}</small>
            </div>
            <div className="owner-bar-list">
              {ownerBars.map((row) => {
                const quota = ownerQuotas?.[row.owner] ?? 0;
                const pct = quota > 0 ? Math.round((row.amount / quota) * 100) : null;
                const tone = pct === null ? "none" : pct >= 100 ? "ok" : pct >= 60 ? "warn" : "bad";
                return (
                  <div key={row.owner} className="owner-bar-row">
                    <span className="owner-bar-name">{row.owner}</span>
                    <span className="owner-bar-track">
                      <span
                        className="owner-bar-sold"
                        title={pct === null ? "Sin cuota" : `Largo = lo vendido · relleno = ${pct}% de cumplimiento`}
                        style={{ width: `${ownerBarsMax ? (row.amount / ownerBarsMax) * 100 : 0}%` }}
                      >
                        <span className="owner-bar-fill" style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
                      </span>
                    </span>
                    <strong className="owner-bar-amount">{`$${Math.round(row.amount).toLocaleString("en-US")}`}</strong>
                    <small className="owner-bar-count">{`${row.count} deals`}</small>
                    {pct === null ? (
                      <small className="owner-bar-quota" data-tone="none">sin cuota</small>
                    ) : (
                      <small
                        className="owner-bar-quota"
                        data-tone={tone}
                        title={`Cuota del período: $${Math.round(quota).toLocaleString("en-US")}`}
                      >
                        {`${pct}% cuota`}
                      </small>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
        {pipelineTrend?.values.length ? (
          <div className="modal-pipeline-trend">
            <div className="modal-pipeline-trend-head">
              <span>Tendencia del pipeline</span>
              <small>monto abierto al cierre de cada mes</small>
            </div>
            <TrendLine labels={pipelineTrend.labels} values={pipelineTrend.values} compact />
          </div>
        ) : null}
        <div className="deal-list" role="region" aria-label="Listado de negocios" tabIndex={0} onScroll={handleListScroll}>
          {deals.length ? (
            <div className="deal-table">
              <div className="deal-row deal-header" style={{ gridTemplateColumns: gridTemplate }}>
                <span className="deal-head-cell">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Seleccionar todos los deals visibles"
                    title="Seleccionar todos los deals visibles"
                  />
                </span>
                {visibleColumns.map((column) => (
                  <span key={column.key} className="deal-head-cell">
                    <button
                      className="sort-button"
                      title={column.key === "closeDate" ? "Fecha de cierre; a igual fecha, mayor probabilidad primero" : column.key === "probability" ? "Probabilidad de cierre; a igual probabilidad, fecha de cierre más reciente primero" : undefined}
                      type="button"
                      data-active={sort.key === column.key}
                      onClick={() =>
                        setSort((current) =>
                          current.key === column.key
                            ? { key: column.key, dir: current.dir === "asc" ? "desc" : "asc" }
                            : { key: column.key, dir: "asc" },
                        )
                      }
                    >
                      {column.label}
                      {sort.key === column.key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                    {column.key === "name" ? null : (
                      <button
                        type="button"
                        className="col-hide"
                        title={`Ocultar columna ${column.label}`}
                        aria-label={`Ocultar columna ${column.label}`}
                        onClick={() => persistHidden([...hidden, column.key])}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
              {deals.map((deal) => (
                <div key={deal.id}>
                  <div className="deal-row" style={{ gridTemplateColumns: gridTemplate }} data-selected={selectedIds.includes(deal.id) ? "1" : undefined}>
                    <div className="deal-select">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(deal.id)}
                        onChange={() => toggleOne(deal.id)}
                        aria-label={`Seleccionar ${deal.name}`}
                      />
                    </div>
                    {visibleColumns.map((column) => (
                      <div
                        key={column.key}
                        className={column.key === "name" ? "deal-cell deal-cell-name" : "deal-cell"}
                      >
                        <strong>{column.render(deal)}</strong>
                        <span>{column.caption(deal)}</span>
                        {column.key === "name" ? (
                          /* Las herramientas van bajo el nombre y aparecen al pasar el cursor
                             o al enfocar con teclado; en táctil y en filas seleccionadas siempre. */
                          <div className="deal-actions" role="group" aria-label={`Herramientas de ${deal.name}`}>
                            <a
                              className="deal-tool"
                              href={deal.url}
                              target="_blank"
                              rel="noreferrer"
                              title="Abrir el deal en HubSpot"
                              aria-label="Abrir el deal en HubSpot"
                            >
                              <ExternalLink className="deal-tool-icon" />
                            </a>
                            <button
                              type="button"
                              className="deal-tool"
                              title="Escribir una nota de bitácora en este deal"
                              aria-label="Escribir una nota"
                              onClick={() => setNoteDeal([deal])}
                            >
                              <Pencil className="deal-tool-icon" />
                            </button>
                            <button
                              type="button"
                              className="deal-tool"
                              title="Crear una tarea en HubSpot para este deal"
                              aria-label="Crear una tarea"
                              onClick={() => setTaskDeal(deal)}
                            >
                              <ListChecks className="deal-tool-icon" />
                            </button>
                            <CopyTextButton compact getText={() => dealLine(deal)} title="Copiar esta fila con su link" />
                            <button
                              type="button"
                              className="deal-tool deal-tool-danger"
                              data-state={lostDone.includes(deal.id) ? "ok" : "idle"}
                              title="Mandar este deal a Deal perdido (abre el formulario de cierre)"
                              aria-label="Mandar a Deal perdido"
                              onClick={() => setLostDeal([deal])}
                            >
                              {lostDone.includes(deal.id) ? (
                                <CheckCircle2 className="deal-tool-icon" />
                              ) : (
                                <Trash2 className="deal-tool-icon" />
                              )}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">No hay deals para este corte.</div>
          )}
        </div>
      </section>
      {noteDeal ? <NoteDialog deals={noteDeal} onClose={() => setNoteDeal(null)} /> : null}
      {taskDeal ? <TaskDialog deal={taskDeal} onClose={() => setTaskDeal(null)} /> : null}
      {lostDeal ? (
        <LostDialog
          deals={lostDeal}
          onClose={() => setLostDeal(null)}
          onDone={(ids) => setLostDone((current) => [...current, ...ids])}
        />
      ) : null}
    </div>
  );
}
