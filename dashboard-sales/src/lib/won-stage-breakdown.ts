import type { DealDTO, Tone } from './pulse-types';

const groups = [
  { key: 'real', label: '6.2 EN DESARROLLO', stages: ['1086544542', '213244763', '171385868', '173990327'], tone: 'ok' as Tone,
    description: 'Ganados elegibles del período seleccionado que hoy están en desarrollo (E6.2) o etapas posteriores. Es una parte del ganado de ese período, no todos los proyectos actualmente en desarrollo.' },
  { key: 'pending', label: 'E6 POR MOVER', stages: ['174677684'], tone: 'warn' as Tone,
    description: 'Ganados elegibles del período seleccionado que siguen en E6 · Propuesta comercial firmada. Falta avanzar hacia desarrollo; el chip no mueve los deals de etapa.' },
  { key: 'warning', label: 'E6.1 WARNING', stages: ['1278792585'], tone: 'bad' as Tone,
    description: 'Ganados elegibles del período seleccionado que hoy están en E6.1 · Deal Warning. Requieren atención antes de avanzar a desarrollo.' },
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
