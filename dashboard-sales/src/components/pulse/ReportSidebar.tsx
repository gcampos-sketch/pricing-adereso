import { useEffect, useRef, useState } from "react";
import "./ReportSidebar.css";
import { BarChart3, BriefcaseBusiness, ChevronDown, Handshake, PanelLeftClose, PanelLeftOpen, Users, Workflow, X } from "lucide-react";
import { AccountMenu } from "@/components/AuthGate";
import { DashboardMenu } from "./DashboardMenu";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import type { ReportView } from '@/lib/report-navigation';
export type { ReportView } from '@/lib/report-navigation';

const groups = [
  { id: "comercial", label: "Pipeline Comercial", icon: BriefcaseBusiness, children: [
    { id: "comercial", label: "Vista general" },
    { id: "forecast", label: "Forecast y prioridades" },
    { id: "pipeline", label: "Pipeline y reuniones" },
    { id: "proyectos", label: "Proyectos ganados" },
  ] },
  { id: "conversion", label: "Resultados", icon: BarChart3, children: [
    { id: "conversion", label: "Resultados y conversión" },
    { id: "crecimiento", label: "Expansión vs Venta Nueva" },
    { id: "perdidos", label: "Deals Perdidos" },
    { id: "calidad", label: "Calidad Comercial" },
    { id: "diagnostico", label: "Diagnóstico comercial" },
  ] },
  { id: "partners", label: "Negocios de Partners", icon: Handshake },
  { id: "equipo", label: "Rendimiento del Equipo", icon: Users },
  { id: "simulador", label: "Simuladores", icon: Workflow, children: [
    { id: "embudo", label: "Pipeline Comercial" },
    { id: "simulador", label: "Cumplimiento cuota" },
    { id: "scenarios", label: "Simulaciones de escenarios" },
  ] },
] satisfies { id: ReportView; label: string; icon: typeof Users; children?: { id: ReportView; label: string }[] }[];

