import { useMemo, useState } from "react";
import { CompactFilterBar } from "./FilterBar";
import { SectionTitle, useAgo } from "./insights-shared";
import { COACHING_ACTIONS } from "@/lib/coaching-types";
import type { CoachingReport, CoachingRow } from "@/lib/coaching-types";
import { roleOfOwner } from "@/lib/owner-roles";
import { setCoachingStatus } from "@/lib/pulse.functions";

const NO_APLICA = "no_aplica";

function fmtDate(iso: string | null) {
  if (!iso) return "Sin fecha";
  return new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
}

/** lunes de la semana ISO de una fecha */
function weekStart(iso: string) {
  const date = new Date(iso);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function Card({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: string;
}) {
  return (
    <div className="metric" data-tone={tone}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      {note ? <span className="metric-note">{note}</span> : null}
    </div>
  );
}

/** barras simples reutilizando el estilo de plan-bars */
function CountBars({ data }: { data: { key: string; label: string; value: number }[] }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  if (!data.length) return <div className="empty-state">Sin datos en el rango.</div>;
  return (
    <div className="plan-bars hbars">
      {data.map((item) => (
        <div key={item.key} className="plan-bar">
          <span className="plan-bar-label">{item.label}</span>
          <span className="plan-bar-track">
            <span
              className="plan-bar-fill"
              data-tone={item.key === NO_APLICA ? "neutral" : "warning"}
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
            />
          </span>
          <span className="plan-bar-value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export function QualityDashboard({
  report,
  onRefresh,
  isRefreshing,
  tabs,
  role = "all",
  onRole,
}: {
  report: CoachingReport;
  onRefresh: () => void;
  isRefreshing: boolean;
  tabs: React.ReactNode;
  role?: "all" | "AE" | "KAM";
  onRole?: (value: "all" | "AE" | "KAM") => void;
}) {
  const ago = useAgo(report.generatedAt);
  const [year, setYear] = useState(report.years[0] ?? String(new Date().getUTCFullYear()));
  const [quarter, setQuarter] = useState("all");
  const [ownerId, setOwnerId] = useState("team");
  const [typeTab, setTypeTab] = useState<"todos" | "Tipo A" | "Tipo B">("todos");
  const [actionTab, setActionTab] = useState<"pendientes" | "abordados">("pendientes");
  const [saving, setSaving] = useState<string | null>(null);
  const [local, setLocal] = useState<Record<string, "pendiente" | "abordado">>({});
  const [stageFilter, setStageFilter] = useState<string[]>([]);

  const roleOwnerOptions = useMemo(
    () =>
      report.owners
        .filter((owner) => role === "all" || roleOfOwner(owner.id) === role)
        .map((owner) => [owner.id, owner.name] as [string, string]),
    [report.owners, role],
  );

  const scoped = useMemo(() => {
    return report.rows.filter((row) => {
      if (role !== "all" && roleOfOwner(row.ownerId) !== role) return false;
      if (ownerId !== "team" && row.ownerId !== ownerId) return false;
      if (stageFilter.length && !stageFilter.includes(row.stage)) return false;
      if (!row.date) return quarter === "all" && year === report.years[0];
      if (row.date.slice(0, 4) !== year) return false;
      if (quarter !== "all") {
        const month = Number(row.date.slice(5, 7));
        if (Math.floor((month - 1) / 3) + 1 !== Number(quarter)) return false;
      }
      return true;
    });
  }, [report.rows, report.years, ownerId, year, quarter, stageFilter, role]);

  const handleRole = (item: "all" | "AE" | "KAM") => {
    onRole?.(item);
    setOwnerId("team");
  };

  const rows = useMemo(
    () => (typeTab === "todos" ? scoped : scoped.filter((row) => row.meetingType === typeTab)),
    [scoped, typeTab],
  );

  const status = (row: CoachingRow) => local[row.eventKey] ?? row.status;

  const gaps = rows.filter((row) => row.categoryKey !== NO_APLICA);
  const noAplica = rows.length - gaps.length;
  const byCategory = report.categories.map((cat) => ({
    key: cat.key,
    label: cat.label,
    value: rows.filter((row) => row.categoryKey === cat.key).length,
  }));
  const focus = [...byCategory]
    .filter((item) => item.key !== NO_APLICA)
    .sort((a, b) => b.value - a.value)[0];

  const weekly = useMemo(() => {
    const map = new Map<string, { total: number; gaps: number }>();
    for (const row of rows) {
      if (!row.date) continue;
      const key = weekStart(row.date);
      const entry = map.get(key) ?? { total: 0, gaps: 0 };
      entry.total += 1;
      if (row.categoryKey !== NO_APLICA) entry.gaps += 1;
      map.set(key, entry);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-8);
  }, [rows]);
  const weeklyMax = Math.max(...weekly.map(([, item]) => item.total), 1);

  const actionable = gaps.filter((row) =>
    actionTab === "pendientes" ? status(row) === "pendiente" : status(row) === "abordado",
  );
  const openCount = gaps.filter((row) => status(row) === "pendiente").length;
  const doneCount = gaps.length - openCount;

  async function toggle(row: CoachingRow) {
    const next = status(row) === "abordado" ? "pendiente" : "abordado";
    setSaving(row.eventKey);
    try {
      await setCoachingStatus({ data: { eventKey: row.eventKey, status: next } });
      setLocal((current) => ({ ...current, [row.eventKey]: next }));
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="pulse-main">
      {tabs}
      <header className="team-header">
        <div>
          <h1 className="pulse-h1">Calidad Comercial</h1>
          <div className="eyebrow" style={{ marginTop: 16 }}>
            Oportunidades de mejora detectadas por Adobo en las reuniones Tipo A y Tipo B
          </div>
        </div>
      </header>

      <CompactFilterBar
        years={report.years}
        quarters={["1", "2", "3", "4"]}
        owners={roleOwnerOptions}
        year={year}
        quarter={quarter}
        ownerId={ownerId}
        stages={stageFilter}
        onYear={setYear}
        onQuarter={setQuarter}
        onOwner={setOwnerId}
        onStages={setStageFilter}
        role={role}
        onRole={handleRole}
        ago={ago}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
        label="Filtros de calidad comercial"
      />

      <SectionTitle note="Reuniones con análisis registrado en el rango">Indicadores</SectionTitle>
      <section className="grid-4">
        <Card label="Reuniones analizadas" value={String(rows.length)} note="Con categoría registrada" />
        <Card
          label="No aplica sincero"
          value={rows.length ? `${Math.round((noAplica / rows.length) * 100)}%` : "—"}
          note={`${noAplica} reuniones sin gap significativo`}
          tone="success"
        />
        <Card
          label="Gaps reales"
          value={String(gaps.length)}
          note="Reuniones con oportunidad concreta"
          tone={gaps.length ? "warning" : "neutral"}
        />
        <Card
          label="Principal foco"
          value={focus && focus.value ? focus.label : "Sin foco"}
          note={focus && focus.value ? `${focus.value} reuniones` : "No hay gaps en el rango"}
        />
      </section>

      <SectionTitle note="Distribución y evolución de las categorías">Lectura cuanti</SectionTitle>
      <nav className="tabs" aria-label="Tipo de reunión">
        {(["todos", "Tipo A", "Tipo B"] as const).map((item) => (
          <button
            key={item}
            type="button"
            className="tab"
            data-active={typeTab === item}
            onClick={() => setTypeTab(item)}
          >
            {item === "todos" ? "Todos" : item}
          </button>
        ))}
      </nav>
      <div className="split-2" style={{ marginTop: 16 }}>
        <div className="rep-chart">
          <span className="metric-label">Reuniones por categoría</span>
          <div style={{ marginTop: 12 }}>
            <CountBars data={byCategory} />
          </div>
        </div>
        <div className="rep-chart">
          <span className="metric-label">Evolución semanal</span>
          {weekly.length ? (
            <div className="cq-weeks">
              {weekly.map(([week, item]) => (
                <div key={week} className="cq-week" title={`${item.gaps} gaps de ${item.total} reuniones`}>
                  <span className="cq-week-bar" style={{ height: `${(item.total / weeklyMax) * 100}%` }}>
                    <span
                      className="cq-week-gap"
                      style={{ height: `${item.total ? (item.gaps / item.total) * 100 : 0}%` }}
                    />
                  </span>
                  <span className="cq-week-label">{fmtDate(`${week}T00:00:00.000Z`)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ marginTop: 12 }}>
              Sin reuniones con fecha en el rango.
            </div>
          )}
        </div>
      </div>

      <SectionTitle note="Reunión por reunión, con la evidencia registrada">Vista cualí</SectionTitle>
      <div className="table-wrap">
        <table className="pulse-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Comercial</th>
              <th>Tipo</th>
              <th>Negocio</th>
              <th>Categoría</th>
              <th>Evidencia</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 60).map((row) => (
              <tr key={row.eventKey}>
                <td>{fmtDate(row.date)}</td>
                <td>{row.ownerName}</td>
                <td>{row.meetingType}</td>
                <td>{row.dealName}</td>
                <td>{row.categoryLabel}</td>
                <td className="cq-evidence">{row.evidence ?? "Sin evidencia registrada"}</td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={6}>Sin reuniones analizadas en el rango.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <SectionTitle note="Gaps reales convertidos en acciones de coaching">Accionables</SectionTitle>
      <section className="grid-4">
        <Card label="Accionables abiertos" value={String(openCount)} tone={openCount ? "warning" : "success"} />
        <Card label="Abordados" value={`${doneCount}/${gaps.length}`} note="Marcados como trabajados" />
        <Card
          label="Próximo foco"
          value={focus && focus.value ? focus.label : "Sin foco"}
          note="Categoría con más gaps"
        />
      </section>
      <nav className="tabs" style={{ marginTop: 16 }} aria-label="Estado del accionable">
        {(["pendientes", "abordados"] as const).map((item) => (
          <button
            key={item}
            type="button"
            className="tab"
            data-active={actionTab === item}
            onClick={() => setActionTab(item)}
          >
            {item === "pendientes" ? "Pendientes" : "Abordados"}
          </button>
        ))}
      </nav>
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="pulse-table">
          <thead>
            <tr>
              <th>Estado</th>
              <th>Comercial</th>
              <th>Categoría</th>
              <th>Acción sugerida</th>
              <th>Negocio</th>
              <th>Cierre</th>
            </tr>
          </thead>
          <tbody>
            {actionable.slice(0, 60).map((row) => (
              <tr key={row.eventKey}>
                <td>
                  <button
                    type="button"
                    className="tab"
                    disabled={saving === row.eventKey}
                    onClick={() => void toggle(row)}
                  >
                    {status(row) === "abordado" ? "Abordado" : "Marcar abordado"}
                  </button>
                </td>
                <td>{row.ownerName}</td>
                <td>{row.categoryLabel}</td>
                <td className="cq-evidence">
                  {COACHING_ACTIONS[row.categoryKey] ?? "Revisar la evidencia con el comercial."}
                </td>
                <td>{row.dealName}</td>
                <td>{row.closedAt ? fmtDate(row.closedAt) : fmtDate(row.date)}</td>
              </tr>
            ))}
            {!actionable.length ? (
              <tr>
                <td colSpan={6}>
                  {actionTab === "pendientes"
                    ? "No hay accionables pendientes en el rango."
                    : "Todavía no hay accionables abordados."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <SectionTitle note="De dónde sale cada dato de esta página">Fuentes de datos</SectionTitle>
      <div className="split-2">
        <div className="rep-chart">
          <span className="metric-label">Histórico por reunión</span>
          <ul className="cq-source">
            <li>
              <b>Evento</b> coaching-improvement/&lt;diio_id&gt;
            </li>
            <li>
              <b>Categoría</b> categoria_key / categoria_label
            </li>
            <li>
              <b>Evidencia</b> evidencia
            </li>
            <li>
              <b>Relación</b> comercial / fecha / tipo de reunión / negocio
            </li>
          </ul>
        </div>
        <div className="rep-chart">
          <span className="metric-label">Propiedades HubSpot</span>
          <ul className="cq-source">
            <li>
              <b>Selector</b> adobo_oportunidad_de_mejora
            </li>
            <li>
              <b>Evidencia</b> adobo_oportunidad_de_mejora_evidencia
            </li>
            <li>
              <b>Objeto</b> Negocio
            </li>
            <li>
              <b>Uso</b> snapshot operativo del último estado
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
