import { useEffect, useMemo, useRef, useState } from "react";

/** Pasos reales del armado del reporte, con su peso relativo en el total. */
const STEPS: { label: string; detail: string; weight: number }[] = [
  { label: "Conectando con HubSpot", detail: "Autenticando la conexión", weight: 4 },
  { label: "Leyendo negocios del pipeline", detail: "Paginando deals en paralelo", weight: 42 },
  { label: "Cuotas y comerciales", detail: "Metas del trimestre y propietarios", weight: 10 },
  { label: "Tareas y próximas actividades", detail: "Pendientes vencidas y de hoy", weight: 22 },
  { label: "Calculando métricas", detail: "Forecast, higiene, riesgos y Adobo", weight: 18 },
  { label: "Listo", detail: "Ordenando paneles", weight: 4 },
];

const TOTAL_WEIGHT = STEPS.reduce((sum, step) => sum + step.weight, 0);

function fmt(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/**
 * Loading con progreso estimado a partir del tiempo que tardó la última carga
 * medida en el servidor (no un número inventado).
 */
export function LoadingProgress({
  tabs,
  estimateMs,
  title = "Actualizando el reporte en vivo",
  stale,
}: {
  tabs?: React.ReactNode;
  estimateMs?: number | undefined;
  title?: string;
  stale?: string | undefined;
}) {
  const started = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const estimate = Math.max(6000, estimateMs && estimateMs > 0 ? estimateMs : 25_000);

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Date.now() - started.current), 200);
    return () => clearInterval(timer);
  }, []);

  // Avance asintótico: nunca llega a 100% hasta que el dato llega de verdad.
  const ratio = elapsed / estimate;
  const pct = Math.min(97, ratio < 1 ? ratio * 90 : 90 + (1 - Math.exp(-(ratio - 1))) * 7);
  const late = ratio > 1.4;

  const { activeIndex } = useMemo(() => {
    let acc = 0;
    let index = STEPS.length - 1;
    for (let i = 0; i < STEPS.length; i++) {
      acc += (STEPS[i]!.weight / TOTAL_WEIGHT) * 100;
      if (pct <= acc) {
        index = i;
        break;
      }
    }
    return { activeIndex: index };
  }, [pct]);

  const remaining = Math.max(0, estimate - elapsed);

  return (
    <main className="pulse-main">
      {tabs}
      <div className="loader-card" role="status" aria-live="polite">
        <div className="loader-head">
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>
              {stale ? `Copia de ${stale} · refrescando` : "Carga en vivo"}
            </p>
            <h2 className="pulse-h2" style={{ margin: "6px 0 0" }}>
              {title}
            </h2>
          </div>
          <div className="loader-pct">{Math.round(pct)}%</div>
        </div>

        <div className="loader-bar">
          <span style={{ width: `${pct}%` }} />
        </div>

        <p className="loader-eta">
          {late
            ? "HubSpot está respondiendo lento, seguimos reintentando…"
            : `Faltan aprox. ${fmt(remaining)} · la última carga tardó ${fmt(estimate)}`}
        </p>

        <ol className="loader-steps">
          {STEPS.map((step, index) => (
            <li
              key={step.label}
              data-state={index < activeIndex ? "done" : index === activeIndex ? "active" : "todo"}
            >
              <span className="loader-dot" aria-hidden="true">
                {index < activeIndex ? "✓" : index === activeIndex ? "●" : "○"}
              </span>
              <span className="loader-step-text">
                <strong>{step.label}</strong>
                <em>{step.detail}</em>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
