import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Trash2, CheckCircle2, Pencil, ListChecks, Zap, Search, X, Mail, MoreHorizontal, TriangleAlert } from "lucide-react";
import type { DealDTO, Drilldown } from "@/lib/pulse-types";
import { adoboScoreComparison, closingProbabilityComparison } from "@/lib/adobo-score-comparison";
import type { PropertyHistoryV1 } from "@/lib/adobo-intelligence";
import { dealSelectionTotal, type SelectionQuota } from "@/lib/deal-selection-total";
import { CopyTextButton } from "./CopyControls";
import { DealSelectionSummary } from "./DealSelectionSummary";
import { TrendLine } from "./MiniCharts";
import { addDealNote, addDealTask, enrollTouchpoint, getDealContacts, getAdoboHistory, markDealLostFn, updateDeals } from "@/lib/pulse.functions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDealHeaderScroll } from "@/hooks/use-deal-header-scroll";
import { compareDealSort, dealKind, initialDealSort, toggleDealSort, type DealKind, type DealSort, type SortKey } from "@/lib/deal-table-sort";
import { closeMonthKey, currentMonthKey, summarizeDealMonths } from "@/lib/deal-month-summary";
import { dealAgeDays } from "@/lib/deal-age";
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


type Column = {
  key: SortKey;
  label: string;
  width: number;
  grow?: number;
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

const pretty = (raw: string | null) => {
  if (!raw) return "s/n";
  const clean = String(raw).replace(/_/g, " ").trim();
  if (!clean) return "s/n";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

type Sign = "ok" | "bad" | "warn" | "none";
type Signal = { label: string; value: string; sign: Sign };

const NO_EVIDENCE = "sin evidencia";


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
    <PopoverContent className="adobo-score-popup" align="start" sideOffset={8} collisionPadding={12} role="dialog" aria-label={`Adobo Score de ${deal.name}`} data-adobo-score-popup="true" onEscapeKeyDown={event=>{event.preventDefault();event.stopPropagation();setOpen(false);}}>
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


function DealActionMenu({name,children}:{name:string;children:React.ReactNode}) {
  const [open,setOpen]=useState(false);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const hovering=useRef(false);
  const content=useRef<HTMLDivElement>(null);
  const cancel=()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;}};
  const close=()=>{cancel();setOpen(false);};
  const leave=()=>{
    cancel();
    timer.current=setTimeout(()=>{
      if(!content.current?.contains(document.activeElement)) setOpen(false);
    },160);
  };
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  return <Popover open={open} onOpenChange={next=>{cancel();setOpen(next);}}>
    <PopoverTrigger asChild><button type="button" className="deal-action-trigger" aria-label={`Acciones de ${name}`} onPointerEnter={event=>{if(event.pointerType!=='mouse')return;cancel();hovering.current=true;timer.current=setTimeout(()=>setOpen(true),80);}} onPointerLeave={event=>{if(event.pointerType==='mouse')leave();}} onKeyDown={()=>{hovering.current=false;}}><MoreHorizontal size={16} aria-hidden="true"/></button></PopoverTrigger>
    <PopoverContent ref={content} className="deal-action-popup" side="right" align="center" sideOffset={-28} collisionPadding={12} role="dialog" aria-label={`Herramientas de ${name}`} data-deal-action-popup="true" onPointerEnter={cancel} onPointerLeave={event=>{if(event.pointerType==='mouse')leave();}} onOpenAutoFocus={event=>{if(hovering.current)event.preventDefault();}} onEscapeKeyDown={event=>{event.preventDefault();event.stopPropagation();close();}} onClick={close}>
      <button type="button" className="deal-action-collapse" aria-label="Contraer herramientas"><MoreHorizontal size={16} aria-hidden="true"/></button>
      {children}
    </PopoverContent>
  </Popover>;
}

const WON_OMITTED_COLUMNS = new Set<SortKey>(['probability', 'adobo', 'activities', 'age', 'nextActivity']);
const modalInitialSort = (requested: DealSort | undefined, won: boolean) => initialDealSort(requested).filter(sort => !won || !WON_OMITTED_COLUMNS.has(sort.key));

