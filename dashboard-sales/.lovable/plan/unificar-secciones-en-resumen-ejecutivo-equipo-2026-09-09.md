# Unificar secciones en "Resumen ejecutivo equipo"

## Objetivo
Reemplazar 5 secciones separadas (Riesgo de cumplimiento, Cumplimiento de cuota, Corte histórico, Por comercial, WR por segmento) por una sola sección "Resumen ejecutivo equipo" con tarjetas resumen + una tabla unificada por comercial. Todo respeta los filtros principales (año, Q, comercial) e incluye tendencias sutiles (sparklines).

## Secciones a eliminar (se fusionan en una)
1. **Riesgo de cumplimiento · Q en curso** (líneas ~599-710): cards Cuota/Ganado/Falta/Cobertura + tabla por comercial.
2. **Cumplimiento de cuota** (líneas ~974-1150): tabla Estado/MRR/Deals/WR/Cuota/OTF/Falta/Cumplimiento/Forecast/Simular.
3. **Corte histórico** (líneas ~1155-1257): cards Ganado/Perdido/WR/Ticket + tabla por comercial.
4. **Por comercial** (líneas ~1259-1325): tabla Pipeline/Deals/Pond Q/%cierre/Score/stages/higiene/WR.
5. **WR por segmento** (líneas ~1327-1349): tabla Segmento/WR QTD/QoQ/Hist.

## Cambios server-side

### `src/lib/pulse-types.ts`
- Extender `QuotaRow` con WR por segmento por comercial:
  ```ts
  wrBySegment: {
    inbound?: { won: number; lost: number };
    outbound?: { won: number; lost: number };
    upsell?: { won: number; lost: number };
    crossSell?: { won: number; lost: number };
  };
  ```
- Extender `OwnerRow` con `lostAmount` y `avgTicketWon` para la tabla unificada.

### `src/lib/pulse.server.ts`
- Para cada owner, calcular WR por segmento usando `segmentOf()` sobre sus `closedDeals` del periodo actual (QTD) y histórico.
- AEs (Holly `82596016`, Gonza `331766554`, Gio `373167468`): poblar `inbound` y `outbound`.
- No-AEs (Felipe `93662868`, Naty `91603512`): poblar `upsell` y `crossSell`.
- Añadir `lostAmount` y `avgTicketWon` a `ownerRows`.
- Definir `AE_OWNERS = new Set(["82596016", "331766554", "373167468"])`.

## Cambios frontend (`src/components/pulse/PulseDashboard.tsx`)

### Tarjetas resumen (team-level, filtradas por año/Q/comercial)
Combinar lo único de Riesgo + Corte histórico en ~6-8 cards:
1. Cuota Q
2. Ganado Q (% cuota, barra de progreso, sparkline 6m si team)
3. Perdido (monto + count)
4. Falta para cuota
5. Cobertura del gap (semáforo)
6. WR (QTD + QoQ)
7. Ticket promedio ganado
8. Pipeline abierto (sparkline 6m)

### Tabla unificada por comercial
Una sola tabla con `table-wrap` (scroll horizontal). Columnas:

| Comercial | Estado | Cuota Q | MRR ganado Q | Deals ganados | Perdidos | Monto perdido | WR QTD+QoQ | WR Hist | WR Inb/Up | WR Out/Cross | OTF Q +bonus | MRR c/OTF | Falta | Cumplimiento | Forecast Q | Pipeline | Deals abiertos | Pond Q | %cierre | Adobo | 7d | Mes | Venc | Sin fecha | Sin prox | 14+d | ↗Sim |

- WR Inb/Out para AEs (Holly, Gonza, Gio); WR Upsell/Cross para Felipe y Naty — la columna cambia de header según el comercial.
- Sparklines sutiles en WR QTD (mini trend) y Pipeline.
- Todas las celdas con valor > 0 son clickeables (drilldown existente).
- Botón ↗ Simular en la última columna (navega al simulador prefiltrado).
- Semáforo de color consistente (ok/warn/bad/neutral).
- Etapa por etapa (stages) se omite de la tabla; queda accesible via drilldown de Pipeline.

### Limpieza
- Eliminar los 5 bloques de sección antiguos.
- Reemplazar por un solo `<SectionTitle>Resumen ejecutivo equipo</SectionTitle>` + cards + tabla.
- Conservar la leyenda de semáforo (tone-legend).

## Verificación
- `bunx tsgo --noEmit`
- Playwright: cargar el tab Pipeline Comercial, confirmar que aparece "Resumen ejecutivo equipo" con cards + tabla unificada, scroll horizontal funcional, drilldowns abren modales, filtros de año/Q/comercial afectan la tabla, sparklines visibles.
- Confirmar que las 5 secciones antiguas ya no existen.
