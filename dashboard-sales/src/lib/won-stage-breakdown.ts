import type { DealDTO, Tone } from './pulse-types';

const groups = [
  { key: 'real', label: '6.2 EN DESARROLLO', stages: ['1086544542', '213244763', '171385868', '173990327'], tone: 'ok' as Tone,
    description: 'Negocios que ya tuvieron el kick-off con el Project Manager y están en desarrollo o etapas posteriores. Su valor cuenta oficialmente para el cumplimiento de la cuota.' },
  { key: 'pending', label: 'E6 POR MOVER', stages: ['174677684'], tone: 'warn' as Tone,
    description: 'Negocios con propuesta firmada que aún no cuentan oficialmente para la cuota. Prioriza el traspaso y el kick-off con el Project Manager para que comiencen a contabilizar.' },
  { key: 'warning', label: 'E6.1 WARNING', stages: ['1278792585'], tone: 'bad' as Tone,
    description: 'Negocios con una alerta que requiere revisión: el kick-off puede estar pendiente o puede existir otro bloqueo que impida iniciar o continuar el desarrollo. Revisa la causa y resuélvela antes de avanzar.' },
];

/** Input is the exact eligible won population used by the Ganado card, already scoped to its period and filters. */
export function wonStageBreakdown(eligibleWon: DealDTO[], quota: number) {
  const unique = [...new Map(eligibleWon.map(d => [d.id, d])).values()];
  return groups.map(group => {
    const deals = unique.filter(d => group.stages.includes(d.stageId)).sort((a, b) => (b.amountValue || 0) - (a.amountValue || 0) || a.name.localeCompare(b.name));
    const mrr = deals.reduce((sum, d) => sum + (d.amountValue || 0), 0);
    const otfMonthly = deals.reduce((sum, d) => sum + (d.otfValue || 0) / 12, 0);
    return { ...group, deals, mrr, otfMonthly, percentage: quota > 0 ? mrr / quota * 100 : null };
  });
}
