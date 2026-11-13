import { dealExposure } from '@/lib/deal-exposure';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, RefreshCw, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useAccountEmail } from '@/components/AuthGate';
import { useRefreshMenu } from '@/contexts/RefreshContext';
import type { NoticeScope } from '@/lib/sales-notifications';
import { OFF_TRACK_HUBSPOT_VIEW, type ActionGroup } from '@/lib/dashboard-action-groups';

const EMPTY_GROUPS: ActionGroup[] = [];
type Props = { scope: NoticeScope; groups?: ActionGroup[]; generatedAt?: string; onReview: (group: ActionGroup) => void };
export function NotificationCenter(props: Props) {
  const account = useAccountEmail();
  const refresh = useRefreshMenu();
  return account ? <NotificationCenterView {...props} busy={refresh.isRefreshing} onRefresh={() => refresh.onRefresh?.()} /> : null;
}
export function NotificationCenterView({ scope, groups = EMPTY_GROUPS, generatedAt, onReview, busy = false, onRefresh }: Props & { busy?: boolean; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const entireTeam = scope.owner === 'team' && scope.role === 'all' && scope.type === 'all' && scope.stages.length === 0;
  const review = (group: ActionGroup) => { setOpen(false); onReview(group); };
  return <TooltipProvider><Popover modal open={open} onOpenChange={setOpen}>
    {open && typeof document !== 'undefined' ? createPortal(<div className="notification-focus-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />, document.body) : null}
    <Tooltip><TooltipTrigger asChild><PopoverTrigger asChild>
      <Button variant="outline" size="icon" aria-label={`Tareas comerciales: ${groups.length} grupos pendientes`} className="notification-bell">
        <Bell aria-hidden="true" className="size-5" />
        {groups.length > 0 && <span className="notification-count">{groups.length}</span>}
      </Button>
    </PopoverTrigger></TooltipTrigger><TooltipContent>Tareas agrupadas</TooltipContent></Tooltip>
    <PopoverContent align="end" className="notification-popup notification-grouped" role="dialog" aria-label="Tareas comerciales agrupadas">
      <header className="notification-grouped-header"><div><h2>Pendientes de revisión</h2><p>{groups.length} tareas agrupadas · situación actual</p></div>
        <Button variant="ghost" size="icon" aria-label="Actualizar pendientes" disabled={busy} onClick={onRefresh}><RefreshCw aria-hidden="true" className={`size-4 ${busy ? 'animate-spin' : ''}`} /></Button>
      </header>
      {!groups.length && <p role="status" className="notification-empty">{busy ? 'Revisando pendientes…' : 'Sin pendientes de estas categorías en el alcance seleccionado.'}</p>}
      <div className="notification-group-list">
        {groups.map(group => <article className="notification-action" key={group.id}>
          {group.id === 'off-track' && entireTeam ? <a href={OFF_TRACK_HUBSPOT_VIEW} target="_blank" rel="noreferrer" className="notification-action-main" onClick={() => setOpen(false)}>
            <span><strong>{group.title}</strong><small>Abrir oportunidades activas del equipo en HubSpot.</small></span>
            <span className="notification-action-count">{group.deals.length}<ArrowUpRight aria-hidden="true" /></span>
          </a> : <button type="button" className="notification-action-main" onClick={() => review(group)}>
            <span><strong>{group.title}</strong><small>{group.description}</small></span>
            <span className="notification-action-value"><span className="notification-action-count">{group.deals.length}<ArrowUpRight aria-hidden="true" /></span>
              {group.id === 'lost-candidate' ? <small>{new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:0}).format(dealExposure(group.deals).mrr)} MRR</small> : null}
            </span>
          </button>}
          {group.id === 'off-track' && !entireTeam && <a className="notification-hubspot-link" href={OFF_TRACK_HUBSPOT_VIEW} target="_blank" rel="noreferrer">Abrir vista del equipo en HubSpot <ArrowUpRight aria-hidden="true" /></a>}
          {group.reasons.length > 0 && <div className="notification-reason-groups" aria-label={group.id === "warning" ? "Motivos del warning" : "Motivos de candidatos a perdido"}>
            {group.reasons.map(reason => <button type="button" key={reason.label} onClick={() => review({...group, title: `${group.id === "warning" ? "E6.1" : "Candidatos a perdido"} · ${reason.label}`, description: reason.label, deals: reason.deals, reasons: []})}>{reason.label} <b>{reason.deals.length}</b></button>)}
          </div>}
        </article>)}
      </div>
      <p className="notification-grouped-note">Se mantienen hasta resolver la condición en HubSpot. Abrirlas no las marca como resueltas.</p>
      {generatedAt && <small className="notification-grouped-stamp">Actualizado {new Date(generatedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</small>}
    </PopoverContent>
  </Popover></TooltipProvider>;
}