export function DealModal({
  payload,
  onClose,
  initialStages,
  initialSummaryDate,
  pipelineTrend,
  selectionQuota,
  fix,
  ownerBreakdown,
  ownerQuotas,
  executiveSummary,
}: {
  executiveSummary?: ReactNode | ((context: { selectedOwner: string | null; onOwnerSelect: (owner: string | null) => void }) => ReactNode);
  payload: Drilldown | null;
  onClose: () => void;
  /** etapas preseleccionadas por el filtro maestro del tablero */
  initialStages?: string[];
  /** Initial month/quarter selection uses the same reversible summary filter as a month-card click. */
  initialSummaryDate?: string | null;
  pipelineTrend?: { labels: string[]; values: number[] } | null;
  /** muestra barras de monto por comercial (solo vista equipo) */
  ownerBreakdown?: boolean;
  /** cuota del período por nombre de comercial (para el % de cumplimiento) */
  ownerQuotas?: Record<string, number> | null;
  /** Base del período para sumar la selección sin una segunda modalidad. */
  selectionQuota?: SelectionQuota | null;
  /** si viene, muestra el botón Fix con el problema que describe la tarjeta */
  fix?: { problem: string; mode?: "task" | "fup" } | null;
}) {
  const isWonView = Boolean(executiveSummary);
  const [summaryOwner, setSummaryOwner] = useState<string | null>(null);
  const [fixState, setFixState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [fixMsg, setFixMsg] = useState("");
  const [contacts, setContacts] = useState<Record<string, ContactRow>>({});
  const [contactsState, setContactsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [seqFilter, setSeqFilter] = useState<"all" | "active" | "past">("all");
  const [kindFilter, setKindFilter] = useState<"all" | DealKind>("all");
  const [hideWallet, setHideWallet] = useState(false);
  /** filtro de activación (solo cuando el payload trae los ids sin activar) */
  const [actFilter, setActFilter] = useState<"all" | "off" | "on">("all");

  const [sort, setSort] = useState<DealSort[]>(() => modalInitialSort(payload?.initialSort as DealSort | undefined, isWonView));
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [summaryDateFilter, setSummaryDateFilter] = useState<string | null>(initialSummaryDate ?? null);
  const [monthFilter, setMonthFilter] = useState<"all" | "this" | "next">("all");
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
    if(!visiblePayload || isWonView) return;
    const ids=[...new Set(visiblePayload.deals.map(d=>d.id))];
    void (async()=>{
      for(let i=0;i<ids.length;i+=50) {
        try {const batch=await getAdoboHistory({data:{ids:ids.slice(i,i+50)}});if(cancelled)return;setScoreHistory(current=>({...current,...batch}));}
        catch {if(cancelled)return; /* missing history remains explicitly unknown */}
      }
    })();
    return ()=>{cancelled=true;};
  },[visiblePayload,isWonView]);
  const comparedDeal=(deal:DealDTO):DealDTO=>({...deal,adobo:{...deal.adobo,propertyHistory:scoreHistory[deal.id]??null}});
  const handleListScroll = useDealHeaderScroll(modalRef, payloadKey);

  useEffect(() => {
    if (!payloadKey) return;
    setQuery("");
    setSummaryOwner(null);
    setSummaryDateFilter(initialSummaryDate ?? null);
    setSearchOpen(false);
    setOpenMenu(null);
    const requested = visiblePayload?.initialSort;
    setSort(modalInitialSort(requested as DealSort | undefined, isWonView));
    setNoteDeal(null);
    setTaskDeal(null);
    setSelected([]);
    setEdits({});
    setBulkDate("");
    setBulkProb("");
    setBulkState("idle");
    setStageFilter(initialStages ?? []);
    setActFilter(payload?.notActivatedIds?.length ? "off" : "all");
    const focusTimer = setTimeout(() => closeRef.current?.focus(), 380);
    return () => clearTimeout(focusTimer);
    // initialStages viene del filtro maestro: solo se aplica al abrir un listado nuevo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey]);

  useEffect(() => {
    if (!visiblePayload) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || (event.target instanceof Element && event.target.closest("[data-adobo-score-popup], [data-deal-action-popup], [data-won-distribution-popup]"))) return;
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

  const dealsBeforeSummary = useMemo(() => {
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
    if (isWonView && summaryOwner) filtered = filtered.filter(deal => (deal.owner || 'Sin comercial') === summaryOwner);
    if (actFilter !== "all" && actIds.size) {
      filtered = filtered.filter((deal) => (actFilter === "off" ? actIds.has(deal.id) : !actIds.has(deal.id)));
    }
    if (kindFilter !== "all") {
      filtered = filtered.filter((deal) => dealKind(deal) === kindFilter);
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
    const now = Date.now();
    return [...filtered].sort((a, b) => compareDealSort(a, b, sort, contacts, now));
  }, [visiblePayload, baseDeals, query, sort, monthFilter, stageFilter, seqFilter, contacts, actFilter, actIds, kindFilter, hideWallet, isWonView, summaryOwner]);

  // This temporary drilldown never mutates the existing filters or their ordering.
  const summaryNow = Date.now();
  const monthlySummary = summarizeDealMonths(dealsBeforeSummary, summaryNow);
  const deals = summaryDateFilter
    ? dealsBeforeSummary.filter(deal => {
        const month = closeMonthKey(deal.closeDateValue);
        return summaryDateFilter === "quarter"
          ? monthlySummary.quarterMonths.some(bucket => bucket.key === month)
          : month === summaryDateFilter;
      })
    : dealsBeforeSummary;
  const toggleSummaryDate = (key: string) => setSummaryDateFilter(current => current === key ? null : key);

  // Load every row in bounded batches, including when another drilldown opens.
  const contactIdsKey = [...new Set(visiblePayload?.deals.map(deal => deal.id) ?? [])].sort().join(",");
  useEffect(() => {
    let cancelled = false;
    setContacts({});
    if (!contactIdsKey) { setContactsState("idle"); return; }
    const ids = contactIdsKey.split(",");
    setContactsState("loading");
    void (async () => {
      let failed = false;
      for (let offset = 0; offset < ids.length; offset += 100) {
        if (cancelled) return;
        try {
          const list = await getDealContacts({ data: { ids: ids.slice(offset, offset + 100) } });
          if (cancelled) return;
          setContacts(current => ({ ...current, ...Object.fromEntries(list.map(item => [item.dealId, item])) }));
        } catch { failed = true; }
      }
      if (!cancelled) setContactsState(failed ? "error" : "ready");
    })();
    return () => { cancelled = true; };
  }, [contactIdsKey]);


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
        width: 164, grow: 1.6,
        render: (deal) => <a className="deal-name-link" href={deal.url} target="_blank" rel="noopener noreferrer" title={`${deal.name} · Abrir negocio en HubSpot`}>{deal.name}</a>,
        caption: () => "",
      },
      {
        key: "owner",
        label: "Comercial",
        width: 68, grow: .7,
        render: (deal) => deal.owner,
        caption: () => "",
      },
      {
        key: "closeDate",
        label: "F. Cierre",
        width: 114,
        render: (deal) => <InlineEdit deal={deal} field="closeDate" onSaved={applyEdit} />,
        caption: () => "",
      },
      {
        key: "amount",
        label: "MRR",
        width: 74,
        render: (deal) => deal.amount,
        caption: () => "",
      },
      {
        key: "setup",
        label: "Setup",
        width: 74,
        render: (deal) => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:0}).format(deal.otfValue ?? 0),
        caption: () => "",
      },
      {
        key: "probability",
        label: "% cierre",
        width: 74,
        render: (deal) => {
          const comparison=closingProbabilityComparison(comparedDeal(deal),Date.now());
          return <div className="deal-probability-value"><InlineEdit deal={deal} field="probability" onSaved={applyEdit}/><span className="deal-value-trend" data-neutral={comparison.delta===null || comparison.delta===0} title={comparison.detail} aria-label={comparison.detail}>{comparison.delta!==null && comparison.delta!==0 ? comparison.delta>0?'↑':'↓' : '·'}</span></div>;
        },
        caption: () => "",
      },
      {
        key: "adobo",
        label: "Adobo",
        width: 64,
        render: (deal) => <AdoboScoreCell deal={comparedDeal(deal)}/>,
        caption: () => "",
      },
      {
        key: "nextActivity",
        label: "Próx. act.",
        width: 90,
        render: (deal) => deal.nextActivity,
        caption: () => "",
      },
      {
        key: "activities",
        label: "Activ.",
        width: 62,
        render: (deal) => (deal.activities == null ? "s/d" : String(deal.activities)),
        caption: (deal) =>
          deal.lastContacted
            ? `Últ. ${new Date(deal.lastContacted).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" })}`
            : "",
      },
      {
        key: "age",
        label: "Días creado",
        width: 78,
        render: (deal) => {
          const days=dealAgeDays(deal.createdAt,Date.now());
          return <span title={days===null ? 'Fecha de creación no disponible' : `Creado el ${new Date(deal.createdAt!).toLocaleString('es-CL')} · días completos transcurridos`}>{days===null ? 's/d' : days}</span>;
        },
        caption: () => "",
      },
      {
        key: "stage",
        label: "Etapa",
        width: 50,
        render: (deal) => <span className="deal-stage-code" title={deal.stageFull} aria-label={`${deal.stage} · ${deal.stageFull}`}>{deal.stage || "s/d"}</span>,
        caption: () => "",
      },
    ];
    if (hasLost) {
      base.push({
        key: "reason",
        label: "Motivo deal perdido",
        width: 168, grow: 1.3,
        render: (deal) =>
          deal.lostReason ? (
            <span className="chip" data-tone="bad">
              {deal.lostReason}
            </span>
          ) : (
            <span style={{ color: "var(--label)" }}>sin motivo</span>
          ),
        caption: () => "",
      });
    }
    base.push({
      key: "country",
      label: "País",
      width: 68, grow: .65,
      render: (deal) => deal.country ?? "s/n",
      caption: () => "",
    },
    {
      key: "source",
      label: "Fuente",
      width: 88, grow: .8,
      render: (deal) => deal.source ?? "HubSpot",
      caption: () => "",
    });
    // Columna "Señal detectada" retirada: HubSpot no entrega la fecha real de la señal.
    void hasSignal;
    base.splice(1, 0, {
      key: "contact",
      label: "Contacto",
      width: 142, grow: 1.5,
      render: (deal) => {
        const info = contacts[deal.id];
        if (!info) return contactsState === "error" || contactsState === "ready" ? <span title="No se pudo cargar el contacto asociado">No disponible</span> : "…";
        if (!info.contactName && !info.contactEmail) return <span style={{ color: "var(--label)" }}>sin contacto</span>;
        return info.contactEmail ? <a className="deal-contact-link" href={`mailto:${encodeURIComponent(info.contactEmail)}`} title={contactLabel(info)} aria-label={`Escribir correo a ${info.contactName ?? 'este contacto'}`}><span>{info.contactName ?? 'Abrir correo'}</span><Mail size={13} aria-hidden="true"/></a> : <span title={info.contactTitle??undefined}>{info.contactName}</span>;
      },
      caption: (deal) => {
        const info = contacts[deal.id];
        if (!info) return "";
        return info.contactCount > 1 ? `${info.contactCount} contactos` : "";
      },
    });
    if (fix) {
      // Columna visible por defecto: deja claro qué deals ya están trabajados por una secuencia.
      base.splice(2, 0, {
        key: "sequence",
        label: "Secuencia",
        width: 108, grow: .8,
        render: (deal) => {
          const info = contacts[deal.id];
          if (!info) return contactsState === "error" || contactsState === "ready" ? <span title="No se pudo cargar el contacto asociado">No disponible</span> : "…";
          if (info.sequenceActive === true) return <span className="chip" data-tone="ok">En secuencia</span>;
          if (info.sequenceEver === true) return <span className="chip" data-tone="warn">Estuvo en secuencia</span>;
          if (!info.contactCount) return <span className="chip" data-tone="warn">Sin contacto</span>;
          return <span className="chip">Sin secuencia</span>;
        },
        caption: (deal) => {
          const info = contacts[deal.id];
          if (!info) return contactsState === "error" ? "no se pudo revisar" : "revisando…";
          return info.contactCount > 1 ? `${info.contactCount} contactos` : "";
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
          width: isWonView && key === 'financeAlert' ? 150 : 132, grow: 1,
          render: (deal) =>
            get(deal) ? (
              isWonView
                ? <span className="deal-alert-text">{get(deal)}</span>
                : <span className="chip" data-tone="warn">{get(deal)}</span>
            ) : (
              <span style={{ color: "var(--label)" }}>{isWonView ? '—' : 'sin alerta'}</span>
            ),
          caption: () => "",
        });
      }
    }
    return base;
  }, [hasAlerts, hasLost, hasSignal, applyEdit, fix, contacts, contactsState, scoreHistory, isWonView]);


  // This adapts every drilldown without persisting an automatic hide as a user preference.
  const multipleOwners = new Set(deals.map(deal => deal.ownerId || deal.owner || "unassigned")).size > 1;
  const availableColumns = useMemo(
    () => columns.filter(column => (column.key !== "owner" || multipleOwners) && (!isWonView || !WON_OMITTED_COLUMNS.has(column.key))),
    [columns, multipleOwners, isWonView],
  );
  const visibleColumns = availableColumns;

  // Monto por comercial de los deals visibles (solo se muestra en la vista equipo).
  const ownerBars = useMemo(() => {
    if (!ownerBreakdown || isWonView) return [] as { owner: string; amount: number; count: number }[];
    const map = new Map<string, { owner: string; amount: number; count: number }>();
    for (const deal of deals) {
      const owner = deal.owner || "Sin comercial";
      const row = map.get(owner) ?? { owner, amount: 0, count: 0 };
      row.amount += deal.amountValue || 0;
      row.count += 1;
      map.set(owner, row);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [deals, ownerBreakdown, isWonView]);

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

  const monthMoney = (amount: number) => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:0}).format(amount);
  const total = deals.reduce((sum, deal) => sum + deal.amountValue, 0);
  const ownerBarsMax = ownerBars.length ? Math.max(...ownerBars.map((row) => row.amount)) : 0;

  const gridTemplate = `var(--deal-select-width, 28px) ${visibleColumns.map(column => column.grow ? `minmax(${column.width}px, ${column.grow}fr)` : `${column.width}px`).join(" ")}`;
  const tableMinimum = `calc(var(--deal-select-width, 28px) + ${visibleColumns.reduce((sum,column)=>sum+column.width,0)}px + ${visibleColumns.length} * var(--deal-column-gap, 10px))`;
  const selectedIds = selected.filter((id) => deals.some((deal) => deal.id === id));
  const selectionTotal = dealSelectionTotal(deals, selectedIds, selectionQuota);
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
  const OwnerBreakdownContainer = executiveSummary ? "details" : "div";
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
      <section ref={modalRef} className="modal deal-modal-motion" style={motionStyle} data-motion-state={motionState} data-won-view={isWonView} role="dialog" aria-modal="true" aria-label={visiblePayload.title}>
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
              {isWonView && ownerBreakdown ? <GlassSelect id="won-owner" label="Comercial" display={summaryOwner ?? 'Todos'}
                options={[{ value: '__all', label: 'Todos' }, ...[...new Set(baseDeals.map(deal => deal.owner || 'Sin comercial'))].sort().map(owner => ({ value: owner, label: owner }))]}
                activeValues={[summaryOwner ?? '__all']} onSelect={owner => { setSummaryOwner(owner === '__all' ? null : owner); setOpenMenu(null); }}
                open={openMenu === 'won-owner'} onToggle={() => setOpenMenu(openMenu === 'won-owner' ? null : 'won-owner')} /> : null}
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
                  setSummaryDateFilter(null);
                  setMonthFilter(value as "all" | "this" | "next");
                  setOpenMenu(null);
                }}
                open={openMenu === "cierre"}
                onToggle={() => setOpenMenu(openMenu === "cierre" ? null : "cierre")}
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
                display={kindFilter === "all" ? "Todos" : kindFilter === "upsell" ? "Upsell" : kindFilter === "crossSell" ? "Cross sell" : "Oportunidad"}
                options={[
                  { value: "all", label: "Todos" },
                  { value: "opportunity", label: "Oportunidad" },
                  { value: "upsell", label: "Upsell" },
                  { value: "crossSell", label: "Cross sell" },
                ]}
                activeValues={[kindFilter]}
                onSelect={(value) => {
                  setKindFilter(value as "all" | DealKind);
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
              <label className="filter-chip deal-wallet-toggle" title="Oculta deals cuyo Producto a contratar es Billetera Engage">
                <input type="checkbox" checked={hideWallet} onChange={(e) => setHideWallet(e.target.checked)} aria-label="Ocultar Billetera Engage" /> Sin billeteras
              </label>
            </div>
          </div>
          <div className="deal-modal-actions">
            <div className="deal-modal-secondary"><div className="deal-modal-secondary-content">
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
        {(typeof executiveSummary === 'function' ? executiveSummary({ selectedOwner: summaryOwner, onOwnerSelect: setSummaryOwner }) : executiveSummary) ?? <section className="deal-month-summary" aria-label="Montos por mes según filtros">
          <div className="deal-month-summary-row">
            {[...monthlySummary.previous, ...monthlySummary.months].map(month=><button type="button" className="deal-month-bucket" data-current={month.current} data-overdue={month.overdue>0} key={month.key}
              aria-pressed={summaryDateFilter === month.key}
              data-dimmed={!!summaryDateFilter && summaryDateFilter !== month.key}
              title={summaryDateFilter === month.key ? "Quitar filtro de mes y volver a los filtros anteriores" : `Filtrar por ${month.label} ${month.year}`}
              onClick={() => toggleSummaryDate(month.key)}>
              <span className="deal-month-label">
                {month.overdue>0 ? <TriangleAlert size={12} aria-label={`${month.overdue} negocios con cierre vencido`} /> : null}
                <span className="deal-month-label-full">{month.label} {month.year}</span>
                <span className="deal-month-label-short" aria-hidden="true">{month.label.slice(0,3)} {String(month.year).slice(-2)}</span>
              </span>
              <strong>{monthMoney(month.amount)}</strong>
              <small>{month.count} {month.count===1?'deal':'deals'}{month.overdue>0 ? ` · ${month.overdue} ${month.overdue===1?'vencido':'vencidos'}` : month.current ? ' · mes actual' : month.key < currentMonthKey(Date.now()) ? ' · mes anterior' : ''}</small>
            </button>)}
            <button type="button" className="deal-month-bucket deal-month-total"
              aria-pressed={summaryDateFilter === "quarter"}
              data-dimmed={!!summaryDateFilter && summaryDateFilter !== "quarter"}
              title={summaryDateFilter === "quarter" ? "Quitar filtro y volver a los filtros anteriores" : "Filtrar por todos los meses de este trimestre"}
              onClick={() => toggleSummaryDate("quarter")}><span className="deal-month-label"><span className="deal-month-label-full">Total Q{monthlySummary.quarter}</span><span className="deal-month-label-short" aria-hidden="true">Total Q{monthlySummary.quarter}</span></span><strong>{monthMoney(monthlySummary.total.amount)}</strong><small>{monthlySummary.total.count} deals · trimestre completo</small></button>
          </div>
          {monthlySummary.outside.count || monthlySummary.undated.count ? <p className="deal-month-remainder">
            {monthlySummary.outside.count ? <span>Fuera de estos meses: {monthMoney(monthlySummary.outside.amount)} · {monthlySummary.outside.count} deals</span> : null}
            {monthlySummary.undated.count ? <span>Sin fecha válida: {monthMoney(monthlySummary.undated.amount)} · {monthlySummary.undated.count} deals</span> : null}
          </p> : null}
          <p className="deal-month-filter-status" aria-live="polite">{summaryDateFilter ? "Filtro por fecha activo · vuelve a pulsar el cuadro seleccionado para quitarlo" : "Pulsa un cuadro para filtrar la tabla por fecha de cierre"}</p>
        </section>}
        <DealSelectionSummary summary={selectionTotal} quota={selectionQuota ?? null} onClear={() => setSelected([])} />
        {selectedIds.length > 0 ? (
          <details className="deal-selection-actions"><summary>Acciones para seleccionados</summary>
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
          </details>
        ) : null}
        {ownerBreakdown && ownerBars.length ? (
          <OwnerBreakdownContainer className="modal-owner-bars">
            {executiveSummary ? <summary className="won-owner-toggle">GANADO POR COMERCIAL · {ownerBars.length} COMERCIALES</summary> : null}
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
          </OwnerBreakdownContainer>
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
            <div className="deal-table" style={{minWidth: tableMinimum}}>
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
                {visibleColumns.map((column) => {
                  const priority = sort.findIndex(item => item.key === column.key);
                  const active = sort[priority];
                  const direction = active?.dir === "desc" ? "descendente" : "ascendente";
                  const nextAction = !active ? "ordenar descendente" : active.dir === "desc" ? "cambiar a ascendente" : "desactivar orden";
                  const description = `${column.label}${active ? ` · prioridad ${priority + 1}, ${direction}` : " · sin orden"}. Clic para ${nextAction}. Las columnas se aplican en orden de activación.`;
                  return <span key={column.key} className={`deal-head-cell deal-head-${column.key}`}>
                    <button
                      className="sort-button"
                      title={description}
                      aria-label={description}
                      aria-pressed={!!active}
                      type="button"
                      data-active={!!active}
                      onClick={() => setSort(current => toggleDealSort(current, column.key))}
                    >
                      <span className="deal-sort-label">{column.label}</span>
                      {active ? <span className="deal-sort-order" aria-hidden="true">{active.dir === "asc" ? "↑" : "↓"}<span className="deal-sort-priority">{priority + 1}</span></span> : null}
                    </button>
                  </span>;
                })}
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
                        className={`deal-cell deal-cell-${column.key}`}
                      >
                        <strong>{column.render(deal)}</strong>
                        {column.caption(deal) ? <span className="deal-cell-context">{column.caption(deal)}</span> : null}
                        {column.key === "name" ? (
                          <DealActionMenu name={deal.name}>
                          <div className="deal-actions" role="group" aria-label={`Herramientas de ${deal.name}`}>
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
                          </DealActionMenu>
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
