import { createFileRoute, useLocation } from "@tanstack/react-router";
import {
  keepPreviousData,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ReportSidebar, type ReportView } from "@/components/pulse/ReportSidebar";
import { PulseDashboard } from "@/components/pulse/PulseDashboard";
import { PartnerDashboard } from "@/components/pulse/PartnerDashboard";
import { TeamDashboard } from "@/components/pulse/TeamDashboard";
import { GrowthDashboard } from "@/components/pulse/GrowthDashboard";
import { SimulatorDashboard } from "@/components/pulse/SimulatorDashboard";
import { LossDashboard } from "@/components/pulse/LossDashboard";
import { QualityDashboard } from "@/components/pulse/QualityDashboard";
import { LoadingProgress } from "@/components/pulse/LoadingProgress";
import { AuthGate } from "@/components/AuthGate";
import { HubPortal } from "@/components/HubPortal";
import { RefreshProvider, useRegisterRefresh } from "@/contexts/RefreshContext";
import {
  getCoachingReport,
  getInsightsReport,
  getPartnerReport,
  getPulseReport,
  getReportMeta,
  getTeamReport,
} from "@/lib/pulse.functions";
import type { PulseReport } from "@/lib/pulse-types";
import { unpackReport } from '@/lib/report-wire';
import { supabase } from "@/integrations/supabase/client";

/**
 * Cada reporte tiene dos consultas: la copia guardada (respuesta inmediata) y
 * la versión en vivo que se reconstruye desde HubSpot en segundo plano.
 */
function reportQueries<T>(key: string, fn: (args: { data: { fresh: boolean } }) => Promise<T>) {
  return {
    snapshot: queryOptions({
      queryKey: [key, "snapshot"],
      queryFn: () => fn({ data: { fresh: false } }),
      staleTime: Infinity,
      gcTime: 30 * 60_000,
      retry: 1,
    }),
    live: queryOptions({
      queryKey: [key, "live"],
      queryFn: () => fn({ data: { fresh: true } }),
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
      placeholderData: keepPreviousData,
      staleTime: 45_000,
    }),
  };
}

/**
 * El reporte comercial se pide por rol: todo el equipo, solo AEs o solo KAMs.
 * Cada rol guarda su propia copia para que el cambio de pestaña sea instantáneo.
 */
const pulseQFor = (role: "all" | "AE" | "KAM") =>
  reportQueries<PulseReport>(`pulse-report-${role.toLowerCase()}`, async (args) =>
    unpackReport<PulseReport>(JSON.parse(await getPulseReport({ data: { fresh: args.data.fresh, role: role === "all" ? undefined : role } }))),
  );
const partnerQ = reportQueries("partner-report", getPartnerReport);
const teamQ = reportQueries("team-report", getTeamReport);
const insightsQ = reportQueries("insights-report", getInsightsReport);
const coachingQ = reportQueries("coaching-report", getCoachingReport);

const metaQuery = queryOptions({
  queryKey: ["report-meta"],
  queryFn: () => getReportMeta(),
  staleTime: 5 * 60_000,
});

type Report = { generatedAt: string };
let lastAuthRecovery = 0;

