import { useEffect, useRef, useState } from "react";
import { BarChart3, BriefcaseBusiness, Database, Layers3, ListTodo, Target } from "lucide-react";
import { mountStarfield } from "../../../../starfield.js";
import "./LoadingProgress.css";

// These are illustrative milestones, not server-confirmed completion events.
const STEPS = [
  { label: "Conexión", detail: "Tu información, en un solo lugar", weight: 4, icon: Database },
  { label: "Pipeline", detail: "Negocios y oportunidades", weight: 42, icon: BriefcaseBusiness },
  { label: "Equipo y metas", detail: "Comerciales y cuotas del período", weight: 10, icon: Target },
  { label: "Actividades", detail: "Tareas y próximos pasos", weight: 22, icon: ListTodo },
  { label: "Indicadores", detail: "Resultados, forecast y señales", weight: 18, icon: BarChart3 },
  { label: "Tu dashboard", detail: "Una vista para tus decisiones", weight: 4, icon: Layers3 },
];

const LOADING_MESSAGES = [
  "De los datos a una mirada clara.",
  "Tu pipeline, con todo su contexto.",
  "Menos ruido. Más foco en lo que viene.",
  "Una vista para tu próxima decisión.",
];

function fmt(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

export function LoadingProgress({ tabs, estimateMs, title = "Preparando tu dashboard", stale }: {
  tabs?: React.ReactNode;
  estimateMs?: number | undefined;
  title?: string;
  stale?: string | undefined;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const started = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const hasEstimate = typeof estimateMs === "number" && Number.isFinite(estimateMs) && estimateMs > 0;
  const estimate = Math.max(6000, hasEstimate ? estimateMs : 25_000);

  useEffect(() => canvas.current ? mountStarfield(canvas.current) : undefined, []);
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Date.now() - started.current), 250);
    return () => clearInterval(timer);
  }, []);

  const ratio = elapsed / estimate;
  // Never claim completion before the report actually arrives.
  const pct = Math.min(97, ratio < 1 ? ratio * 90 : 90 + (1 - Math.exp(-(ratio - 1))) * 7);
  const late = ratio > 1.4;
  let threshold = 0;
  const activeIndex = STEPS.findIndex(step => { threshold += step.weight; return pct <= threshold; });
  const stage = STEPS[Math.max(0, activeIndex)]!;
  const messageIndex = Math.floor(elapsed / 4500) % LOADING_MESSAGES.length;

  return (
    <main className="pulse-main report-loading-main">
      {tabs}
      <section className="report-loading" aria-labelledby="report-loading-title" aria-busy="true">
        <canvas ref={canvas} className="report-loading-sky" aria-hidden="true" />
        <div className="report-loading-content">
          <div className="report-loading-signal" aria-hidden="true">
            <span /><span /><span /><span /><span />
          </div>
          <div className="report-loading-eyebrow"><span /> DASHBOARD COMERCIAL</div>
          <div className="report-loading-heading">
            <h2 id="report-loading-title">{title}</h2>
            <p className="report-loading-message">{stale ? `Actualizando la copia de ${stale}.` : <span key={messageIndex}>{LOADING_MESSAGES[messageIndex]}</span>}</p>
          </div>
          <div className="report-loading-panel">
            <div className="report-loading-current" role="status" aria-live="polite" aria-atomic="true">
              <span className="report-loading-orbit" aria-hidden="true"><stage.icon key={stage.label} className="report-loading-stage-icon" size={23} strokeWidth={1.5} /></span>
              <div><span className="report-loading-caption">{late ? "LA CONSULTA SIGUE EN CURSO" : "PREPARANDO TU VISTA"}</span><strong key={late ? "waiting" : stage.label} className="report-loading-stage-message">{late ? "Esperando los datos de HubSpot" : stage.detail}<span className="report-loading-inline-dots" aria-hidden="true"><i /><i /><i /></span></strong></div>
            </div>
            <div className="report-loading-progress-meta"><span>Progreso estimado</span><strong>{Math.round(pct)}<small>%</small></strong></div>
            <div className="report-loading-track" role="progressbar" aria-label="Progreso estimado de carga" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-valuetext={`${Math.round(pct)} por ciento estimado`}><span style={{ width: `${pct}%` }} /></div>
            <ol className="report-loading-milestones" aria-label="Preparación del reporte, secuencia estimada">
              {STEPS.map((step, index) => <li key={step.label} data-state={index === activeIndex ? "active" : index < activeIndex ? "past" : "pending"}>
                <step.icon size={17} strokeWidth={1.5} aria-hidden="true" /><span>{step.label}</span>
              </li>)}
            </ol>
            <div className="report-loading-footnote">
              <span>{late ? "Está tardando más de lo habitual. Seguimos esperando tu reporte." : hasEstimate && elapsed < estimate ? `Aproximadamente ${fmt(estimate - elapsed)} restantes` : "El reporte aparecerá en cuanto estén listos los datos."}</span>
              <span className="report-loading-source"><span /> HubSpot</span>
            </div>
          </div>
          <p className="report-loading-note">Una mirada completa. Mejores decisiones.</p>
        </div>
      </section>
    </main>
  );
}
