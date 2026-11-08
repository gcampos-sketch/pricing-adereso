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
  const [{ elapsed, pct }, setProgress] = useState({ elapsed: 0, pct: 0 });
  const progress = useRef(0);
  const hasEstimate = typeof estimateMs === "number" && Number.isFinite(estimateMs) && estimateMs > 0;
  const estimate = Math.max(6000, hasEstimate ? estimateMs : 25_000);

  useEffect(() => canvas.current ? mountStarfield(canvas.current, { animate: false }) : undefined, []);
  useEffect(() => {
    let frame: number;
    let previousTime = performance.now();
    const tick = (now: number) => {
      const elapsed = Date.now() - started.current;
      const ratio = elapsed / estimate;
      // Estimated only: never claim completion before the report arrives.
      const target = Math.min(97, ratio < 1 ? ratio * 90 : 90 + (1 - Math.exp(-(ratio - 1))) * 7);
      // Damping absorbs late estimate changes without jumps or backwards motion.
      const delta = Math.min(64, Math.max(0, now - previousTime));
      progress.current += Math.max(0, target - progress.current) * (1 - Math.exp(-delta / 240));
      previousTime = now;
      setProgress({ elapsed, pct: progress.current });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [estimate]);

  const ratio = elapsed / estimate;
  const late = ratio > 1.4;
  let threshold = 0;
  const activeIndex = STEPS.findIndex(step => { threshold += step.weight; return pct <= threshold; });
  const messageIndex = Math.floor(elapsed / 4500) % LOADING_MESSAGES.length;

  return (
    <main className="pulse-main report-loading-main">
      {tabs}
      <section className="report-loading" aria-labelledby="report-loading-title" aria-busy="true">
        <canvas ref={canvas} className="report-loading-sky" aria-hidden="true" />
        <div className="report-loading-content">
          <div className="report-loading-eyebrow"><span /> DASHBOARD COMERCIAL</div>
          <div className="report-loading-heading">
            <h2 id="report-loading-title">{title}</h2>
            {stale ? <p>Actualizando la copia de {stale}.</p> : null}
          </div>
          <div className="report-loading-panel">
            <div className="report-loading-current" role="status" aria-live="polite" aria-atomic="true">
              <span className="report-loading-orbit" aria-hidden="true">
                {STEPS.map((step, index) => <step.icon key={step.label} className="report-loading-stage-icon" data-visible={index === activeIndex} size={23} strokeWidth={1.5} />)}
              </span>
              <div className="report-loading-copy">
                <div className="report-loading-caption report-loading-crossfade">
                  {LOADING_MESSAGES.map((message, index) => <span key={message} data-visible={index === messageIndex} aria-hidden={index !== messageIndex}>{message}</span>)}
                </div>
                <div className="report-loading-crossfade">
                  {STEPS.map((step, index) => <strong key={step.label} data-visible={!late && index === activeIndex} aria-hidden={late || index !== activeIndex}>{step.detail}</strong>)}
                  <strong data-visible={late} aria-hidden={!late}>Esperando los datos de HubSpot</strong>
                </div>
              </div>
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