/** Combina copia guardada + versión en vivo en un único estado de lectura. */
function useReport<T extends Report>(
  defs: ReturnType<typeof reportQueries<T>>,
  enabled: boolean,
) {
  const snapshot = useQuery({ ...defs.snapshot, enabled });
  // Do not build twice on a snapshot miss. Finish the saved-copy request first.
  const live = useQuery({
    ...defs.live,
    enabled: enabled && snapshot.isSuccess,
    ...(snapshot.data ? {
      initialData: snapshot.data,
      initialDataUpdatedAt: Date.parse(snapshot.data.generatedAt),
    } : {}),
  });
  const data = live.data ?? snapshot.data;
  // Estable entre renders: useRegisterRefresh la usa como dependencia de efecto
  // y una función nueva en cada render gatilla un bucle de actualizaciones.
  const liveRefetch = live.refetch;
  const snapshotRefetch = snapshot.refetch;
  const refetch = useCallback(() => {
    if (snapshot.isSuccess) void liveRefetch();
    else void snapshotRefetch();
  }, [liveRefetch, snapshotRefetch, snapshot.isSuccess]);
  const error = live.error ?? snapshot.error;
  // A dead session token (expired/revoked) must not leave the user stuck: renew
  // it once and retry; if renewal fails, sign out so the login screen appears.
  useEffect(() => {
    if (!(error instanceof Error) || !/invalid token|jwt|no authorization/i.test(error.message)) return;
    if (Date.now() - lastAuthRecovery < 60_000) { void supabase.auth.signOut(); return; }
    lastAuthRecovery = Date.now();
    let cancelled = false;
    void supabase.auth.refreshSession().then(({ error: refreshError }) => {
      if (cancelled) return;
      if (refreshError) void supabase.auth.signOut();
      else refetch();
    });
    return () => { cancelled = true; };
  }, [error, refetch]);
  return {
    data,
    error,
    isRefreshing: live.isFetching || snapshot.isFetching,
    showingSnapshot: !live.data && Boolean(snapshot.data),
    refetch,
  };
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hub comercial · Adereso" },
      {
        name: "description",
        content:
          "Reporte ejecutivo en tiempo real: pipeline comercial y negocios de partners, forecast ponderado, cuotas, win rate y alertas de deals.",
      },
      { property: "og:title", content: "Sales Dashboard" },
      {
        property: "og:description",
        content:
          "Pipeline comercial y de partners, forecast ponderado, cuotas y win rate actualizados en vivo desde HubSpot.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IndexRoute,
});

function IndexRoute() {
  const search = useLocation({ select: location => location.searchStr });
  const params = new URLSearchParams(search);
  const dashboard = params.get("dashboard") === "1";
  const embedded = params.get("embedded") === "hub";
  return (
    <RefreshProvider>
      <AuthGate>
        {dashboard ? <Index embedded={embedded} /> : <HubPortal />}
      </AuthGate>
    </RefreshProvider>
  );
}

type View = ReportView;


function ago(iso: string | undefined) {
  if (!iso) return undefined;
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "hace menos de 1 min";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `hace ${hours} h`;
}

