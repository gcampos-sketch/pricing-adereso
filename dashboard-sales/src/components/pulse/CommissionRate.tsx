import { useEffect, useId, useState } from 'react';
import { X } from 'lucide-react';
import { useAccountEmail } from '@/components/AuthGate';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { COMMISSION_BANDS, commissionRate } from '@/lib/quarter-performance';

const percent = (value: number) => `${value.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const factor = (value: number) => `×${value.toLocaleString('es-CL', { maximumFractionDigits: 5 })}`;

export function CommissionRate({ attainment, scope, simulated = false, chipLabel }: { attainment: number | null; scope: string; simulated?: boolean; chipLabel?: string }) {
  const account = useAccountEmail();
  const key = `commission-target/v1:${account ?? 'unknown'}:${scope}`;
  const [target, setTarget] = useState('');
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const targetId = useId();
  useEffect(() => {
    const read = () => { try { setTarget(localStorage.getItem(key) ?? ''); } catch { setTarget(''); } };
    read();
    window.addEventListener('commission-target-changed', read);
    return () => window.removeEventListener('commission-target-changed', read);
  }, [key]);

  // Attainment determines the factor even when no personal target is configured.
  const current = commissionRate(attainment, 0);
  const targetValue = target.trim() ? Number(target) : null;
  const validTarget = targetValue !== null && Number.isFinite(targetValue) && targetValue >= 0 && targetValue <= 100;
  const result = commissionRate(attainment, targetValue);
  const tableTarget = validTarget ? targetValue : 9.09;

  return <div className="commission-inline" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="commission-factor-chip" title="Ver tabla y detalle de comisión">
            <span>{chipLabel ?? (simulated ? 'Factor simulado' : 'Factor comisión')}</span>
            <strong>{current ? `${factor(current.factor)}${current.asterisk ? '*' : ''}` : 'Sin datos'}</strong>
          </button>
        </PopoverTrigger>
        <PopoverContent className="commission-popover" align="start" sideOffset={10} collisionPadding={12} aria-labelledby={titleId}>
          <div className="commission-popover-heading">
            <h3 id={titleId}>Factor de comisión{simulated ? ' · Simulación' : ''}</h3>
            <button type="button" className="commission-info" aria-label="Cerrar tabla de comisión" onClick={() => setOpen(false)}><X size={16} aria-hidden="true" /></button>
          </div>
          <div className="commission-current">
            <div><span>Cumplimiento{simulated ? ' simulado' : ' actual'}</span><strong>{current && attainment !== null ? percent(attainment) : 'Sin datos'}</strong></div>
            <div><span>Factor del tramo</span><strong>{current ? `${factor(current.factor)}${current.asterisk ? '*' : ''}` : '—'}</strong></div>
          </div>
          <div className="commission-target">
            <label htmlFor={targetId}>Tu comisión objetivo</label>
            <div><input id={targetId} aria-label={`Comisión objetivo de ${scope}`} type="number" min="0" max="100" step=".01" placeholder="Sin definir" value={target} onChange={e => {
              setTarget(e.target.value);
              try { localStorage.setItem(key, e.target.value); window.dispatchEvent(new Event('commission-target-changed')); } catch { /* optional preference */ }
            }} /><span>%</span></div>
          </div>
          {target.trim() && !validTarget ? <p className="commission-note" role="alert">Ingresa un objetivo entre 0% y 100%.</p> : null}
          {result ? <p className="commission-result">{simulated ? 'Comisión simulada' : 'Comisión obtenida'} <strong>{percent(result.rate)}{result.asterisk ? '*' : ''}</strong><span>{percent(targetValue!)} {factor(result.factor)} = {percent(result.rate)}</span></p> : null}
          {!current ? <p className="commission-note">Selecciona un único trimestre con cuota disponible para conocer el factor actual.</p> : null}
          <table className="commission-table">
            <thead><tr><th scope="col">Cumplimiento</th><th scope="col">Factor</th><th scope="col">{validTarget ? `Con tu objetivo ${percent(tableTarget)}` : 'Ejemplo con 9,09%'}</th></tr></thead>
            <tbody>{COMMISSION_BANDS.map(band => {
              const active = current?.from === band.from;
              return <tr key={band.from} data-current={active} aria-current={active ? 'true' : undefined}>
                <td>{band.from}–{Number.isFinite(band.to) ? band.to : '∞'}%{band.asterisk ? '*' : ''}{active ? <span className="commission-current-label">Actual</span> : null}</td>
                <td>{factor(band.factor)}</td>
                <td>{percent(commissionRate(band.from, tableTarget)!.rate)}{band.asterisk ? '*' : ''}</td>
              </tr>;
            })}</tbody>
          </table>
          {!validTarget ? <p className="commission-note">9,09% es solo un ejemplo. Define tu objetivo para calcular tu porcentaje.</p> : null}
          <p className="commission-note">En un límite exacto se aplica el tramo superior. * Las condiciones de los tramos desde 120% están pendientes de especificar.</p>
          <p className="commission-note">Porcentaje orientativo; no calcula pago monetario. Tu objetivo se guarda en este navegador para tu cuenta y el comercial seleccionado.</p>
        </PopoverContent>
      </Popover>
  </div>;
}
