import { useState } from 'react';
import { X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { InsightDeal } from '@/lib/insights-types';
import { LossReasonWords } from './LossReasonWords';
import './LossReasonPopover.css';

export function LossReasonPopover({ label, deals, scope, available, triggerLabel = label }: {
  label: string; deals: InsightDeal[]; scope: string; available: boolean; triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" className="loss-reason-trigger loss-row-label" aria-label={`Ver palabras de ${label}`}>{triggerLabel}</button></PopoverTrigger>
    <PopoverContent className="loss-reason-popover" align="start" sideOffset={8} collisionPadding={16}
      aria-label={`Palabras de ${label}`} style={{ width: 'min(740px, calc(100vw - 32px))', maxHeight: 'min(680px, calc(100dvh - 48px))' }}
      onEscapeKeyDown={event => event.stopPropagation()}>
      <header className="loss-reason-popup-heading"><div><h3>{label}</h3><p>{scope}</p></div>
        <button type="button" className="loss-reason-popup-close" aria-label={`Cerrar palabras de ${label}`} onClick={() => setOpen(false)}><X size={17} aria-hidden="true" /></button>
      </header>
      <LossReasonWords deals={deals} available={available} compact />
    </PopoverContent>
  </Popover>;
}
