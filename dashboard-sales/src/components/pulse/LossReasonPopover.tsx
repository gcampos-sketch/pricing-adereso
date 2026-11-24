import { useState } from 'react';
import { X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { InsightDeal } from '@/lib/insights-types';
import { LossReasonSummary } from './LossReasonSummary';
import { LossReasonWords } from './LossReasonWords';
import './LossReasonPopover.css';

export function LossReasonPopover({ label, deals, scope, available, triggerLabel = label }: {
  label: string; deals: InsightDeal[]; scope: string; available: boolean; triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" className="loss-reason-trigger loss-row-label" aria-label={`Ver resumen de ${label}`}>{triggerLabel}</button></PopoverTrigger>
    <PopoverContent className="loss-reason-popover" align="start" sideOffset={8} collisionPadding={16}
      aria-label={`Resumen de ${label}`} style={{ width: 'min(740px, calc(100vw - 32px))', maxHeight: 'min(680px, calc(100dvh - 48px))' }}
      onEscapeKeyDown={event => event.stopPropagation()}>
      <header className="loss-reason-popup-heading"><div><h3>{label}</h3><p>{scope}</p></div>
        <button type="button" className="loss-reason-popup-close" aria-label={`Cerrar resumen de ${label}`} onClick={() => setOpen(false)}><X size={17} aria-hidden="true" /></button>
      </header>
      <LossReasonSummary deals={deals} available={available} showAllComments />
      <details className="loss-reason-summary-detail">
        <summary>Palabras en los comentarios</summary>
        <LossReasonWords deals={deals} available={available} compact />
      </details>
    </PopoverContent>
  </Popover>;
}
