import { useEffect, useMemo, useState } from "react";
import { DealModal } from "./DealModal";
import { CompactFilterBar } from "./FilterBar";
import { MiniBars, MiniLine } from "./MiniCharts";
import { Metric } from "./PulseDashboard";
import { WinRateCross } from "./WinRateCross";
import { TimeToService } from "./TimeToService";
import type { Drilldown, Tone } from "@/lib/pulse-types";
import type { RepScorecard, ScoreComponent, TeamScorecardReport } from "@/lib/team-types";
import { roleOfOwner } from "@/lib/owner-roles";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const shortPeriod = (period: string) => {
  const [year, q] = period.split("-Q");
  return `Q${q}-${year!.slice(2)}`;
};

const wrText = (stats: { won: number; lost: number }) => {
  const total = stats.won + stats.lost;
  return total ? `${Math.round((stats.won / total) * 100)}% (${stats.won}/${total})` : "s/n";
};

const toneOf = (score: number): Tone => (score >= 75 ? "ok" : score >= 50 ? "warn" : "bad");
const toneLabel: Record<Tone, string> = {
  ok: "Sólido",
  warn: "Atención",
  bad: "En riesgo",
  neutral: "Sin dato",
};

function useAgo(iso: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `hace ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) return restMinutes ? `hace ${hours} h ${restMinutes} min` : `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `hace ${days} d ${restHours} h` : `hace ${days} d`;
}

type Agg = {
  quota: number;
  wonAmount: number;
  wonCount: number;
  lostAmount: number;
  lostCount: number;
  attainment: number;
  wr: { won: number; lost: number };
  meetings: number;
  warningCount: number;
  warningAmount: number;
  score: number;
  tone: Tone;
  components: ScoreComponent[];
  periods: string[];
};

function aggregate(rep: RepScorecard, periods: string[]): Agg {
  const rows = rep.periods.filter((row) => periods.includes(row.period));
  const base: Agg = {
    quota: 0,
    wonAmount: 0,
    wonCount: 0,
    lostAmount: 0,
    lostCount: 0,
    attainment: 0,
    wr: { won: 0, lost: 0 },
    meetings: 0,
    warningCount: 0,
    warningAmount: 0,
    score: 0,
    tone: "neutral",
    components: [],
    periods,
  };
  if (!rows.length) return base;
  for (const row of rows) {
    base.quota += row.quota;
    base.wonAmount += row.wonAmount;
    base.wonCount += row.wonCount;
    base.lostAmount += row.lostAmount;
    base.lostCount += row.lostCount;
    base.wr.won += row.wr.won;
    base.wr.lost += row.wr.lost;
    base.meetings += row.meetings;
    base.warningCount += row.warningCount;
    base.warningAmount += row.warningAmount;
  }
  base.attainment = base.quota ? (base.wonAmount / base.quota) * 100 : 0;
  base.score = Math.round(rows.reduce((acc, row) => acc + row.score, 0) / rows.length);
  base.tone = toneOf(base.score);
  const first = rows[0]!;
  base.components = first.components.map((component, index) => {
    const score = Math.round(
      rows.reduce((acc, row) => acc + (row.components[index]?.score ?? 0), 0) / rows.length,
    );
    return {
      ...component,
      score,
      points: Math.round(score * component.weight),
      detail: rows.length > 1 ? `promedio de ${rows.length} trimestres · ${component.detail}` : component.detail,
    };
  });
  return base;
}

function ScoreDial({ score, tone, size = 76 }: { score: number; tone: Tone; size?: number }) {
  const radius = size / 2 - 5;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference;
  return (
    <span className="score-dial" data-tone={tone} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle className="score-dial-track" cx={size / 2} cy={size / 2} r={radius} />
        <circle
          className="score-dial-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeDasharray={`${filled} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <strong>{score}</strong>
    </span>
  );
}

