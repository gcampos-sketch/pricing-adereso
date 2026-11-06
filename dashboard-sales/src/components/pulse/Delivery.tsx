import { useMemo } from "react";
import { Metric } from "./PulseDashboard";
import { CopySectionButton } from "./CopyControls";
import type { DeliveryRow, DeliveryScope, Tone } from "@/lib/pulse-types";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const pct = (value: number) => `${Math.round(value)}%`;

/** Une las filas de varios trimestres por etiqueta, sumando y promediando. */
function mergeRows(groups: DeliveryRow[][]): DeliveryRow[] {
  const map = new Map<string, DeliveryRow & { progressSum: number; progressBase: number }>();
  for (const rows of groups) {
    for (const row of rows) {
      const current = map.get(row.label);
      if (!current) {
        map.set(row.label, {
          ...row,
          progressSum: row.avgProgress >= 0 ? row.avgProgress * row.count : 0,
          progressBase: row.avgProgress >= 0 ? row.count : 0,
        });
        continue;
      }
      current.count += row.count;
      current.amount += row.amount;
      if (row.avgProgress >= 0) {
        current.progressSum += row.avgProgress * row.count;
        current.progressBase += row.count;
      }
      if (row.medDays >= 0) current.medDays = Math.max(current.medDays, row.medDays);
    }
  }
  return [...map.values()]
    .map((row) => ({
      ...row,
      avgProgress: row.progressBase ? row.progressSum / row.progressBase : -1,
    }))
    .sort((a, b) => b.amount - a.amount || b.count - a.count);
}

/** Orden oficial del status de contrato según los labels visibles de HubSpot. */
const CONTRACT_ORDER = [
  "NO INICIADO",
  "Elaboración de contrato",
  "Borrador listo",
  "Contrato enviado a Cliente",
  "En revisión de acuerdos",
  "Firmado > 12 meses",
  "Firmado 90 días / Licitación",
  "Firmado 60 días",
  "Firmado 30 días",
  "Firmado + Gestión de Anexos",
  "Firmado + Anexo Firmado",
];

const norm = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const contractOrder = (label: string): number => {
  const value = norm(label);
  const index = CONTRACT_ORDER.findIndex((item) => value.includes(norm(item)));
  if (index >= 0) return index;
  if (value.includes("sin status") || value.includes("sin status de contrato")) return -1;
  return CONTRACT_ORDER.length;
};

const contractTone = (label: string): Tone => {
  const value = norm(label);
  if (value.includes("firmado")) return "ok";
  if (value.includes("no iniciado") || value.includes("sin status")) return "bad";
  return "warn";
};

