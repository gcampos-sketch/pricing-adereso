import { useEffect, useState } from "react";
import { BarChart3, BriefcaseBusiness, ChevronDown, Handshake, PanelLeftClose, PanelLeftOpen, Users, Workflow, X } from "lucide-react";
import { AccountMenu } from "@/components/AuthGate";
import { Button } from "@/components/ui/button";

export type ReportView = "comercial" | "proyectos" | "partners" | "equipo" | "crecimiento" | "simulador" | "embudo" | "perdidos" | "calidad";

const groups = [
  { id: "comercial", label: "Pipeline Comercial", icon: BriefcaseBusiness, children: [
    { id: "comercial", label: "Vista general" },
    { id: "proyectos", label: "Proyectos" },
    { id: "crecimiento", label: "Expansión vs Venta Nueva" },
    { id: "perdidos", label: "Deals Perdidos" },
    { id: "calidad", label: "Calidad Comercial" },
  ] },
  { id: "partners", label: "Negocios de Partners", icon: Handshake },
  { id: "equipo", label: "Rendimiento del Equipo", icon: Users },
  { id: "simulador", label: "Simulador de Estrategia", icon: Workflow, children: [
    { id: "embudo", label: "Pipeline Comercial" },
    { id: "simulador", label: "Cumplimiento cuota" },
  ] },
] satisfies { id: ReportView; label: string; icon: typeof Users; children?: { id: ReportView; label: string }[] }[];

export function ReportSidebar({ view, onView, collapsed, onCollapse }: {
  view: ReportView; onView: (view: ReportView) => void; collapsed: boolean; onCollapse: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
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
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  return <>
    <div className="report-mobile-bar">
      <Button variant="ghost" size="icon" aria-label="Abrir menú" onClick={() => { if (collapsed) onCollapse(); setMobileOpen(true); }}><PanelLeftOpen /></Button>
      <span>Sales Dashboard</span>
    </div>
    {mobileOpen && <div className="report-sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true" />}
    <aside className="report-sidebar" data-collapsed={collapsed} data-mobile-open={mobileOpen} aria-label="Menú lateral">
      <header className="report-sidebar-brand">
        <BarChart3 className="report-brand-icon" aria-hidden="true" />
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
        <AccountMenu collapsed={collapsed} />
        <Button variant="ghost" className="report-collapse-toggle" aria-label={collapsed ? "Expandir menú" : "Contraer menú"} title={collapsed ? "Expandir menú" : "Contraer menú"} onClick={onCollapse}>
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}<span>Contraer menú</span>
        </Button>
      </footer>
    </aside>
  </>;
}