function ScoreBreakdown({ components }: { components: ScoreComponent[] }) {
  return (
    <div className="score-breakdown">
      {components.map((component) => (
        <div className="score-row" key={component.key}>
          <div className="score-row-head">
            <span>{component.label}</span>
            <span className="score-row-weight">{Math.round(component.weight * 100)}%</span>
          </div>
          <div className="progress" data-tone={toneOf(component.score)}>
            <span style={{ width: `${Math.min(100, Math.max(0, component.score))}%` }} />
          </div>
          <div className="score-row-detail">
            <strong>{component.score}</strong> / 100 · aporta {component.points} pts · {component.detail}
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="team-section-head">
      <h2 className="pulse-h2">{children}</h2>
      {note ? <span className="eyebrow">{note}</span> : null}
    </div>
  );
}

export function TeamDashboard({
  report,
  onRefresh,
  isRefreshing,
  tabs,
  role = "all",
  onRole,
}: {
  report: TeamScorecardReport;
  onRefresh: () => void;
  isRefreshing: boolean;
  tabs: React.ReactNode;
  role?: "all" | "AE" | "KAM";
  onRole?: (value: "all" | "AE" | "KAM") => void;
}) {
  const ago = useAgo(report.generatedAt);
  const [modalKey, setModalKey] = useState<string | null>(null);
  const [year, setYear] = useState(report.currentPeriod.split("-Q")[0]!);
  const [quarter, setQuarter] = useState<string>(report.currentPeriod.split("-Q")[1]!);
  const [repId, setRepId] = useState<string>("team");
  const [stageFilter, setStageFilter] = useState<string[]>([]);

  const roleReps = useMemo(
    () => report.reps.filter((rep) => role === "all" || roleOfOwner(rep.id) === role),
    [report.reps, role],
  );
  const handleRole = (item: "all" | "AE" | "KAM") => {
    onRole?.(item);
    setRepId("team");
  };

  const yearPeriods = useMemo(
    () => report.periods.filter((period) => period.startsWith(`${year}-`)),
    [report.periods, year],
  );
  const selectedPeriods = useMemo(
    () => (quarter === "all" ? yearPeriods : yearPeriods.filter((p) => p.endsWith(`-Q${quarter}`))),
    [yearPeriods, quarter],
  );
  const rangeLabel =
    quarter === "all" ? `Año ${year}` : `Q${quarter} ${year}`;

  const aggs = useMemo(
    () => roleReps.map((rep) => ({ rep, agg: aggregate(rep, selectedPeriods) })),
    [roleReps, selectedPeriods],
  );
  const ranked = useMemo(() => [...aggs].sort((a, b) => a.agg.score - b.agg.score), [aggs]);
  const selected = aggs.find((item) => item.rep.id === repId) ?? null;

  const team = useMemo(() => {
    const totals = {
      quota: 0,
      wonAmount: 0,
      wonCount: 0,
      lostAmount: 0,
      lostCount: 0,
      meetings: 0,
      warningCount: 0,
      openAmount: 0,
      weightedQ: 0,
      wr: { won: 0, lost: 0 },
      score: 0,
    };
    for (const { rep, agg } of aggs) {
      totals.quota += agg.quota;
      totals.wonAmount += agg.wonAmount;
      totals.wonCount += agg.wonCount;
      totals.lostAmount += agg.lostAmount;
      totals.lostCount += agg.lostCount;
      totals.meetings += agg.meetings;
      totals.warningCount += agg.warningCount;
      totals.wr.won += agg.wr.won;
      totals.wr.lost += agg.wr.lost;
      totals.openAmount += rep.openAmount;
      totals.weightedQ += rep.weightedQ;
      totals.score += agg.score;
    }
    return {
      ...totals,
      attainment: totals.quota ? (totals.wonAmount / totals.quota) * 100 : 0,
      score: aggs.length ? Math.round(totals.score / aggs.length) : 0,
    };
  }, [aggs]);

  const distribution = useMemo(() => {
    const counts = { ok: 0, warn: 0, bad: 0 };
    for (const { agg } of aggs) counts[agg.tone === "neutral" ? "warn" : agg.tone] += 1;
    return counts;
  }, [aggs]);

  const wrScope = (report.wrCross ?? []).find((scope) => scope.id === repId) ?? null;
  const rampScope = (report.ramp ?? []).find((scope) => scope.id === repId) ?? null;
  const rampDevScope = (report.rampDev ?? []).find((scope) => scope.id === repId) ?? null;

  const payload: Drilldown | null = modalKey ? report.drilldowns[modalKey] ?? null : null;

  const quartersAvailable = ["1", "2", "3", "4"].filter((q) =>
    report.periods.includes(`${year}-Q${q}`),
  );

  return (
    <main className="pulse-main">
      {tabs}
      <header className="team-header">
        <div>
          <h1 className="pulse-h1">Rendimiento del Equipo</h1>
          <div className="eyebrow" style={{ marginTop: 16 }}>
            Hoja de vida de cada comercial · cuota, gestión, velocidad y actividad en vivo desde HubSpot
          </div>
        </div>
      </header>

      <CompactFilterBar
        years={report.years}
        quarters={quartersAvailable}
        owners={roleReps.map((rep) => [rep.id, rep.name] as [string, string])}
        year={year}
        quarter={quarter}
        ownerId={repId}
        stages={stageFilter}
        onYear={setYear}
        onQuarter={setQuarter}
        onOwner={setRepId}
        onStages={setStageFilter}
        role={role}
        onRole={handleRole}
        ago={ago}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
        label="Filtros del rendimiento del equipo"
      />


      {repId === "team" ? (
        <>
          <SectionTitle note={`${rangeLabel} · ${selectedPeriods.length} trimestre(s)`}>
            Resumen ejecutivo
          </SectionTitle>
          <section className="grid-4">
            <Metric
              label="Cuota del equipo"
              value={money(team.quota)}
              note={`${roleReps.length} comerciales`}
              tooltip="Suma de las cuotas trimestrales (goal targets MRR) de los comerciales en el rango seleccionado."
            />
            <Metric
              label="Ganado / cuota"
              value={money(team.wonAmount)}
              note={`${team.wonCount} deals · ${Math.round(team.attainment)}% de la cuota`}
              tone={toneOf(team.attainment)}
              progress={team.attainment}
              tooltip="MRR ganado en el rango seleccionado frente a la cuota del equipo."
            />
            <Metric
              label="Win rate del rango"
              value={wrText(team.wr)}
              note={`${team.lostCount} perdidos · ${money(team.lostAmount)}`}
              tone={toneOf((team.wr.won / Math.max(1, team.wr.won + team.wr.lost) / 0.35) * 100)}
              tooltip="Deals ganados sobre el total de deals cerrados (ganados + perdidos) por fecha de cierre en el rango."
            />
            <Metric
              label="Score promedio"
              value={String(team.score)}
              note={`${distribution.ok} verde · ${distribution.warn} ámbar · ${distribution.bad} rojo`}
              tone={toneOf(team.score)}
              tooltip="Promedio del score de performance de los comerciales (0-100) en el rango seleccionado."
            />
          </section>

          <section className="grid-4" style={{ marginTop: 16 }}>
            <Metric
              label="Reuniones del rango"
              value={String(team.meetings)}
              note="objeto reuniones de HubSpot"
              tooltip="Reuniones cuyo inicio cae dentro del rango, asignadas a los comerciales."
            />
            <Metric
              label="Pipeline abierto hoy"
              value={money(team.openAmount)}
              note="etapas gestionables E1-E5.1"
              tooltip="Foto actual del pipeline abierto de los comerciales, independiente del rango seleccionado."
            />
            <Metric
              label="Pronóstico Q actual"
              value={money(team.weightedQ)}
              note="ponderado por probabilidad"
              tooltip="Pipeline con cierre en el trimestre en curso, ponderado por la probabilidad de su etapa."
            />
            <Metric
              label="Deals marcados en riesgo"
              value={String(team.warningCount)}
              note="on-track = No o con pinzas"
              tone={team.warningCount ? "warn" : "ok"}
              tooltip="Deals creados en el rango marcados fuera de on-track o con seguimiento con pinzas."
            />
          </section>

          <SectionTitle note="ordenado por score, el más urgente primero">
            Score por comercial
          </SectionTitle>
          <div className="score-cards">
            {ranked.map(({ rep, agg }) => (
              <button
                key={rep.id}
                className="score-card"
                type="button"
                data-tone={agg.tone}
                onClick={() => setRepId(rep.id)}
              >
                <div className="score-card-top">
                  <ScoreDial score={agg.score} tone={agg.tone} />
                  <div>
                    <strong className="score-card-name">{rep.name}</strong>
                    <span className="status" data-tone={agg.tone}>
                      {toneLabel[agg.tone]}
                    </span>
                    <div className="score-card-tenure">
                      En Adereso ~{rep.tenureLabel} · {rep.openCount} deals abiertos
                    </div>
                  </div>
                </div>
                <div className="score-card-grid">
                  <span>
                    <em>Cuota</em>
                    {Math.round(agg.attainment)}%
                  </span>
                  <span>
                    <em>Win rate</em>
                    {wrText(agg.wr)}
                  </span>
                  <span>
                    <em>On-track</em>
                    {Math.round(rep.onTrackPct)}%
                  </span>
                  <span>
                    <em>Reuniones</em>
                    {agg.meetings}
                  </span>
                </div>
                <div className="progress" data-tone={toneOf(agg.attainment)}>
                  <span style={{ width: `${Math.min(100, Math.max(0, agg.attainment))}%` }} />
                </div>
                <span className="score-card-cta">Ver hoja de vida →</span>
              </button>
            ))}
          </div>

          <SectionTitle note="cuota, ganado, win rate, reuniones y score del rango">
            Detalle comparativo
          </SectionTitle>
          <div className="table-wrap">
            <table className="pulse-table">
              <thead>
                <tr>
                  <th>Comercial</th>
                  <th>Antigüedad</th>
                  <th>Cuota</th>
                  <th>Ganado</th>
                  <th>Cumpl.</th>
                  <th>WR rango</th>
                  <th>WR histórico</th>
                  <th>Perdidos</th>
                  <th>Reuniones</th>
                  <th>Ciclo</th>
                  <th>On-track</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(({ rep, agg }) => (
                  <tr key={rep.id}>
                    <th scope="row">
                      <button className="cell-button" type="button" onClick={() => setRepId(rep.id)}>
                        {rep.name}
                      </button>
                    </th>
                    <td>{rep.tenureLabel}</td>
                    <td>{money(agg.quota)}</td>
                    <td>{money(agg.wonAmount)}</td>
                    <td>{Math.round(agg.attainment)}%</td>
                    <td>{wrText(agg.wr)}</td>
                    <td>{wrText(rep.wrHist)}</td>
                    <td>
                      {agg.lostCount} · {money(agg.lostAmount)}
                    </td>
                    <td>{agg.meetings}</td>
                    <td>{rep.cycleDays ? `${rep.cycleDays.toFixed(0)} d` : "s/n"}</td>
                    <td>{Math.round(rep.onTrackPct)}%</td>
                    <td>
                      <span className="status" data-tone={agg.tone}>
                        {agg.score}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <SectionTitle note="pesos del score, iguales para todos">Cómo se calcula el score</SectionTitle>
          <div className="weights-grid">
            {report.weights.map((weight) => (
              <div className="weight-card" key={weight.key}>
                <strong>{Math.round(weight.weight * 100)}%</strong>
                <span>{weight.label}</span>
                <p>{weight.help}</p>
              </div>
            ))}
          </div>
        </>
      ) : selected ? (
        <RepSheet
          rep={selected.rep}
          agg={selected.agg}
          rangeLabel={rangeLabel}
          yearPeriods={yearPeriods}
          selectedPeriods={selectedPeriods}
          year={year}
          quarter={quarter}
          onModal={setModalKey}
          onBack={() => setRepId("team")}
        />
      ) : null}

      {wrScope ? (
        <WinRateCross
          scope={wrScope}
          rangeLabel={rangeLabel}
          selectedPeriods={selectedPeriods}
          yearPeriods={yearPeriods}
          onModal={setModalKey}
        />
      ) : null}

      {rampDevScope ? (
        <TimeToService
          scope={rampDevScope}
          rangeLabel={rangeLabel}
          selectedPeriods={selectedPeriods}
          yearPeriods={yearPeriods}
          onModal={setModalKey}
          title="De propuesta firmada a proyecto en desarrollo"
          note={`etapa 6 → 6.2 · ${rangeLabel}`}
          fromLabel="etapa 6"
          toLabel="etapa 6.2"
          thresholds={[15, 30]}
        />
      ) : null}

      {rampScope ? (
        <TimeToService
          scope={rampScope}
          rangeLabel={rangeLabel}
          selectedPeriods={selectedPeriods}
          yearPeriods={yearPeriods}
          onModal={setModalKey}
          title="De propuesta firmada a inicio de servicio"
          note={`etapa 6 → etapa 8 · ${rangeLabel}`}
          fromLabel="etapa 6"
          toLabel="inicio de servicio"
        />
      ) : null}

      <DealModal payload={payload} onClose={() => setModalKey(null)} initialStages={stageFilter} />
    </main>
  );
}

function RepSheet({
  rep,
  agg,
  rangeLabel,
  yearPeriods,
  selectedPeriods,
  year,
  quarter,
  onModal,
  onBack,
}: {
  rep: RepScorecard;
  agg: Agg;
  rangeLabel: string;
  yearPeriods: string[];
  selectedPeriods: string[];
  year: string;
  quarter: string;
  onModal: (key: string) => void;
  onBack: () => void;
}) {
  const rows = rep.periods.filter((row) => selectedPeriods.includes(row.period));
  const allRows = rep.periods.filter((row) => yearPeriods.includes(row.period));
  const wonTrend = allRows.map((row) => ({
    period: shortPeriod(row.period),
    amount: row.wonAmount,
    deals: row.wonCount,
  }));
  const wrTrend = allRows.map((row) => ({
    period: shortPeriod(row.period),
    rate: (row.wr.won / Math.max(1, row.wr.won + row.wr.lost)) * 100,
  }));
  const meetingTrend = allRows.map((row) => ({
    period: shortPeriod(row.period),
    amount: row.meetings,
    deals: row.meetings,
  }));
  const warningTrend = allRows.map((row) => ({
    period: shortPeriod(row.period),
    amount: row.warningCount,
    deals: row.warningCount,
  }));
  const monthTrend = rep.months
    .filter((month) => {
      const [my, mm] = month.month.split("-");
      if (my !== year) return false;
      if (quarter === "all") return true;
      return String(Math.floor((Number(mm) - 1) / 3) + 1) === quarter;
    })
    .map((month) => ({
      period: month.label,
      amount: month.wonAmount,
      deals: month.wonCount,
    }));
  const gap = Math.max(0, agg.quota - agg.wonAmount);
  const coverage = gap ? rep.weightedQ / gap : 99;

  const coverageTone: Tone = !agg.quota
    ? "neutral"
    : !gap
      ? "ok"
      : coverage >= 3
        ? "ok"
        : coverage >= 1.5
          ? "warn"
          : "bad";

  return (
    <>
      <div className="rep-hero" data-tone={agg.tone}>
        <ScoreDial score={agg.score} tone={agg.tone} size={104} />
        <div className="rep-hero-body">
          <button className="tab" type="button" style={{ minHeight: 30 }} onClick={onBack}>
            ← Volver al resumen
          </button>
          <h2 className="pulse-h2" style={{ margin: "12px 0 6px" }}>
            {rep.name}
          </h2>
          <div className="rep-hero-meta">
            <span className="status" data-tone={agg.tone}>
              {toneLabel[agg.tone]} · score {agg.score}/100
            </span>
            <span className="chip">En Adereso ~{rep.tenureLabel}</span>
            <span className="chip">{rangeLabel}</span>
            <span className="chip">
              Ciclo {rep.cycleDays ? `${rep.cycleDays.toFixed(0)} d` : "s/n"} vs{" "}
              {rep.teamCycleDays ? `${rep.teamCycleDays.toFixed(0)} d` : "s/n"} equipo
            </span>
          </div>
          <p className="rep-hero-note">
            Antigüedad estimada desde su primer deal creado en HubSpot
            {rep.tenureStart
              ? ` (${new Date(rep.tenureStart).toLocaleDateString("es-CL", { timeZone: "UTC" })})`
              : ""}
            ; HubSpot no guarda fecha de incorporación.
          </p>
        </div>
      </div>

      <SectionTitle note={rangeLabel}>Cumplimiento de cuota y pronóstico</SectionTitle>
      <section className="grid-4">
        <Metric
          label="Cuota del rango"
          value={money(agg.quota)}
          note={agg.quota ? "goal targets MRR" : "sin cuota registrada"}
          tooltip="Cuota MRR asignada al comercial en los trimestres del rango seleccionado."
        />
        <Metric
          label="Ganado / cuota"
          value={money(agg.wonAmount)}
          note={`${agg.wonCount} deals · ${Math.round(agg.attainment)}%`}
          tone={toneOf(agg.attainment)}
          progress={agg.attainment}
          tooltip="MRR ganado en el rango frente a su cuota. La barra muestra el avance hacia la meta."
        />
        <Metric
          label="Pronóstico Q actual"
          value={money(rep.weightedQ)}
          note="pipeline del Q ponderado"
          onClick={() => onModal(rep.modals.weighted)}
          tooltip="Deals abiertos con cierre en el trimestre en curso, ponderados por la probabilidad de su etapa."
        />
        <Metric
          label="Cobertura del gap"
          value={gap ? `${coverage.toFixed(1)}x` : "cumplida"}
          note={gap ? `faltan ${money(gap)} · mínimo sano 3x` : "cuota alcanzada"}
          tone={coverageTone}
          onClick={() => onModal(rep.modals.weighted)}
          tooltip="Pipeline ponderado del Q dividido por lo que falta para la cuota. Bajo 1.5x el cumplimiento está en riesgo."
        />
      </section>

      <SectionTitle note={`trimestres de ${year}`}>Evolución de cierres y win rate</SectionTitle>
      <div className="rep-charts">
        <div className="rep-chart">
          <span className="eyebrow">Ganado por trimestre</span>
          <MiniBars data={wonTrend} onSelect={() => undefined} />
        </div>
        <div className="rep-chart">
          <span className="eyebrow">Win rate por trimestre</span>
          <MiniLine data={wrTrend} />
        </div>
        <div className="rep-chart">
          <span className="eyebrow">Ganado por mes · {rangeLabel}</span>
          <MiniBars data={monthTrend} onSelect={() => undefined} />
        </div>
        <div className="rep-chart">
          <span className="eyebrow">Reuniones por trimestre</span>
          <MiniBars data={meetingTrend} onSelect={() => undefined} />
        </div>
        <div className="rep-chart">
          <span className="eyebrow">Deals marcados en riesgo por trimestre</span>
          <MiniBars data={warningTrend} onSelect={() => undefined} />
        </div>
      </div>

      <SectionTitle note="foto actual del pipeline abierto">Gestión y cobertura on-track</SectionTitle>
      <section className="grid-4">
        <Metric
          label="Cobertura on-track"
          value={`${Math.round(rep.onTrackPct)}%`}
          note={`${rep.onTrackCount} de ${rep.openCount} deals activos · ${money(rep.onTrackAmount)}`}
          tone={toneOf(rep.onTrackPct)}
          onClick={() => onModal(rep.modals.onTrack)}
          tooltip="Porcentaje de sus deals abiertos con la propiedad on-track marcada en Sí en HubSpot."
        />
        <Metric
          label="Fuera de on-track"
          value={String(rep.offTrackCount)}
          note={`de ${rep.openCount} deals activos sin la marca`}
          tone={rep.offTrackCount ? "warn" : "ok"}
          onClick={() => onModal(rep.modals.offTrack)}
          tooltip="Deals abiertos que no están marcados on-track: requieren revisión de gestión."
        />
        <Metric
          label="Seguimiento con pinzas"
          value={String(rep.pinzasCount)}
          note={money(rep.pinzasAmount)}
          tone={rep.pinzasCount ? "warn" : "ok"}
          onClick={() => onModal(rep.modals.pinzas)}
          tooltip="Deals que el propio comercial marcó con seguimiento con pinzas en HubSpot."
        />
        <Metric
          label="Higiene de fechas"
          value={String(rep.overdueCount)}
          note={`${money(rep.overdueAmount)} vencido · ${rep.noNextActivity} sin próxima actividad`}
          tone={rep.overdueCount ? "bad" : "ok"}
          onClick={() => onModal(rep.modals.overdue)}
          tooltip="Deals abiertos con fecha de cierre en el pasado. Al lado, cuántos no tienen próxima actividad agendada."
        />
      </section>

      <SectionTitle note="tiempo acumulado por etapa vs el equipo">
        Velocidad por etapa del pipeline
      </SectionTitle>
      <div className="table-wrap">
        <table className="pulse-table">
          <thead>
            <tr>
              <th>Etapa</th>
              <th>Días promedio</th>
              <th>Equipo</th>
              <th>Diferencia</th>
              <th>Deals con dato</th>
            </tr>
          </thead>
          <tbody>
            {rep.stageTimes.map((stage) => {
              const diff = stage.avgDays - stage.teamAvgDays;
              const tone: Tone = !stage.count ? "neutral" : diff <= 0 ? "ok" : diff > stage.teamAvgDays * 0.5 ? "bad" : "warn";
              return (
                <tr key={stage.key}>
                  <th scope="row">{stage.key}</th>
                  <td>{stage.count ? `${stage.avgDays.toFixed(1)} d` : "s/n"}</td>
                  <td>{stage.teamAvgDays ? `${stage.teamAvgDays.toFixed(1)} d` : "s/n"}</td>
                  <td>
                    <span className="status" data-tone={tone}>
                      {stage.count ? `${diff >= 0 ? "+" : ""}${diff.toFixed(1)} d` : "sin dato"}
                    </span>
                  </td>
                  <td>{stage.count}</td>
                </tr>
              );
            })}
            <tr>
              <th scope="row">Etapa actual</th>
              <td colSpan={4}>
                {rep.currentStageDays
                  ? `${rep.currentStageDays.toFixed(1)} días promedio en la etapa actual de sus deals abiertos`
                  : "sin deals abiertos con historial de etapa"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <SectionTitle note={rangeLabel}>Cierres, reuniones y score por trimestre</SectionTitle>
      <div className="table-wrap">
        <table className="pulse-table">
          <thead>
            <tr>
              <th>Trimestre</th>
              <th>Cuota</th>
              <th>Ganado</th>
              <th>Cumpl.</th>
              <th>Deals ganados</th>
              <th>Perdidos</th>
              <th>WR</th>
              <th>Reuniones</th>
              <th>En riesgo</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.period}>
                <th scope="row">{shortPeriod(row.period)}</th>
                <td>{money(row.quota)}</td>
                <td>
                  <button className="cell-button" type="button" onClick={() => onModal(row.wonModal)}>
                    {money(row.wonAmount)}
                  </button>
                </td>
                <td>{row.quota ? `${Math.round(row.attainment)}%` : "s/n"}</td>
                <td>{row.wonCount}</td>
                <td>
                  <button className="cell-button" type="button" onClick={() => onModal(row.lostModal)}>
                    {row.lostCount} · {money(row.lostAmount)}
                  </button>
                </td>
                <td>{wrText(row.wr)}</td>
                <td>{row.meetings}</td>
                <td>{row.warningCount}</td>
                <td>
                  <span className="status" data-tone={row.tone}>
                    {row.score}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle note={`score ${agg.score}/100 en ${rangeLabel}`}>Desglose del score</SectionTitle>
      <ScoreBreakdown components={agg.components} />

      <SectionTitle note="motivos de deals perdidos (histórico)">Aprendizaje de pérdidas</SectionTitle>
      {rep.lostReasons.length ? (
        <div className="table-wrap">
          <table className="pulse-table">
            <thead>
              <tr>
                <th>Motivo</th>
                <th>Deals</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {rep.lostReasons.map((reason) => (
                <tr key={reason.reason}>
                  <th scope="row">{reason.reason}</th>
                  <td>{reason.count}</td>
                  <td>{money(reason.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">Sin deals perdidos registrados en el histórico cargado.</div>
      )}
    </>
  );
}

function FloatingFilters({
  year,
  quarter,
  repId,
  years,
  quarters,
  reps,
  onYear,
  onQuarter,
  onRep,
}: {
  year: string;
  quarter: string;
  repId: string;
  years: string[];
  quarters: string[];
  reps: { id: string; name: string }[];
  onYear: (value: string) => void;
  onQuarter: (value: string) => void;
  onRep: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 260);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="glass-filters" data-visible={visible} aria-hidden={!visible}>
      <select
        className="glass-select"
        value={year}
        onChange={(event) => onYear(event.target.value)}
        aria-label="Año"
      >
        {years.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <select
        className="glass-select"
        value={quarter}
        onChange={(event) => onQuarter(event.target.value)}
        aria-label="Periodo"
      >
        <option value="all">Año completo</option>
        {quarters.map((option) => (
          <option key={option} value={option}>
            Q{option}
          </option>
        ))}
      </select>
      <select
        className="glass-select"
        value={repId}
        onChange={(event) => onRep(event.target.value)}
        aria-label="Comercial"
      >
        <option value="team">General</option>
        {reps.map((rep) => (
          <option key={rep.id} value={rep.id}>
            {rep.name}
          </option>
        ))}
      </select>
    </div>
  );
}