export function ReportSidebar({ view, onView, collapsed, onCollapse, presentation = 'sidebar' }: {
  view: ReportView; onView: (view: ReportView) => void; collapsed: boolean; onCollapse: () => void;
  presentation?: 'sidebar' | 'toolbar' | 'panel';
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [peekOpen, setPeekOpen] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelPeekClose = () => { clearTimeout(peekTimer.current); };
  const showPeek = () => {
    cancelPeekClose();
    if (collapsed && window.matchMedia('(min-width: 1051px)').matches) setPeekOpen(true);
  };
  const hidePeek = () => {
    cancelPeekClose();
    peekTimer.current = setTimeout(() => {
      if (!document.getElementById('dashboard-report-panel')?.contains(document.activeElement)) setPeekOpen(false);
    }, 180);
  };
  useEffect(() => () => clearTimeout(peekTimer.current), []);
  useEffect(() => {
    setPeekOpen(false);
    if (collapsed && presentation === 'panel' && document.getElementById('dashboard-report-panel')?.contains(document.activeElement)) {
      document.querySelector<HTMLButtonElement>('.report-subnav-open')?.focus();
    }
  }, [collapsed, presentation]);
  useEffect(() => {
    if (!peekOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      cancelPeekClose();
      setPeekOpen(false);
      const panel = document.getElementById('dashboard-report-panel');
      if (panel?.contains(document.activeElement)) document.querySelector<HTMLButtonElement>('.report-subnav-open')?.focus();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [peekOpen]);
  const [expanded, setExpanded] = useState<string[]>(["comercial"]);

  useEffect(() => {
    const group = groups.find((item) => item.children?.some((child) => child.id === view));
    if (group) setExpanded((current) => current.includes(group.id) ? current : [...current, group.id]);
  }, [view]);

  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", close);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", close); };
  }, [mobileOpen]);

  const select = (next: ReportView) => {
    onView(next);
    setMobileOpen(false);
    setPeekOpen(false);
    if (collapsed && presentation === 'panel') document.querySelector<HTMLButtonElement>('.report-subnav-open')?.focus();
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  if (presentation === 'panel') return <>
    <div className="report-subnav-bar" data-collapsed={collapsed}>
      <Button variant="ghost" className="report-subnav-open" aria-label="Mostrar reportes" aria-controls="dashboard-report-panel" onClick={() => {
        if (window.matchMedia('(max-width: 1050px)').matches) setMobileOpen(true);
        else onCollapse();
      }}><PanelLeftOpen aria-hidden="true" /><span className="sr-only">Reportes</span></Button>
    </div>
    {mobileOpen && <div className="report-subnav-backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true" />}
    <div className="report-subnav-hover-zone"
      onPointerEnter={event => { if (event.pointerType === 'mouse') showPeek(); }}
      onPointerLeave={hidePeek}
      onFocusCapture={showPeek}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) hidePeek(); }}>
      {collapsed && <div className="report-subnav-edge" data-peek={peekOpen}>
        <button type="button" aria-label="Abrir reportes desde el borde" aria-controls="dashboard-report-panel" aria-expanded={peekOpen} onClick={onCollapse}>
          <PanelLeftOpen aria-hidden="true" />
        </button>
      </div>}
    <aside id="dashboard-report-panel" className="report-subnav" data-collapsed={collapsed} data-peek={peekOpen} data-mobile-open={mobileOpen} aria-label="Reportes del dashboard">
      <header className="report-subnav-header">
        <div><span>Dashboard comercial</span><strong>Reportes</strong></div>
        <Button variant="ghost" size="icon" aria-label={collapsed && peekOpen ? "Fijar reportes" : "Ocultar reportes"} title={collapsed && peekOpen ? "Dejar el menú abierto" : "Ocultar reportes"} onClick={() => {
          setMobileOpen(false);
          if (!window.matchMedia('(max-width: 1050px)').matches) onCollapse();
        }}>{collapsed && peekOpen ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}</Button>
      </header>
      <nav className="report-subnav-links" aria-label="Vistas del dashboard">
        {groups.map(group => {
          const active = group.children ? group.children.some(child => child.id === view) : group.id === view;
          const open = expanded.includes(group.id);
          return <div className="report-subnav-group" key={group.id}>
            <button type="button" className="report-subnav-item" data-active={active}
              aria-current={!group.children && active ? 'page' : undefined}
              aria-expanded={group.children ? open : undefined}
              aria-controls={group.children ? `subnav-${group.id}` : undefined}
              onClick={() => group.children ? setExpanded(current => current.includes(group.id) ? current.filter(id => id !== group.id) : [...current, group.id]) : select(group.id)}>
              <group.icon aria-hidden="true" /><span>{group.label}</span>
              {group.children && <ChevronDown className="report-subnav-chevron" data-open={open} aria-hidden="true" />}
            </button>
            {group.children && <div className="report-subnav-children" id={`subnav-${group.id}`} hidden={!open}>
              {group.children.map(child => <button type="button" key={child.id} aria-current={view === child.id ? 'page' : undefined} data-active={view === child.id} onClick={() => select(child.id)}>{child.label}</button>)}
            </div>}
          </div>;
        })}
      </nav>
      <footer className="report-subnav-footer"><DashboardMenu view={view} /></footer>
    </aside>
    </div>
  </>;

  if (presentation === 'toolbar') return <header className="report-toolbar">
    <span className="report-toolbar-label"><BarChart3 aria-hidden="true" />Reportes</span>
    <nav className="report-toolbar-nav" aria-label="Vistas del dashboard">
      {groups.map(group => {
        const active = group.children ? group.children.some(child => child.id === view) : view === group.id;
        const item = <Button variant="ghost" className="report-toolbar-item" data-active={active}
          aria-current={!group.children && active ? 'page' : undefined}
          onClick={group.children ? undefined : () => select(group.id)}>
          <group.icon aria-hidden="true" /><span>{group.label}</span>
          {group.children && <ChevronDown aria-hidden="true" />}
        </Button>;
        return group.children ? <DropdownMenu key={group.id}>
          <DropdownMenuTrigger asChild>{item}</DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="report-toolbar-menu">
            {group.children.map(child => <DropdownMenuItem key={child.id} data-active={view === child.id}
              aria-current={view === child.id ? 'page' : undefined} onSelect={() => select(child.id)}>{child.label}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu> : <div key={group.id}>{item}</div>;
      })}
    </nav>
    <label className="report-toolbar-mobile">
      <span className="sr-only">Vista del dashboard</span>
      <select value={view} onChange={event => select(event.target.value as ReportView)}>
        {groups.map(group => group.children ? <optgroup key={group.id} label={group.label}>
          {group.children.map(child => <option key={child.id} value={child.id}>{child.label}</option>)}
        </optgroup> : <option key={group.id} value={group.id}>{group.label}</option>)}
      </select>
    </label>
    <DashboardMenu view={view} compact /><AccountMenu collapsed />
  </header>;

  return <>
    <div className="report-mobile-bar">
      <Button variant="ghost" size="icon" aria-label="Abrir menú" onClick={() => { if (collapsed) onCollapse(); setMobileOpen(true); }}><PanelLeftOpen /></Button>
      <span>Sales Dashboard</span>
    </div>
    {mobileOpen && <div className="report-sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true" />}
    <aside className="report-sidebar" data-collapsed={collapsed} data-mobile-open={mobileOpen} aria-label="Menú lateral">
      <header className="report-sidebar-brand">
        <button type="button" className="report-brand-home" aria-label="Ir a Vista general" title="Ir a Vista general" aria-current={view === "comercial" ? "page" : undefined} onClick={() => select("comercial")}><BarChart3 className="report-brand-icon" aria-hidden="true" /></button>
        <span>Sales Dashboard</span>
        <Button className="report-mobile-close" variant="ghost" size="icon" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)}><X /></Button>
      </header>
      <nav className="report-sidebar-nav" aria-label="Vistas del reporte">
        <span className="report-nav-caption">REPORTES</span>
        {groups.map((group) => {
          const active = group.children ? group.children.some((child) => child.id === view) : view === group.id;
          const open = expanded.includes(group.id);
          return <div className="report-nav-group" key={group.id}>
            <Button variant="ghost" className="report-nav-item" data-active={active} title={collapsed ? undefined : group.label}
              aria-label={group.label} aria-current={!group.children && active ? "page" : undefined}
              aria-expanded={group.children ? open && !collapsed : undefined}
              aria-controls={group.children ? `report-group-${group.id}` : undefined}
              onClick={() => {
                if (!group.children) { select(group.id); return; }
                if (collapsed) { onCollapse(); setExpanded((current) => current.includes(group.id) ? current : [...current, group.id]); return; }
                setExpanded((current) => current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id]);
              }}>
              <group.icon aria-hidden="true" /><span>{group.label}</span>
              {group.children && <ChevronDown className="report-nav-chevron" data-open={open} aria-hidden="true" />}
            </Button>
            {group.children && <div className="report-nav-children" id={`report-group-${group.id}`} hidden={!open || collapsed}>
              {group.children.map((child) => <Button key={child.id} variant="ghost" className="report-nav-child" data-active={view === child.id} aria-current={view === child.id ? "page" : undefined} onClick={() => select(child.id)}>{child.label}</Button>)}
            </div>}
            {collapsed && <div className="report-nav-flyout" role="menu" aria-label={group.label}>
              <span className="report-nav-flyout-title">{group.label}</span>
              {(group.children ?? [{ id: group.id, label: "Abrir vista" }]).map((child) => (
                <button key={child.id} type="button" role="menuitem" className="report-nav-flyout-item"
                  data-active={view === child.id} onClick={() => select(child.id)}>{child.label}</button>
              ))}
            </div>}
          </div>;
        })}
      </nav>
      <footer className="report-sidebar-footer">
        <DashboardMenu view={view} compact={collapsed} /><AccountMenu collapsed={collapsed} />
        <Button variant="ghost" className="report-collapse-toggle" aria-label={collapsed ? "Expandir menú" : "Contraer menú"} title={collapsed ? "Expandir menú" : "Contraer menú"} onClick={onCollapse}>
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}<span>Contraer menú</span>
        </Button>
      </footer>
    </aside>
  </>;
}
