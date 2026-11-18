import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { Info, RefreshCw } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { getPriceConversion } from '@/lib/price-conversion.functions';
import { analyzePrices, priceInWindow, priceDistribution, priceTypeKey, priceTypeLabel, type PriceMetric, type PriceBand, type PriceFilters, type PriceObservation, type PriceReport } from '@/lib/price-conversion';
import type { DealDTO } from '@/lib/pulse-types';
import type { RoleFilter } from '@/lib/owner-roles';
import './PriceConversion.css';

const number = (value: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(value);
const money = (value: number | null, currency: string) => value === null ? 'Sin dato' : `${currency} ${number(value)}`;
const bandLabel = (band: PriceBand) => band.upper === Infinity ? `≥ ${number(band.lower)}` : band.lower === 0 ? `< ${number(band.upper)}` : `${number(band.lower)} – < ${number(band.upper)}`;
const options = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
const valueLabel = (value: string) => value.replaceAll(';', ' + ');

type Props = {
  role: RoleFilter; owner: string; ownerName: string; periods: string[]; rangeLabel: string;
  refreshKey: string; matchesType: (deal: DealDTO) => boolean;
};

export function PriceConversion(props: Props) {
  const queryClient = useQueryClient();
  const queryKey = ['price-conversion/detail-v2', props.role, props.refreshKey];
  const load = async (fresh = false) => JSON.parse(await getPriceConversion({ data: { role: props.role, fresh } })) as PriceReport;
  const query = useQuery({
    queryKey,
    queryFn: () => load(),
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === props.role ? previous : undefined,
    staleTime: 90_000, retry: false, refetchOnWindowFocus: false,
  });
  if (query.isPending) return <div className="price-state" role="status">Leyendo precios y verificando empresas asociadas…</div>;
  if (query.isError) return <div className="price-state" role="alert"><p>No se pudo completar la lectura. No se muestran totales parciales.</p><Button variant="outline" onClick={() => void query.refetch()}>Reintentar</Button></div>;
  return <PriceConversionView {...props} report={query.data} onRefresh={() => { void queryClient.fetchQuery({ queryKey, queryFn: () => load(true), staleTime: 0 }).catch(() => {}); }} refreshing={query.isFetching} />;
}

/** Exported separately so the actual product can be visually checked with synthetic records. */
export function PriceConversionView({ report, onRefresh, refreshing, ...props }: Props & { report: PriceReport; onRefresh: () => void; refreshing: boolean }) {
  const [view, setView] = useState<'conversion' | 'demand'>('conversion');
  const [metric, setMetric] = useState<PriceMetric>('mrr');
  const [dealTypes, setDealTypes] = useState<string[] | null>(null);
  const [facet, setFacet] = useState<{ field: 'industry' | 'companySize'; label: string } | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [period, setPeriod] = useState<PriceFilters['period']>('rolling');
  const [product, setProduct] = useState('all');
  const [plan, setPlan] = useState('all');
  const [pricingModel, setPricingModel] = useState('all');
  const [volume, setVolume] = useState('all');
  const [cohort, setCohort] = useState<PriceFilters['cohort']>('all');
  const [selected, setSelected] = useState<{ title: string; rows: PriceObservation[] } | null>(null);
  const [narrowChart, setNarrowChart] = useState(false);
  const rows = useMemo(() => report.rows.filter(row => (props.owner === 'team' || row.deal.ownerId === props.owner) && props.matchesType(row.deal)), [report.rows, props.owner, props.matchesType]);
  const filters: PriceFilters = { metric, ...(dealTypes === null ? {} : { dealTypes }), currency, period, product, plan, pricingModel, volume, cohort, periods: props.periods };
  const result = analyzePrices(rows, report.readAt, filters);
  const available = rows.filter(row => priceInWindow(row.deal.closeDateValue, report.readAt, filters));
  const currencies = options(rows.map(row => row.currency));
  const excludedCount = Object.values(result.excluded).reduce((sum, list) => sum + list.length, 0);
  const setupMissing = result.eligible.filter(row => row.setup === null).length;
  const cohortMissing = result.eligible.filter(row => row.cohort === 'unknown').length;
  const chartData = result.bands.map(band => ({ ...band, label: bandLabel(band), count: band.rows.length, won: band.wonRows.length }));
  const demandData = chartData.filter(band => band.count > 0).map(band => ({ ...band, price: metric === 'setup' ? band.setupMedian : band.monthlyMedian, quantity: band.won }));
  useEffect(() => { setSelected(null); }, [props.owner, props.role, props.periods, props.matchesType, report.readAt, currency, period, product, plan, pricingModel, volume, cohort, metric, dealTypes]);
  const show = (title: string, selectedRows: PriceObservation[]) => { setFacet(null); setSelected({ title, rows: selectedRows }); };
  const unit = metric === 'mrr' ? '/mes' : ' · setup';
  const metricLabel = metric === 'mrr' ? 'MRR' : 'Setup/OTF';
  const typeOptions = [...new Map(rows.map(row => [priceTypeKey(row), priceTypeLabel(row)])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const detailRows = selected?.rows.filter(row => !facet || (row[facet.field]?.trim() || 'Sin dato registrado') === facet.label) ?? [];
  const detail = (band: PriceBand) => <div className="price-tooltip"><strong>{currency} {bandLabel(band)}{unit}</strong>
    <span>{band.wonRows.length} ganados / {band.rows.length} propuestas cerradas</span>
    <span>Conversión: {band.rate === null ? 'Sin dato' : `${number(band.rate)}%`}</span>
    <span>Setup/OTF mediano: {money(band.setupMedian, currency)} · {band.setupKnown}/{band.rows.length} con dato</span>
    {band.rows.length < 30 && <span>Muestra pequeña (n &lt; 30)</span>}</div>;

  function filter(label: string, value: string, onChange: (value: string) => void, values: { value: string; label: string }[]) {
    const choices = values.some(option => option.value === value) ? values : [...values, { value, label: `${valueLabel(value)} · sin casos en este alcance` }];
    return <label className="price-filter"><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)}>{choices.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  }
  const fieldOptions = (values: string[]) => [{ value: 'all', label: 'Todos' }, ...options(values).map(value => ({ value, label: valueLabel(value) })), { value: 'unknown', label: 'Sin dato registrado' }];

  return <div className="price-analysis">
    <div className="price-topline"><div className="price-view-switch" role="group" aria-label="Vista de precio y conversión">
      <Button variant="ghost" aria-pressed={view === 'conversion'} onClick={() => setView('conversion')}>Conversión</Button>
      <Button variant="ghost" aria-pressed={view === 'demand'} onClick={() => setView('demand')}>Demanda observada</Button>
    </div><div className="price-tools">
      <Popover><PopoverTrigger asChild><Button variant="ghost" size="icon" aria-label="Cómo se calcula precio y demanda"><Info size={16} /></Button></PopoverTrigger>
        <PopoverContent className="price-method" align="end"><strong>Qué estamos comparando</strong>
          <p>Negocios ganados o en Deal perdido, con fecha de cierre real y paso registrado por E5/E5.1 anterior o igual al cierre. Se excluyen churn y pérdidas en desarrollo. Cada negocio cuenta una vez.</p>
          <p>MRR = hs_mrr actual; el selector Setup usa otf registrado, sin reconstruir la oferta inicial. La moneda es deal_currency_code; moneda_cotizacion no convierte esos importes. No se mezclan ni convierten monedas o tarifas Meta.</p>
          <p>Setup/OTF = otf registrado. Puede incluir otros pagos únicos; no equivale necesariamente al desembolso inicial. Vacío es desconocido; cero es un dato válido.</p>
          <p>Adquisición = dealtype Oportunidad más empresa inequívoca sin otro ganado previo registrado al entrar a propuesta. Expansión = otro negocio de esa misma empresa con entrada a ganado anterior. Las asociaciones ambiguas, lecturas incompletas, tipos faltantes o cronologías insuficientes quedan sin verificar. El deal type «Oportunidad» por sí solo no prueba adquisición. No se consolidan holdings.</p>
          <p>La demanda observada cuenta negocios ganados por rango de precio y muestra la exposición de propuestas cerradas. No representa todo el mercado, nuevos clientes únicos ni una curva causal. Diferencias de alcance, setup y selección comercial pueden explicar la forma. No se estima elasticidad. El selector MRR/Setup cambia el importe usado para los rangos y la mediana del gráfico; setup cero se incluye y setup vacío se excluye de esa vista.</p>
          <p>Los filtros de producto comparan el paquete completo registrado; plan y volumen son campos del negocio, sin inferirlos del catálogo. Los datos actuales pueden diferir de los ofrecidos originalmente. n &lt; 30 indica muestra pequeña, no una prueba estadística.</p>
          <p>{report.totalCommercial} negocios comerciales leídos con paginación completa. {report.companyCoverageComplete ? 'Lectura de asociaciones completa.' : 'Asociaciones incompletas: no se infiere adquisición por ausencia.'}</p>
        </PopoverContent></Popover>
      <Button variant="ghost" size="icon" onClick={onRefresh} disabled={refreshing} aria-label="Actualizar análisis de precios"><RefreshCw size={15} className={refreshing ? 'price-spinning' : ''} /></Button>
    </div></div>

    <div className="price-view-switch" role="group" aria-label="Importe del análisis">
      <Button variant="ghost" aria-pressed={metric === 'mrr'} onClick={() => setMetric('mrr')}>MRR · mensualidad</Button>
      <Button variant="ghost" aria-pressed={metric === 'setup'} onClick={() => setMetric('setup')}>Setup · pago único</Button>
    </div>
    <div className="price-filters">
      <div className="price-filter"><span id="price-types-label">Tipo de deal · selección múltiple</span>
        <Popover><PopoverTrigger asChild><Button variant="outline" className="price-type-trigger" aria-labelledby="price-types-label">{dealTypes === null ? 'Todos los tipos' : dealTypes.length === 0 ? 'Ningún tipo seleccionado' : typeOptions.filter(([key]) => dealTypes.includes(key)).map(([, label]) => label).join(' + ') || 'Sin casos en este alcance'}</Button></PopoverTrigger>
          <PopoverContent className="price-type-menu" align="start"><button onClick={() => setDealTypes(null)}>Seleccionar todos</button><button onClick={() => setDealTypes([])}>Limpiar selección</button>
            {typeOptions.map(([key, label]) => <label key={key}><input type="checkbox" checked={dealTypes === null || dealTypes.includes(key)} onChange={() => setDealTypes(current => { const active = current ?? typeOptions.map(([value]) => value); return active.includes(key) ? active.filter(value => value !== key) : [...active, key]; })} />{label}</label>)}
            <small>Se combina con el filtro principal de tipo.</small>
          </PopoverContent>
        </Popover>
      </div>
      {filter('Período por cierre', period, value => setPeriod(value as PriceFilters['period']), [{ value: 'rolling', label: 'Últimos 12 meses' }, { value: 'master', label: `Período principal · ${props.rangeLabel}` }])}
      {filter('Moneda del importe', currency, setCurrency, options(['USD', ...currencies]).map(value => ({ value, label: value })))}
      {filter('Productos / paquete', product, setProduct, fieldOptions(available.map(row => row.product)))}
      {filter('Plan de setup', plan, setPlan, fieldOptions(available.map(row => row.plan)))}
      {filter('Modelo de pricing', pricingModel, setPricingModel, fieldOptions(available.map(row => row.pricingModel)))}
      {filter('Conversaciones base', volume, setVolume, fieldOptions(available.flatMap(row => row.volume === null ? [] : [String(row.volume)])))}
      {filter('Relación con la empresa', cohort, value => setCohort(value as PriceFilters['cohort']), [{ value: 'all', label: 'Adquisición + expansión + sin verificar' }, { value: 'acquisition', label: 'Adquisición · sin ganado previo registrado' }, { value: 'expansion', label: 'Expansión · ganado previo verificado' }, { value: 'unknown', label: 'Relación sin verificar' }])}
    </div>
    <div className="price-scope" aria-live="polite"><span>{props.ownerName} · {period === 'rolling' ? 'Últimos 12 meses por cierre' : `${props.rangeLabel} por cierre`} · {result.eligible.length} propuestas cerradas · {result.eligible.filter(row => row.won).length} ganadas</span><span>Lectura: {new Date(report.readAt).toLocaleString('es-CL', { timeZone: 'America/Coyhaique', dateStyle: 'short', timeStyle: 'short' })}</span></div>
    <div className="price-chart-heading"><h3>{view === 'conversion' ? `Conversión por rango de ${metric === 'mrr' ? 'mensualidad' : 'setup'}` : 'Demanda observada por precio'}</h3>
      <p>{view === 'conversion' ? `Ganados / propuestas cerradas · ${metricLabel} en ${currency}` : `Cantidad de negocios ganados (Q) y ${metricLabel} mediano registrado (P) · ${currency}. Tamaño del punto: propuestas cerradas.`}</p></div>
    {result.eligible.length ? <>
      <div className="price-chart" role="img" aria-label={view === 'conversion' ? `Conversión por rango en ${currency}. ${chartData.map(row => `${row.label}: ${row.rate === null ? 'sin propuestas' : `${number(row.rate)}%, ${row.won} de ${row.count}`}`).join('; ')}` : `Demanda observada. ${demandData.map(row => `${row.won} negocios ganados con ${metricLabel} mediano ${currency} ${row.price}; ${row.count} propuestas cerradas en el rango ${row.label}`).join('; ')}`}>
        <ResponsiveContainer width="100%" height={280} onResize={width => setNarrowChart(width < 520)}>
          {view === 'conversion' ? <BarChart data={chartData} layout={narrowChart ? 'vertical' : 'horizontal'} margin={{ top: 25, right: narrowChart ? 44 : 12, left: 0, bottom: 15 }}>
            <CartesianGrid vertical={narrowChart} horizontal={!narrowChart} stroke="var(--border)" />
            <XAxis {...(narrowChart ? { type: 'number' as const, domain: [0, 100], ticks: [0, 50, 100], unit: '%' } : { type: 'category' as const, dataKey: 'label', interval: 0 })} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} />
            <YAxis {...(narrowChart ? { type: 'category' as const, dataKey: 'label', width: 110, interval: 0 } : { type: 'number' as const, domain: [0, 100], unit: '%', width: 44 })} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} />
            <Tooltip cursor={{ fill: 'var(--surface)' }} content={({ active, payload }) => active && payload?.[0] ? detail(payload[0].payload as PriceBand) : null} />
            <Bar dataKey="rate" fill="var(--brand)" maxBarSize={64} isAnimationActive={false} onClick={row => show(`Propuestas · ${currency} ${row.label}${unit}`, row.rows)}>
              <LabelList dataKey="rate" position={narrowChart ? 'right' : 'top'} fill="var(--foreground)" fontSize={12} formatter={(value: unknown) => typeof value === 'number' ? `${number(value)}%` : '—'} />
            </Bar>
          </BarChart> : <ScatterChart margin={{ top: 20, right: 22, left: 8, bottom: 24 }}>
            <CartesianGrid stroke="var(--border)" />
            <XAxis type="number" dataKey="quantity" name="Negocios ganados" allowDecimals={false} domain={[0, 'auto']} tick={{ fill: 'var(--muted)', fontSize: 11 }} label={{ value: 'Negocios ganados (Q)', position: 'bottom', fill: 'var(--muted)', fontSize: 12 }} />
            <YAxis type="number" dataKey="price" name={`${metricLabel} mediano (${currency})`} width={65} domain={[0, 'auto']} tickFormatter={number} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
            <ZAxis type="number" dataKey="count" name="Propuestas cerradas" range={[60, 400]} />
            <Tooltip content={({ active, payload }) => active && payload?.[0] ? detail(payload[0].payload as PriceBand) : null} />
            <Scatter name="Negocios ganados por rango" data={demandData} fill="var(--brand)" isAnimationActive={false} onClick={row => show(`Ganados · ${currency} ${row.label}${unit}`, row.wonRows)} />
          </ScatterChart>}
        </ResponsiveContainer>
      </div>
      <p className="price-caveat">{view === 'demand' ? 'Cada punto representa un rango de precio. La cantidad depende también de cuántas propuestas hubo en ese rango. ' : ''}Asociación observada; no es una estimación de elasticidad.</p>
      <div className="price-table-wrap"><table className="price-table"><caption>Datos detrás del gráfico · {currency} · listas exactas por rango</caption><thead><tr><th>{metricLabel}{metric === 'mrr' ? ' / mes' : ' · pago único'}</th><th>Propuestas cerradas</th><th>Ganados (Q)</th><th>Conversión</th><th>{metric === 'mrr' ? 'Setup/OTF mediano' : 'MRR mediano'}</th><th>Muestra</th></tr></thead><tbody>{chartData.map(band => <tr key={band.key}>
        <th>{currency} {band.label}</th><td><button disabled={!band.count} onClick={() => show(`Propuestas · ${currency} ${band.label}${unit}`, band.rows)}>{band.count}</button></td>
        <td><button disabled={!band.won} onClick={() => show(`Ganados · ${currency} ${band.label}${unit}`, band.wonRows)}>{band.won}</button></td>
        <td>{band.rate === null ? '—' : `${number(band.rate)}%`}</td><td>{money(metric === 'mrr' ? band.setupMedian : band.monthlyMedian, currency)}<small>{metric === 'mrr' ? band.setupKnown : band.rows.filter(row => row.monthly !== null).length}/{band.count} con dato</small></td>
        <td>{!band.count ? 'Sin propuestas' : band.count < 30 ? 'Pequeña · n < 30' : `n = ${band.count}`}</td>
      </tr>)}</tbody></table></div>
    </> : <div className="price-state">No hay propuestas cerradas con {metric === 'mrr' ? 'MRR positivo' : 'setup/OTF registrado (incluido cero)'} y moneda verificada para estos filtros. Prueba otro período o paquete.</div>}
    <details className="price-coverage"><summary>Cobertura y exclusiones · {excludedCount} fuera del gráfico · {setupMissing} sin setup/OTF · {cohortMissing} sin relación verificada</summary>
      <p>Los filtros principales de comercial, rol y tipo se mantienen. Este bloque usa su propio período por cierre y excluye propuestas abiertas.</p>
      {Object.entries(result.excluded).map(([reason, selected]) => <button key={reason} onClick={() => show(reason, selected)}>{reason}: {selected.length} · ver negocios</button>)}
      {setupMissing > 0 && <button onClick={() => show('Sin setup/OTF registrado', result.eligible.filter(row => row.setup === null))}>Sin setup/OTF: {setupMissing} · se incluyen en conversión, se excluyen de la mediana</button>}
      {cohortMissing > 0 && <button onClick={() => show('Relación con empresa sin verificar', result.eligible.filter(row => row.cohort === 'unknown'))}>Relación sin verificar: {cohortMissing} · no se asume adquisición</button>}
      {result.undated.length > 0 && <button onClick={() => show('Sin fecha de cierre válida · fuera de la ventana', result.undated)}>Sin fecha de cierre válida: {result.undated.length} · no asignables a un período</button>}
      <p>Filtra paquete, plan, modelo y volumen para acercarte a ofertas comparables. La muestra completa puede mezclar alcances distintos; no se ajusta por descuentos ni por cambios de precio históricos.</p>
    </details>
    <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}>
      <DialogContent className="price-deal-dialog"><DialogHeader><DialogTitle>{selected?.title}</DialogTitle>
        <DialogDescription>{selected?.rows.length ?? 0} negocios · {props.ownerName} · {period === 'rolling' ? 'Últimos 12 meses' : props.rangeLabel} · valores actuales registrados en HubSpot</DialogDescription></DialogHeader>
        <div className="price-detail-scroll">
        <div className="price-distributions">{(['industry', 'companySize'] as const).map(field => <section key={field}><h4>{field === 'industry' ? 'Industria Adereso' : 'Tamaño de empresa'}</h4><p>Distribución por número de deals · {selected?.rows.length ?? 0} negocios</p>
          {priceDistribution(selected?.rows ?? [], field).map(group => <button key={group.label} aria-pressed={facet?.field === field && facet.label === group.label} onClick={() => setFacet(current => current?.field === field && current.label === group.label ? null : { field, label: group.label })}>
            <span>{group.label}</span><strong>{group.count} · {number(group.share)}%</strong><span className="price-distribution-track"><span style={{ width: `${group.share}%` }} /></span>
          </button>)}
        </section>)}</div>
        {facet && <div className="price-detail-selection"><span>{facet.label} · {detailRows.length} negocios</span><Button variant="ghost" onClick={() => setFacet(null)}>Ver todos los negocios del rango</Button></div>}
        <div className="price-deal-table"><table className="price-table"><thead><tr><th>Negocio</th><th>Tipo</th><th>Industria Adereso</th><th>Tamaño empresa</th><th>País / fuente</th><th>Comercial</th><th>Cierre</th><th>Resultado</th><th>MRR</th><th>Setup/OTF</th><th>Paquete / plan / volumen</th></tr></thead><tbody>{detailRows.map(row => <tr key={row.deal.id}>
          <th><a href={row.deal.url} target="_blank" rel="noreferrer">{row.deal.name} ↗</a></th><td>{priceTypeLabel(row)}</td><td>{row.industry || 'Sin dato registrado'}</td><td>{row.companySize || 'Sin dato registrado'}</td><td>{row.deal.country || 'Sin país'}<small>{row.deal.source || 'Sin fuente'}</small></td><td>{row.deal.owner}</td><td>{new Date(row.deal.closeDateValue).toLocaleDateString('es-CL', { timeZone: 'UTC' })}</td>
          <td>{row.won ? 'Ganado' : 'Perdido'}<small>{row.deal.stageFull}</small></td><td>{money(row.monthly, row.currency || 'Moneda sin verificar')}</td><td>{money(row.setup, row.currency || 'Moneda sin verificar')}</td>
          <td>{valueLabel(row.product) || 'Sin paquete'}<small>{row.plan || 'Sin plan'} · {row.pricingModel || 'Sin modelo'} · {row.volume === null ? 'Sin volumen' : `${number(row.volume)} conv.`}</small></td>
        </tr>)}</tbody></table></div></div>
      </DialogContent>
    </Dialog>
  </div>;
}
