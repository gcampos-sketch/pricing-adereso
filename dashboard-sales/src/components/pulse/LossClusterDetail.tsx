import { useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ExternalLink, X } from 'lucide-react';
import type { InsightDeal } from '@/lib/insights-types';
import { money } from './insights-shared';
import { LossReasonWords } from './LossReasonWords';

type DetailProps = { deals: InsightDeal[]; available: boolean } & (
  | { drawerContext: string; onOpen?: never }
  | { drawerContext?: never; onOpen: (title: string, deals: InsightDeal[]) => void }
);

export function LossClusterDetail({ deals, available, onOpen, drawerContext }: DetailProps) {
  const [reason, setReason] = useState('');
  const [all, setAll] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerTrigger = useRef<HTMLButtonElement>(null);
  const reasons = useMemo(() => {
    const groups = new Map<string, InsightDeal[]>();
    for (const deal of deals) {
      const key = deal.lostReason || 'Sin motivo listado';
      groups.set(key, [...(groups.get(key) ?? []), deal]);
    }
    return [...groups].map(([name, rows]) => ({ name, deals: rows }))
      .sort((a, b) => b.deals.length - a.deals.length || a.name.localeCompare(b.name, 'es'));
  }, [deals]);
  const selected = reason ? reasons.find(row => row.name === reason) : null;
  const scoped = selected?.deals ?? deals;
  const selectionLabel = selected?.name ?? 'Todos los motivos';
  const count = `${scoped.length} ${scoped.length === 1 ? 'deal' : 'deals'}`;

  const showDrawer = (trigger: HTMLButtonElement) => {
    drawerTrigger.current = trigger;
    setDrawerOpen(true);
  };
  const pickReason = (value: string, trigger: HTMLButtonElement) => {
    setReason(drawerContext || reason !== value ? value : '');
    if (drawerContext) showDrawer(trigger);
  };

  return <>
    <div className="loss-cluster-reasons" aria-label="Motivos de este grupo">
      <button type="button" className="loss-cluster-reason" aria-pressed={!reason}
        aria-haspopup={drawerContext ? 'dialog' : undefined} onClick={event => pickReason('', event.currentTarget)}>
        <span>Todos los motivos</span><strong>{deals.length}</strong>
      </button>
      {(all ? reasons : reasons.slice(0, 5)).map(row => <button type="button" key={row.name} className="loss-cluster-reason"
        aria-pressed={reason === row.name} aria-haspopup={drawerContext ? 'dialog' : undefined}
        onClick={event => pickReason(row.name, event.currentTarget)}>
        <span>{row.name}</span><span className="loss-cluster-reason-bar"><i style={{ width: `${row.deals.length / deals.length * 100}%` }} /></span>
        <strong>{row.deals.length} <small>· {Math.round(row.deals.length / deals.length * 100)}%</small></strong>
      </button>)}
      {reasons.length > 5 && <button type="button" className="loss-words-more" onClick={() => setAll(!all)}>
        {all ? 'Mostrar los 5 principales' : `Ver ${reasons.length - 5} motivos restantes`}
      </button>}
    </div>
    <div className="loss-cluster-selection">
      <span>{selectionLabel}</span>
      <button type="button" className="cell-button" aria-haspopup={drawerContext ? 'dialog' : undefined}
        onClick={event => onOpen ? onOpen(selectionLabel, scoped) : showDrawer(event.currentTarget)}>Ver {count}</button>
    </div>
    <LossReasonWords key={reason} deals={scoped} available={available} compact initialLimit={6} />
    {drawerContext && <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="scenario-drawer-backdrop" data-loss-cluster-drawer="" />
        <Dialog.Content className="scenario-drawer" data-loss-cluster-drawer=""
          onEscapeKeyDown={event => event.stopPropagation()}
          onCloseAutoFocus={event => { event.preventDefault(); drawerTrigger.current?.focus({ preventScroll: true }); }}>
          <header className="scenario-drawer-heading">
            <div><Dialog.Title>{selectionLabel}</Dialog.Title><Dialog.Description>{count} · {drawerContext}</Dialog.Description></div>
            <Dialog.Close type="button" aria-label="Cerrar lista de deals"><X size={18} aria-hidden="true" /></Dialog.Close>
          </header>
          <div className="scenario-drawer-body">
            <ul className="loss-cluster-deals" aria-label="Deals perdidos">
              {scoped.map(deal => <li key={deal.id}>
                <div>
                  <a href={deal.url} target="_blank" rel="noopener noreferrer">{deal.name}<ExternalLink size={12} aria-hidden="true" /></a>
                  <small>{deal.owner || 'Sin comercial'}</small>
                </div>
                <span><strong>{money(deal.amountValue)}</strong><small>MRR perdido</small></span>
              </li>)}
            </ul>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>}
  </>;
}
