import { useMemo } from 'react';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DiagnosticEdition, DiagnosticRow } from '@/lib/commercial-diagnostic';
import { diagnosticWarnings, warningComparison, warningCoverage, type DiagnosticWarning } from '@/lib/commercial-diagnostic-warnings';
import { SectionTitle } from './insights-shared';

export function DiagnosticWarnings({ current, previous, rows, owner, onSelect }: {
  current: DiagnosticEdition; previous: DiagnosticEdition | null; rows: DiagnosticRow[]; owner: string;
  onSelect: (row: DiagnosticRow) => void;
}) {
  const warnings = useMemo(() => diagnosticWarnings(rows), [rows]);
  const coverage = useMemo(() => warningCoverage(rows), [rows]);
  const diff = useMemo(() => warningComparison(current, previous, owner), [current, previous, owner]);
  const groups = [...new Set(warnings.map(item => item.rule))].map(rule => warnings.filter(item => item.rule === rule)).sort((a, b) => Number(b[0]!.kind === 'warning') - Number(a[0]!.kind === 'warning') || b.length - a.length);
  const status = (item: DiagnosticWarning) => !diff ? 'Base inicial' : diff.appeared.some(value => value.id === item.id) ? 'Apareció en evidencia' : diff.entered.some(value => value.id === item.id) ? 'Entró al alcance' : 'Sigue en evidencia';
  return <>
    <SectionTitle note="Señales respaldadas por el texto; no demuestra que el tema no se haya conversado">Warnings y vacíos</SectionTitle>
    <section className="grid-3 diagnostic-metrics">
      <div className="metric diagnostic-metric"><span className="metric-label">Con señales documentadas</span><strong className="metric-value">{new Set(warnings.map(item => item.row.id)).size}</strong><span className="metric-note">Negocios, de {coverage.total} activos</span></div>
      <div className="metric diagnostic-metric"><span className="metric-label">Qué confirmar o explicar</span><strong className="metric-value">{warnings.length}</strong><span className="metric-note">Un negocio puede tener varias señales</span></div>
      <div className="metric diagnostic-metric"><span className="metric-label">Sin base SPICED</span><strong className="metric-value">{coverage.spiced.length}</strong><span className="metric-note">Cobertura pendiente, no omisión probada</span></div>
    </section>
    <div className="diagnostic-warning-list">{groups.map(items => <details className="diagnostic-warning-group" key={items[0]!.rule}>
      <summary><div><strong>{items[0]!.title}</strong><span>{items[0]!.action}</span></div><b>{items.length}<small> negocios</small></b></summary>
      <div className="table-wrap"><table className="pulse-table diagnostic-warning-table"><thead><tr><th>Negocio</th><th>Evidencia breve</th><th>Desde la edición anterior</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><Button variant="ghost" onClick={() => onSelect(item.row)}>{item.row.name}<ArrowRight size={13} /></Button></td><td><span className="diagnostic-preview-text">{item.evidence}</span>{item.source ? <a className="diagnostic-source" href={item.source.url} target="_blank" rel="noreferrer">Fuente del {item.source.date.slice(0, 10)} <ExternalLink size={12} /></a> : <small className="diagnostic-caption">{item.field} · conservado en esta edición</small>}</td><td><span className="diagnostic-caption">{status(item)}</span></td></tr>)}</tbody></table></div>
    </details>)}{!groups.length && <div className="empty-state">Sin señales explícitas en los textos disponibles. Revisa la cobertura pendiente antes de concluir que no hay riesgos.</div>}</div>
    <SectionTitle note={diff ? 'Mismos negocios y alcance comparable' : 'La primera edición fija la base; no inventa una tendencia'}>Movimiento de las señales</SectionTitle>
    {diff ? <div className="diagnostic-warning-movement">{([
      ['Aparecieron en evidencia', diff.appeared], ['Siguen en evidencia', diff.persisted],
      ['Ya no se observan', diff.noLongerObserved], ['Se perdió cobertura', diff.lostCoverage],
      ['Entraron al alcance', diff.entered], ['Salieron del alcance', diff.outsideScope],
    ] as const).map(([label, items]) => <details className="diagnostic-method" key={label}><summary>{label} <strong>{items.length}</strong></summary><div className="diagnostic-pattern-deals">{items.map(item => <Button key={item.id} variant="ghost" onClick={() => onSelect(item.row)}>{item.row.name} · {item.title}</Button>)}{!items.length && <span className="diagnostic-caption">Sin cambios de este tipo.</span>}</div></details>)}</div> : <p className="diagnostic-caption">Base inicial. La próxima edición distinguirá señales nuevas, persistentes y que ya no se observan.</p>}
    <p className="diagnostic-caption">“Ya no se observa” no equivale a “resuelto”. Una salida de la vista o una pérdida de datos se muestra por separado.</p>
    <details className="diagnostic-method"><summary>Cobertura pendiente · qué todavía no podemos evaluar</summary><div className="diagnostic-warning-coverage">{([
      ['SPICED sin evaluar', coverage.spiced], ['Caso de uso sin respaldo suficiente', coverage.cases], ['Objeción sin documentar', coverage.objections],
    ] as const).map(([label, items]) => <details key={label}><summary>{label} · {items.length}</summary><div className="diagnostic-pattern-deals">{items.map(row => <Button key={row.id} variant="ghost" onClick={() => onSelect(row)}>{row.name}</Button>)}</div></details>)}</div></details>
  </>;
}