function RowTable({
  rows,
  onModal,
  firstLabel,
  toneOf,
  showProgress,
}: {
  rows: DeliveryRow[];
  onModal: (key: string) => void;
  firstLabel: string;
  toneOf?: (label: string) => Tone;
  showProgress?: boolean;
}) {
  if (!rows.length) {
    return <div className="empty-state">Sin deals ganados en este corte.</div>;
  }
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <div className="table-wrap">
      <table className="pulse-table">
        <thead>
          <tr>
            <th>{firstLabel}</th>
            <th>Deals</th>
            <th>Monto</th>
            <th>Share</th>
            {showProgress ? <th>Avance kick off</th> : null}
            {showProgress ? <th>Días en etapa</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th>
                {toneOf ? (
                  <span className="chip" data-tone={toneOf(row.label)}>
                    {row.label}
                  </span>
                ) : (
                  row.label
                )}
              </th>
              <td>
                <button className="cell-button" type="button" onClick={() => onModal(row.modal)}>
                  {row.count}
                </button>
              </td>
              <td>{money(row.amount)}</td>
              <td>{total ? pct((row.count / total) * 100) : "—"}</td>
              {showProgress ? <td>{row.avgProgress >= 0 ? pct(row.avgProgress) : "s/n"}</td> : null}
              {showProgress ? (
                <td>{row.medDays >= 0 ? `${Math.round(row.medDays)}d` : "s/n"}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Delivery({
  scope,
  rangeLabel,
  selectedPeriods,
  onModal,
}: {
  scope: DeliveryScope;
  rangeLabel: string;
  selectedPeriods: string[];
  onModal: (key: string) => void;
}) {
  const rows = useMemo(
    () => scope.periods.filter((row) => selectedPeriods.includes(row.period)),
    [scope.periods, selectedPeriods],
  );

  const sum = (pick: (row: (typeof rows)[number]) => number) =>
    rows.reduce((acc, row) => acc + pick(row), 0);

  const wonCount = sum((r) => r.wonCount);
  const devCount = sum((r) => r.devCount);
  const devAmount = sum((r) => r.devAmount);
  const liveCount = sum((r) => r.liveCount);
  const liveAmount = sum((r) => r.liveAmount);
  const stuckCount = sum((r) => r.stuckCount);
  const stuckAmount = sum((r) => r.stuckAmount);
  const progressBase = sum((r) => r.progressBase);
  const progressAvg = progressBase
    ? rows.reduce((acc, r) => acc + (r.avgProgress >= 0 ? r.avgProgress * r.progressBase : 0), 0) /
      progressBase
    : -1;
  const setupPaid = sum((r) => r.setupPaid);
  const setupBase = sum((r) => r.setupBase);
  const mrrPaid = sum((r) => r.mrrPaid);
  const mrrBase = sum((r) => r.mrrBase);

  const signedCount = sum((r) => r.signedCount ?? 0);
  const signedAmount = sum((r) => r.signedAmount ?? 0);
  const kickoffCount = sum((r) => r.kickoffCount ?? 0);
  const kickoffAmount = sum((r) => r.kickoffAmount ?? 0);
  const noKickoffCount = sum((r) => r.noKickoffCount ?? 0);
  const setupPaidAmount = sum((r) => r.setupPaidAmount ?? 0);
  const setupPendingAmount = sum((r) => r.setupPendingAmount ?? 0);
  const mrrPaidAmount = sum((r) => r.mrrPaidAmount ?? 0);
  const mrrPendingAmount = sum((r) => r.mrrPendingAmount ?? 0);

  const projects = useMemo(
    () => mergeRows(rows.map((row) => row.projects ?? [])),
    [rows],
  );
  const portal = useMemo(() => mergeRows(rows.map((row) => row.portal)), [rows]);
  const contracts = useMemo(
    () =>
      mergeRows(rows.map((row) => row.contracts)).sort(
        (a, b) => contractOrder(a.label) - contractOrder(b.label) || b.amount - a.amount,
      ),
    [rows],
  );
  const last = rows[rows.length - 1];
  const warningCount = sum((r) => r.warningCount ?? 0);
  const warningAmount = sum((r) => r.warningAmount ?? 0);
  const pilotCount = sum((r) => r.pilotCount ?? 0);
  const pilotAmount = sum((r) => r.pilotAmount ?? 0);
  const onboardingCount = sum((r) => r.onboardingCount ?? 0);
  const onboardingAmount = sum((r) => r.onboardingAmount ?? 0);
  const lostDevelopmentCount = sum((r) => r.lostDevelopmentCount ?? 0);
  const lostDevelopmentAmount = sum((r) => r.lostDevelopmentAmount ?? 0);

  return (
    <>
      <div className="team-section-head" data-section-head="">
        <h2 className="pulse-h2">Proyectos ganados en curso</h2>
        <span className="eyebrow">
          {scope.name} · {rangeLabel} · desde la firma hasta el inicio de servicio
        </span>
        <CopySectionButton />
      </div>
      <div className="team-section-head">
        <h3 className="pulse-h3">Resumen operativo</h3>
        <span className="eyebrow">pendientes que requieren acción comercial</span>
      </div>
      <section className="grid-4">
        <Metric
          label="Ganados en curso"
          value={String(wonCount - liveCount)}
          note={`${wonCount} ganados · ${liveCount} ya en producción`}
          tone={wonCount ? "neutral" : "neutral"}
          onClick={() => last && onModal(last.wonModal)}
          tooltip="Deals ganados del periodo filtrado que todavía no tienen inicio de servicio registrado."
        />
        <Metric
          label="Sin fecha de kick off"
          value={String(noKickoffCount)}
          note={noKickoffCount ? "requieren coordinación" : "todos agendados"}
          tone={noKickoffCount ? "bad" : "ok"}
          onClick={() => last && onModal(last.noKickoffModal)}
          tooltip="Ganados en curso sin Fecha Kickoff registrada."
        />
        <Metric
          label={`Estancados +30 días`}
          value={String(stuckCount)}
          note={stuckCount ? money(stuckAmount) : "nadie estancado"}
          tone={stuckCount ? "bad" : "ok"}
          onClick={() => last && onModal(last.stuckModal)}
          tooltip="Ganados en curso que llevan más de 30 días en la misma etapa del portal cliente."
        />
        <Metric
          label="Avance hacia kick off"
          value={progressAvg >= 0 ? pct(progressAvg) : "s/n"}
          note={progressBase ? `${progressBase} deals con dato` : "sin dato en HubSpot"}
          tone={progressAvg < 0 ? "neutral" : progressAvg >= 70 ? "ok" : progressAvg >= 40 ? "warn" : "bad"}
          {...(progressAvg >= 0 ? { progress: progressAvg } : {})}
          tooltip="Promedio del avance hacia kick off registrado por Adobo."
        />
      </section>

      <div className="team-section-head">
        <h3 className="pulse-h3">La carrera: etapa 6 → inicio de servicio</h3>
        <span className="eyebrow">
          distribución por etapa actual exacta · no es una suma acumulada
        </span>
      </div>
      <div className="race-track">
        {[
          {
            key: "signed",
            label: "Aún en etapa 6",
            count: signedCount,
            amount: signedAmount,
            tone: signedCount ? ("warn" as Tone) : ("ok" as Tone),
            modal: last?.signedModal,
            hint: "Propuesta firmada que todavía no pasa a proyecto en desarrollo (6.2).",
          },
          {
            key: "warning",
            label: "Warning (6.1)",
            count: warningCount,
            amount: warningAmount,
            tone: "bad" as Tone,
            modal: last?.warningModal,
            hint: "Deals actualmente en la etapa Deal Warning.",
          },
          {
            key: "dev",
            label: "En desarrollo (6.2)",
            count: devCount,
            amount: devAmount,
            tone: "warn" as Tone,
            modal: last?.devModal,
            hint: "Proyecto en desarrollo.",
          },
          {
            key: "pilot",
            label: "Piloto",
            count: pilotCount,
            amount: pilotAmount,
            tone: "warn" as Tone,
            modal: last?.pilotModal,
            hint: "Deals actualmente en etapa piloto.",
          },
          {
            key: "onboarding",
            label: "Onboarding",
            count: onboardingCount,
            amount: onboardingAmount,
            tone: "neutral" as Tone,
            modal: last?.onboardingModal,
            hint: "Deals actualmente en onboarding.",
          },
          {
            key: "live",
            label: "Inicio de servicio",
            count: liveCount,
            amount: liveAmount,
            tone: "ok" as Tone,
            modal: last?.liveModal,
            hint: "Ganados con inicio del servicio poblado (o etapa 8).",
          },
          {
            key: "lost-development",
            label: "Perdido en desarrollo",
            count: lostDevelopmentCount,
            amount: lostDevelopmentAmount,
            tone: "bad" as Tone,
            modal: last?.lostDevelopmentModal,
            hint: "Deals actualmente en Perdido en desarrollo.",
          },
        ].map((step) => (
          <button
            key={step.key}
            className="race-step"
            type="button"
            title={step.hint}
            onClick={() => step.modal && onModal(step.modal)}
          >
            <span className="race-step-label">{step.label}</span>
            <span className="race-bar" aria-hidden="true">
              <i
                data-tone={step.tone}
                style={{ width: `${Math.max(wonCount, lostDevelopmentCount) ? Math.max(step.count ? 3 : 0, (step.count / Math.max(wonCount, lostDevelopmentCount)) * 100) : 0}%` }}
              />
            </span>
            <span className="race-step-value">
              {step.count} · {money(step.amount)}
            </span>
          </button>
        ))}
      </div>
      <div className="team-section-head">
        <h3 className="pulse-h3">Cobranza para comisión</h3>
        <span className="eyebrow">primero lo pendiente · lo pagado se muestra como conteo</span>
      </div>
      <section className="grid-4">
        <Metric
          label="Setup pendiente de pago"
          value={money(setupPendingAmount)}
          note={`${Math.max(0, setupBase - setupPaid)} deals pendientes`}
          tone={setupPendingAmount ? "warn" : "ok"}
          onClick={() => last && onModal(last.setupModal)}
          tooltip="Monto de deals ganados cuyo Status Cobranza Setup / OTF todavía no está en pago recibido."
        />
        <Metric
          label="Primer MRR pendiente"
          value={money(mrrPendingAmount)}
          note={`${Math.max(0, mrrBase - mrrPaid)} deals pendientes`}
          tone={mrrPendingAmount ? "warn" : "ok"}
          onClick={() => last && onModal(last.mrrModal)}
          tooltip="Monto de deals ganados cuyo Status Cobranza MRR todavía no registra pago recibido."
        />
        <Metric
          label="Setup pagado"
          value={String(setupPaid)}
          note="deals habilitados para comisión"
          tone={setupPaid ? "ok" : "neutral"}
          onClick={() => last && onModal(last.setupPaidModal ?? last.setupModal)}
          tooltip="Cantidad de deals cuyo pago de setup/OTF ya fue recibido."
        />
        <Metric
          label="Primer MRR pagado"
          value={String(mrrPaid)}
          note="deals habilitados para comisión"
          tone={mrrPaid ? "ok" : "neutral"}
          onClick={() => last && onModal(last.mrrPaidModal ?? last.mrrModal)}
          tooltip="Cantidad de deals cuyo primer MRR ya fue pagado."
        />
      </section>

      <div className="team-section-head">
        <h3 className="pulse-h3">Status del proyecto</h3>
        <span className="eyebrow">Status Proyecto de HubSpot · planificación, desarrollo y producción</span>
      </div>
      <RowTable rows={projects} onModal={onModal} firstLabel="Status proyecto" showProgress />

      <div className="team-section-head">
        <h3 className="pulse-h3">Estado de contratos</h3>
        <span className="eyebrow">ganados del corte · ordenados por monto para priorizar la firma</span>
      </div>
      <RowTable rows={contracts} onModal={onModal} firstLabel="Status contrato" toneOf={contractTone} />
    </>
  );
}