function Index({ embedded = false }: { embedded?: boolean }) {
  const [view, setView] = useState<View>("comercial");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [simulateOwner, setSimulateOwner] = useState<string | undefined>(undefined);
  /** Rol comercial para todo el tablero: todos (predeterminado), AE o KAM. */
  const [roleFilter, setRoleFilter] = useState<"all" | "AE" | "KAM">("all");

  const insightsEnabled = view === "crecimiento" || view === "simulador" || view === "perdidos";
  const pulseDefs = useMemo(() => pulseQFor(roleFilter), [roleFilter]);
  const pulse = useReport(pulseDefs, view === 'comercial' || view === 'proyectos' || view === 'embudo');
  const partner = useReport(partnerQ, view === "partners");
  const team = useReport(teamQ, view === "equipo");
  const insights = useReport(insightsQ, insightsEnabled);
  const coaching = useReport(coachingQ, view === "calidad");
  const meta = useQuery(metaQuery);

  useEffect(() => {
    document.body.dataset["reportNavigation"] = embedded ? "embedded" : sidebarCollapsed ? "collapsed" : "expanded";
    return () => { delete document.body.dataset["reportNavigation"]; };
  }, [embedded, sidebarCollapsed]);

  // Mantiene una sola cápsula de vidrio alineada con la opción activa de cada
  // control segmentado, incluso cuando cambian filtros o medidas del viewport.
  useEffect(() => {
    const selector = ".view-tabs, .tabs, .wr-dim-tabs, .modal-month-filters";
    const syncGroup = (group: Element) => {
      if (!(group instanceof HTMLElement)) return;
      const active = group.querySelector<HTMLElement>(
        ':scope > [data-active="true"], :scope > .view-tab-group > [data-active="true"]',
      );
      if (!active) {
        group.removeAttribute("data-liquid-active");
        return;
      }
      // offsetLeft/Top ignoran transforms (el modal entra escalado), así que la
      // cápsula queda bien medida aunque el grupo aún se esté animando.
      // Acumulamos offsets subiendo por los offsetParent hasta llegar al grupo,
      // porque el activo puede estar dentro de un wrapper posicionado.
      let x = 0;
      let y = 0;
      let node: HTMLElement | null = active;
      while (node && node !== group) {
        x += node.offsetLeft;
        y += node.offsetTop;
        const parent = node.offsetParent as HTMLElement | null;
        if (!parent) break;
        if (parent !== group && !group.contains(parent)) {
          x -= group.offsetLeft;
          y -= group.offsetTop;
          break;
        }
        node = parent;
      }
      if (!active.offsetWidth || !active.offsetHeight) {
        group.removeAttribute("data-liquid-active");
        return;
      }
      // Primer posicionamiento del grupo: sin viaje desde la esquina.
      if (group.getAttribute("data-liquid-active") !== "true") {
        group.setAttribute("data-liquid-instant", "true");
        requestAnimationFrame(() => group.removeAttribute("data-liquid-instant"));
      }
      group.style.setProperty("--liquid-x", `${x}px`);
      group.style.setProperty("--liquid-y", `${y}px`);
      group.style.setProperty("--liquid-w", `${active.offsetWidth}px`);
      group.style.setProperty("--liquid-h", `${active.offsetHeight}px`);
      group.setAttribute("data-liquid-active", "true");
    };
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) syncGroup(entry.target);
    });
    const syncAll = () => {
      document.querySelectorAll(selector).forEach((group) => {
        resizeObserver.observe(group);
        syncGroup(group);
      });
    };
    const observer = new MutationObserver(syncAll);
    const frame = requestAnimationFrame(() => {
      syncAll();
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-active"],
      });
    });
    window.addEventListener("resize", syncAll);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncAll);
    };
  }, []);

  // Other reports are fetched only when selected, never competing with the home load.

  const active =
    view === "calidad"
      ? coaching
      : view === "comercial" || view === "proyectos" || view === "embudo"
      ? pulse
      : view === "partners"
        ? partner
        : view === "equipo"
          ? team
          : insights;
  const activeMrr = useMemo(() => {
    const report = pulse.data;
    if (!report) return null;
    if (report.activeMrr) {
      const history = report.activeMrr.history.slice(-12);
      const previous = history.length > 1 ? history[history.length - 2]?.value ?? 0 : 0;
      return {
        value: report.activeMrr.value,
        count: report.activeMrr.count,
        values: history.map((point) => point.value),
        labels: history.map((point) => point.date),
        changePct: previous ? ((report.activeMrr.value - previous) / previous) * 100 : null,
        entries: report.activeMrr.entries ?? [],
        lastStart: report.activeMrr.lastStart ?? null,
        churnedExcluded: report.activeMrr.churnedExcluded ?? 0,
        inDevelopment: report.activeMrr.inDevelopment ?? null,
      };
    }
    // Snapshots anteriores a esta función: la sección Proyectos ya contiene la
    // foto exacta por trimestre de los deals que siguen en Inicio de servicio.
    const periods = report.delivery?.find((scope) => scope.id === "team")?.periods ?? [];
    const points = periods.filter((point) => point.liveCount > 0 || point.liveAmount > 0);
    const value = points.reduce((sum, point) => sum + point.liveAmount, 0);
    const count = points.reduce((sum, point) => sum + point.liveCount, 0);
    const values = points.slice(-12).map((point) => point.liveAmount);
    const previous = values.length > 1 ? values[values.length - 2] ?? 0 : 0;
    return value || count
      ? {
          value,
          count,
          values,
          labels: points.slice(-12).map((point) => point.period),
          changePct: previous ? ((values[values.length - 1]! - previous) / previous) * 100 : null,
          entries: [],
          lastStart: null,
          churnedExcluded: 0,
          inDevelopment: null,
        }
      : null;
  }, [pulse.data]);
  useRegisterRefresh(active.refetch, active.isRefreshing, activeMrr);

  const metaKey =
    view === "calidad" ? "coaching" : view === "partners" ? "partner" : view === "equipo" ? "team" : view === "comercial" || view === "proyectos" || view === "embudo" ? (roleFilter === "all" ? "pulse" : `pulse-${roleFilter.toLowerCase()}`) : "insights";
  const estimateMs = meta.data?.[metaKey]?.buildMs;


  const stamp = active.data ? ago(active.data.generatedAt) : undefined;

  const tabs = (
    <>
      <ReportSidebar view={view} onView={setView} collapsed={sidebarCollapsed} onCollapse={() => setSidebarCollapsed((current) => !current)} presentation={embedded ? 'toolbar' : 'sidebar'} />
      {stamp ? (
        <p className="data-stamp">
          <span className="data-stamp-dot" data-live={active.isRefreshing} aria-hidden="true" />
          Datos de {stamp}
          {active.isRefreshing ? " · actualizando…" : ""}
        </p>
      ) : null}
    </>
  );

  if (!active.data) {
    if (active.error) {
      return (
        <main className="pulse-main">
          {tabs}
          <h1 className="pulse-h1">Sales Dashboard</h1>
          <div className="empty-state" style={{ marginTop: 24 }}>
            No pudimos leer el pipeline en vivo.{" "}
            {active.error instanceof Error ? active.error.message : ""}
          </div>
          <button className="tab" type="button" style={{ marginTop: 16 }} onClick={active.refetch}>
            Reintentar
          </button>
        </main>
      );
    }
    return (
      <LoadingProgress
        tabs={tabs}
        estimateMs={estimateMs}
        title="Armando el reporte desde HubSpot"
      />
    );
  }

  if (view === "partners" && partner.data) {
    return (
      <PartnerDashboard
        report={partner.data}
        tabs={tabs}
      />
    );
  }

  if (view === "calidad" && coaching.data) {
    return (
      <QualityDashboard
        report={coaching.data}
        onRefresh={coaching.refetch}
        isRefreshing={coaching.isRefreshing}
        tabs={tabs}
        role={roleFilter}
        onRole={setRoleFilter}
      />
    );
  }

  if (view === "equipo" && team.data) {
    return (
      <TeamDashboard
        report={team.data}
        onRefresh={team.refetch}
        isRefreshing={team.isRefreshing}
        tabs={tabs}
        role={roleFilter}
        onRole={setRoleFilter}
      />
    );
  }

  if (insightsEnabled && insights.data) {
    const shared = {
      report: insights.data,
      onRefresh: insights.refetch,
      isRefreshing: insights.isRefreshing,
      tabs,
      role: roleFilter,
      onRole: setRoleFilter,
    };
    if (view === "crecimiento") return <GrowthDashboard {...shared} />;
    if (view === "simulador")
      return (
        <SimulatorDashboard
          key={`${roleFilter}-${simulateOwner ?? "team"}`}
          {...shared}
          initialOwnerId={simulateOwner}
        />
      );
    return <LossDashboard {...shared} />;
  }

  if (!pulse.data) return null;
  return (
    <PulseDashboard
      report={pulse.data}
      onRefresh={pulse.refetch}
      isRefreshing={pulse.isRefreshing}
      tabs={tabs}
      section={view === "proyectos" ? "proyectos" : view === "embudo" ? "embudo" : "general"}
      role={roleFilter}
      onRole={setRoleFilter}
      onSimulate={(ownerId) => {
        setSimulateOwner(ownerId);
        setView("simulador");

        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
    />
  );
}
