import { useMemo, useState } from "react";
import { DealModal } from "./DealModal";
import { Metric } from "./PulseDashboard";
import { CompactFilterBar } from "./FilterBar";
import {
  HBars,
  Legend,
  SectionTitle,
  StackedTrend,
  median,
  money,
  pct,
  shortPeriod,
  sum,
  useAgo,
  useInsightFilters,
  weighted,
} from "./insights-shared";
import type { Drilldown } from "@/lib/pulse-types";
import type { InsightDeal, InsightsReport } from "@/lib/insights-types";
import { roleOfOwner } from "@/lib/owner-roles";

const MOTIONS = ["Upsell", "Cross sell", "Venta nueva"] as const;

type Drill = { title: string; subtitle: string; deals: InsightDeal[] };

export function GrowthDashboard({
  report,
  onRefresh,
  isRefreshing,
  tabs,
  role = "all",
  onRole,
}: {
  report: InsightsReport;
  onRefresh: () => void;
  isRefreshing: boolean;
  tabs: React.ReactNode;
  role?: "all" | "AE" | "KAM";
  onRole?: (value: "all" | "AE" | "KAM") => void;
}) {
  const ago = useAgo(report.generatedAt);
  const filters = useInsightFilters(report, undefined, role, onRole);
  const roleOwnerOptions = useMemo(
    () =>
      report.owners
        .filter((owner) => role === "all" || roleOfOwner(owner.id) === role)
        .map((owner) => [owner.id, owner.name] as [string, string]),
    [report.owners, role],
  );
  const [drill, setDrill] = useState<Drill | null>(null);
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const open = (title: string, subtitle: string, deals: InsightDeal[]) =>
    setDrill({ title, subtitle, deals });

  const scope = filters.deals;
  const won = useMemo(() => scope.filter((deal) => deal.status === "won"), [scope]);
  const active = filters.openDeals;

  const bucket = (list: InsightDeal[]) => ({
    upsell: list.filter((deal) => deal.motion === "Upsell"),
    cross: list.filter((deal) => deal.motion === "Cross sell"),
    nueva: list.filter((deal) => deal.motion === "Venta nueva"),
    renov: list.filter((deal) => deal.motion === "Renovación"),
  });
  const wonB = bucket(won);
  const activeB = bucket(active);
  const wonExp = [...wonB.upsell, ...wonB.cross];
  const activeExp = [...activeB.upsell, ...activeB.cross];

  const wonExpMrr = sum(wonExp, (d) => d.mrr);
  const wonNewMrr = sum(wonB.nueva, (d) => d.mrr);
  const wonTotal = wonExpMrr + wonNewMrr;

  const trend = useMemo(() => {
    const periods = report.periods.filter((period) =>
      filters.quarter === "all" ? period.startsWith(`${filters.year}-`) : true,
    );
    const list = filters.quarter === "all" ? periods : report.periods;
    return list.map((period) => {
      const rows = report.deals.filter(
        (deal) =>
          deal.status === "won" &&
          deal.period === period &&
          (filters.ownerId === "team" || deal.ownerId === filters.ownerId),
      );
      const b = bucket(rows);
      return {
        period,
        a: sum([...b.upsell, ...b.cross], (d) => d.mrr),
        b: sum(b.nueva, (d) => d.mrr),
      };
    });
  }, [report.deals, report.periods, filters.year, filters.quarter, filters.ownerId]);

  const rows = (list: ReturnType<typeof bucket>, exp: InsightDeal[], mode: "won" | "open") => {
    const total = mode === "won" ? wonTotal : sum(active, (d) => d.amountValue);
    const build = (label: string, deals: InsightDeal[], strong = false) => {
      const amount = mode === "won" ? sum(deals, (d) => d.mrr) : sum(deals, (d) => d.amountValue);
      return {
        label,
        strong,
        count: deals.length,
        amount,
        ticket: deals.length ? Math.round(amount / deals.length) : 0,
        share: total ? (amount / total) * 100 : 0,
        weighted: weighted(deals),
        deals,
      };
    };
    return [
      build("Upsell", list.upsell),
      build("Cross sell", list.cross),
      build("Expansión (total)", exp, true),
      build("Venta nueva", list.nueva, true),
      build("Renovación", list.renov),
    ];
  };

  const wonRows = rows(wonB, wonExp, "won");
  const activeRows = rows(activeB, activeExp, "open");

  const productRows = useMemo(() => {
    const map = new Map<
      string,
      { won: number; wonExp: number; wonNew: number; open: number; wonDeals: InsightDeal[]; openDeals: InsightDeal[] }
    >();
    const touch = (key: string) =>
      map.get(key) ??
      map.set(key, { won: 0, wonExp: 0, wonNew: 0, open: 0, wonDeals: [], openDeals: [] }).get(key)!;
    for (const deal of won) {
      for (const product of deal.products.length ? deal.products : ["Sin producto"]) {
        const row = touch(product);
        row.won += deal.mrr;
        if (deal.family === "Expansión") row.wonExp += deal.mrr;
        if (deal.family === "Venta nueva") row.wonNew += deal.mrr;
        row.wonDeals.push(deal);
      }
    }
    for (const deal of active) {
      for (const product of deal.products.length ? deal.products : ["Sin producto"]) {
        const row = touch(product);
        row.open += deal.amountValue;
        row.openDeals.push(deal);
      }
    }
    return [...map.entries()]
      .map(([product, value]) => ({ product, ...value }))
      .sort((a, b) => b.won + b.open - (a.won + a.open));
  }, [won, active]);

  const sourceRows = useMemo(() => {
    const map = new Map<
      string,
      {
        wonExp: number;
        wonNew: number;
        wonCount: number;
        openExp: number;
        openNew: number;
        openCount: number;
        wonDeals: InsightDeal[];
        openDeals: InsightDeal[];
      }
    >();
    const touch = (key: string) =>
      map.get(key) ??
      map
        .set(key, {
          wonExp: 0,
          wonNew: 0,
          wonCount: 0,
          openExp: 0,
          openNew: 0,
          openCount: 0,
          wonDeals: [],
          openDeals: [],
        })
        .get(key)!;
    for (const deal of won) {
      const row = touch(deal.sourceLabel);
      row.wonCount += 1;
      row.wonDeals.push(deal);
      if (deal.family === "Expansión") row.wonExp += deal.mrr;
      else row.wonNew += deal.mrr;
    }
    for (const deal of active) {
      const row = touch(deal.sourceLabel);
      row.openCount += 1;
      row.openDeals.push(deal);
      if (deal.family === "Expansión") row.openExp += deal.amountValue;
      else row.openNew += deal.amountValue;
    }
    return [...map.entries()]
      .map(([source, value]) => ({ source, ...value }))
      .sort((a, b) => b.wonExp + b.wonNew - (a.wonExp + a.wonNew));
  }, [won, active]);

  const sizeRows = useMemo(() => {
    const order = ["Enterprise", "Mid Market", "SMB", "Sin dato"];
    return order.map((bucketName) => {
      const wonList = won.filter((deal) => deal.sizeBucket === bucketName);
      const openList = active.filter((deal) => deal.sizeBucket === bucketName);
      const mrr = sum(wonList, (d) => d.mrr);
      return {
        bucket: bucketName,
        companies: wonList.length,
        mrr,
        avg: wonList.length ? Math.round(mrr / wonList.length) : 0,
        kickoff: median(wonList.map((d) => d.daysToKickoff).filter((v): v is number => v !== null)),
        service: median(wonList.map((d) => d.daysToService).filter((v): v is number => v !== null)),
        expShare: wonList.length
          ? (wonList.filter((d) => d.family === "Expansión").length / wonList.length) * 100
          : 0,
        openAmount: sum(openList, (d) => d.amountValue),
        openCount: openList.length,
        wonList,
        openList,
      };
    });
  }, [won, active]);

  const midEnterprise = sizeRows.filter((row) => row.bucket === "Mid Market" || row.bucket === "Enterprise");
  const focusMrr = midEnterprise.reduce((acc, row) => acc + row.mrr, 0);

  const payload: Drilldown | null = drill
    ? { title: drill.title, subtitle: drill.subtitle, deals: drill.deals }
    : null;

  return (
    <main className="pulse-main">
      {tabs}
      <header className="team-header">
        <div>
          <h1 className="pulse-h1">Expansión vs Venta Nueva</h1>
          <div className="eyebrow" style={{ marginTop: 16 }}>
            Composición del ingreso, pipeline activo, productos, fuentes y adquisición por tamaño de empresa
          </div>
        </div>
      </header>

      <CompactFilterBar
        years={report.years}
        quarters={filters.quartersAvailable}
        owners={roleOwnerOptions}
        year={filters.year}
        quarter={filters.quarter}
        ownerId={filters.ownerId}
        stages={stageFilter}
        onYear={filters.setYear}
        onQuarter={filters.setQuarter}
        onOwner={filters.setOwnerId}
        onStages={setStageFilter}
        role={role}
        onRole={(item) => {
          onRole?.(item);
          filters.setOwnerId("team");
        }}
        ago={ago}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
        label="Filtros de expansión vs venta nueva"
      />

      <SectionTitle note={`${won.length} deals ganados en ${filters.rangeLabel}`}>
        Ingreso ganado: expansión vs venta nueva
      </SectionTitle>
      <section className="grid-4">
        <Metric
          label="MRR ganado total"
          value={money(wonTotal)}
          note={`${wonExp.length + wonB.nueva.length} deals`}
          onClick={() => open("Deals ganados", filters.rangeLabel, [...wonExp, ...wonB.nueva])}
          tooltip="Suma de MRR de deals ganados en el rango (dealtype expansión + venta nueva)."
        />
        <Metric
          label="Expansión (upsell + cross)"
          value={money(wonExpMrr)}
          note={`${wonExp.length} deals · ${pct(wonTotal ? (wonExpMrr / wonTotal) * 100 : 0)} del ingreso`}
          tone="ok"
          onClick={() => open("Expansión ganada", "Upsell + cross sell", wonExp)}
          tooltip="Deals ganados con dealtype Upsell o Cross sell, agrupados como expansión."
        />
        <Metric
          label="Venta nueva"
          value={money(wonNewMrr)}
          note={`${wonB.nueva.length} deals · ${pct(wonTotal ? (wonNewMrr / wonTotal) * 100 : 0)} del ingreso`}
          tone="warn"
          onClick={() => open("Venta nueva ganada", "dealtype newbusiness", wonB.nueva)}
          tooltip="Deals ganados con dealtype newbusiness (oportunidad nueva)."
        />
        <Metric
          label="Ticket promedio"
          value={money(wonExp.length + wonB.nueva.length ? Math.round(wonTotal / (wonExp.length + wonB.nueva.length)) : 0)}
          note={`expansión ${money(wonExp.length ? Math.round(wonExpMrr / wonExp.length) : 0)} · nueva ${money(wonB.nueva.length ? Math.round(wonNewMrr / wonB.nueva.length) : 0)}`}
          tooltip="MRR ganado dividido por la cantidad de deals ganados en el rango."
        />
      </section>

      <div className="split-2" style={{ marginTop: 20 }}>
        <div className="rep-chart">
          <span className="metric-label">Detalle por motion (ganados)</span>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="pulse-table">
              <thead>
                <tr>
                  <th>Motion</th>
                  <th>Deals</th>
                  <th>MRR</th>
                  <th>Ticket</th>
                  <th>Mix</th>
                </tr>
              </thead>
              <tbody>
                {wonRows.map((row) => (
                  <tr key={row.label} data-strong={row.strong ? "" : undefined}>
                    <td>{row.strong ? <strong>{row.label}</strong> : row.label}</td>
                    <td>
                      <button
                        className="cell-button"
                        type="button"
                        onClick={() => open(`${row.label} · ganados`, filters.rangeLabel, row.deals)}
                      >
                        {row.count}
                      </button>
                    </td>
                    <td>{money(row.amount)}</td>
                    <td>{money(row.ticket)}</td>
                    <td>{pct(row.share)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rep-chart">
          <span className="metric-label">Evolución trimestral del mix</span>
          <Legend items={[{ label: "Expansión", kind: "exp" }, { label: "Venta nueva", kind: "new" }]} />
          <StackedTrend
            data={trend}
            onSelect={(period) =>
              open(
                `Ganados ${shortPeriod(period)}`,
                "expansión + venta nueva",
                report.deals.filter(
                  (deal) =>
                    deal.status === "won" &&
                    deal.period === period &&
                    (filters.ownerId === "team" || deal.ownerId === filters.ownerId),
                ),
              )
            }
          />
        </div>
      </div>

      <SectionTitle note={`${active.length} deals abiertos hoy · ${filters.ownerName}`}>
        Pipeline activo: expansión vs venta nueva
      </SectionTitle>
      <section className="grid-4">
        <Metric
          label="Pipeline abierto"
          value={money(sum(active, (d) => d.amountValue))}
          note={`${active.length} deals en E1-E5.1`}
          onClick={() => open("Pipeline abierto", filters.ownerName, active)}
          tooltip="Foto actual de los deals abiertos en etapas gestionables."
        />
        <Metric
          label="Expansión abierta"
          value={money(sum(activeExp, (d) => d.amountValue))}
          note={`${activeExp.length} deals · ponderado ${money(weighted(activeExp))}`}
          tone="ok"
          onClick={() => open("Expansión abierta", "Upsell + cross sell", activeExp)}
          tooltip="Deals abiertos con dealtype Upsell o Cross sell."
        />
        <Metric
          label="Venta nueva abierta"
          value={money(sum(activeB.nueva, (d) => d.amountValue))}
          note={`${activeB.nueva.length} deals · ponderado ${money(weighted(activeB.nueva))}`}
          tone="warn"
          onClick={() => open("Venta nueva abierta", "dealtype newbusiness", activeB.nueva)}
          tooltip="Deals abiertos con dealtype newbusiness."
        />
        <Metric
          label="Balance del pipeline"
          value={pct(
            sum(active, (d) => d.amountValue)
              ? (sum(activeExp, (d) => d.amountValue) / sum(active, (d) => d.amountValue)) * 100
              : 0,
          )}
          note="participación de expansión en el pipeline abierto"
          tooltip="Cuánto del pipeline abierto viene de expansión frente a venta nueva."
        />
      </section>

      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="pulse-table">
          <thead>
            <tr>
              <th>Motion</th>
              <th>Deals abiertos</th>
              <th>Monto</th>
              <th>Ponderado</th>
              <th>Ticket</th>
              <th>Mix</th>
            </tr>
          </thead>
          <tbody>
            {activeRows.map((row) => (
              <tr key={row.label}>
                <td>{row.strong ? <strong>{row.label}</strong> : row.label}</td>
                <td>
                  <button
                    className="cell-button"
                    type="button"
                    onClick={() => open(`${row.label} · abiertos`, filters.ownerName, row.deals)}
                  >
                    {row.count}
                  </button>
                </td>
                <td>{money(row.amount)}</td>
                <td>{money(row.weighted)}</td>
                <td>{money(row.ticket)}</td>
                <td>{pct(row.share)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle note="composición ganado vs pipeline">Productos contratados</SectionTitle>
      <div className="split-2">
        <div className="rep-chart">
          <span className="metric-label">MRR ganado por producto</span>
          <HBars
            data={productRows
              .filter((row) => row.won > 0)
              .slice(0, 10)
              .map((row) => ({
                key: row.product,
                label: row.product,
                value: row.won,
                note: `${row.wonDeals.length} deals`,
                tone: "ok",
              }))}
            onSelect={(key) =>
              open(
                `Ganados con ${key}`,
                filters.rangeLabel,
                productRows.find((row) => row.product === key)?.wonDeals ?? [],
              )
            }
          />
        </div>
        <div className="rep-chart">
          <span className="metric-label">Pipeline abierto por producto</span>
          <HBars
            data={productRows
              .filter((row) => row.open > 0)
              .slice(0, 10)
              .map((row) => ({
                key: row.product,
                label: row.product,
                value: row.open,
                note: `${row.openDeals.length} deals`,
                tone: "warn",
              }))}
            onSelect={(key) =>
              open(
                `Pipeline con ${key}`,
                filters.ownerName,
                productRows.find((row) => row.product === key)?.openDeals ?? [],
              )
            }
          />
        </div>
      </div>
      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="pulse-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>MRR ganado</th>
              <th>Ganado expansión</th>
              <th>Ganado venta nueva</th>
              <th>Pipeline abierto</th>
            </tr>
          </thead>
          <tbody>
            {productRows.slice(0, 14).map((row) => (
              <tr key={row.product}>
                <td>{row.product}</td>
                <td>{money(row.won)}</td>
                <td>{money(row.wonExp)}</td>
                <td>{money(row.wonNew)}</td>
                <td>{money(row.open)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle note="activo y ganado por familia">Fuente de creación</SectionTitle>
      <div className="table-wrap">
        <table className="pulse-table">
          <thead>
            <tr>
              <th>Fuente</th>
              <th>Ganado expansión</th>
              <th>Ganado venta nueva</th>
              <th>Deals ganados</th>
              <th>Activo expansión</th>
              <th>Activo venta nueva</th>
              <th>Deals activos</th>
            </tr>
          </thead>
          <tbody>
            {sourceRows.map((row) => (
              <tr key={row.source}>
                <td>{row.source}</td>
                <td>{money(row.wonExp)}</td>
                <td>{money(row.wonNew)}</td>
                <td>
                  <button
                    className="cell-button"
                    type="button"
                    onClick={() => open(`Ganados · ${row.source}`, filters.rangeLabel, row.wonDeals)}
                  >
                    {row.wonCount}
                  </button>
                </td>
                <td>{money(row.openExp)}</td>
                <td>{money(row.openNew)}</td>
                <td>
                  <button
                    className="cell-button"
                    type="button"
                    onClick={() => open(`Activos · ${row.source}`, filters.ownerName, row.openDeals)}
                  >
                    {row.openCount}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle note="foco mid market y enterprise">Adquisición por tamaño de empresa</SectionTitle>
      <section className="grid-4">
        <Metric
          label="MRR mid market + enterprise"
          value={money(focusMrr)}
          note={`${pct(wonTotal ? (focusMrr / wonTotal) * 100 : 0)} del MRR ganado`}
          tone={wonTotal && focusMrr / wonTotal >= 0.6 ? "ok" : "warn"}
          tooltip="MRR ganado en empresas de 51+ empleados (mid market y enterprise), el foco estratégico."
        />
        <Metric
          label="Empresas ganadas"
          value={String(won.length)}
          note={midEnterprise.map((row) => `${row.bucket}: ${row.companies}`).join(" · ")}
          tooltip="Cantidad de deals ganados por tramo de tamaño de empresa (propiedad tamaño de empresa deal)."
        />
        <Metric
          label="Mediana ganado → kickoff"
          value={`${median(won.map((d) => d.daysToKickoff).filter((v): v is number => v !== null))} días`}
          note="fecha kickoff del deal"
          tooltip="Días entre la fecha de cierre ganado y la fecha de kickoff registrada en HubSpot."
        />
        <Metric
          label="Mediana ganado → inicio servicio"
          value={`${median(won.map((d) => d.daysToService).filter((v): v is number => v !== null))} días`}
          note="entrada a etapa 8 servicio iniciado"
          tooltip="Días entre el cierre ganado y la entrada a la etapa 8 (servicio iniciado)."
        />
      </section>
      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="pulse-table">
          <thead>
            <tr>
              <th>Tamaño</th>
              <th>Empresas ganadas</th>
              <th>MRR ganado</th>
              <th>MRR promedio</th>
              <th>% expansión</th>
              <th>Mediana a kickoff</th>
              <th>Mediana a servicio</th>
              <th>Pipeline abierto</th>
            </tr>
          </thead>
          <tbody>
            {sizeRows.map((row) => (
              <tr key={row.bucket}>
                <td>
                  <strong>{row.bucket}</strong>
                </td>
                <td>
                  <button
                    className="cell-button"
                    type="button"
                    onClick={() => open(`Ganados · ${row.bucket}`, filters.rangeLabel, row.wonList)}
                  >
                    {row.companies}
                  </button>
                </td>
                <td>{money(row.mrr)}</td>
                <td>{money(row.avg)}</td>
                <td>{pct(row.expShare)}</td>
                <td>{row.kickoff ? `${row.kickoff} d` : "s/d"}</td>
                <td>{row.service ? `${row.service} d` : "s/d"}</td>
                <td>
                  <button
                    className="cell-button"
                    type="button"
                    onClick={() => open(`Abiertos · ${row.bucket}`, filters.ownerName, row.openList)}
                  >
                    {money(row.openAmount)}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rep-chart" style={{ marginTop: 20 }}>
        <span className="metric-label">MRR ganado por tamaño y motion</span>
        <HBars
          data={MOTIONS.flatMap((motion) =>
            ["Enterprise", "Mid Market", "SMB"].map((size) => {
              const list = won.filter((deal) => deal.motion === motion && deal.sizeBucket === size);
              return {
                key: `${motion}·${size}`,
                label: `${motion} · ${size}`,
                value: sum(list, (d) => d.mrr),
                note: `${list.length} deals`,
                tone: motion === "Venta nueva" ? "warn" : "ok",
              };
            }),
          ).filter((row) => row.value > 0)}
          onSelect={(key) => {
            const [motion, size] = key.split("·");
            open(
              `${motion} · ${size}`,
              filters.rangeLabel,
              won.filter((deal) => deal.motion === motion && deal.sizeBucket === size),
            );
          }}
        />
      </div>

      <DealModal payload={payload} onClose={() => setDrill(null)} initialStages={stageFilter} />
    </main>
  );
}
