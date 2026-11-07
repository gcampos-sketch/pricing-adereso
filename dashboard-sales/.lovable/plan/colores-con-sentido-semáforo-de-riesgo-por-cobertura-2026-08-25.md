# Colores con sentido: semáforo de riesgo por cobertura

Hoy los colores no significan nada: el borde superior de cada tarjeta rota entre ámbar, azul, verde y amarillo por posición (`metric-accent-1..4`), no por salud del dato. Lo único ya semántico es el estado de la tabla de cuota (`Forecast OK / Revisar / En riesgo`, calculado con forecast vs cuota) y los chips de % cierre y Adobo.

## Qué cambia

1. **Semáforo único en toda la app**
   - Verde = sano, ámbar = atención, rojo = riesgo, gris/neutro = informativo (sin juicio).
   - Cada tarjeta recibe un tono calculado desde su propio umbral, no desde su posición. Las tarjetas puramente descriptivas (pipeline abierto, nº de deals, ponderado) quedan neutras para que el color solo aparezca cuando dice algo.
   - Leyenda corta arriba del tablero: "verde cumple / ámbar atención / rojo riesgo".

2. **Riesgo por cobertura de pipeline (lo que pediste)**
   - Nueva métrica **Cobertura** = pipeline abierto del trimestre ponderado ÷ gap que falta para la cuota.
   - Umbral basado en el mínimo necesario para cumplir: cobertura ≥ 3x verde, 1.5x–3x ámbar, < 1.5x rojo. Si ya se cumplió la cuota, verde automático.
   - Se calcula **por comercial** y **para el equipo** (suma de cuotas y de pipeline).
   - Nueva sección **Riesgo de cumplimiento** con 4 tarjetas de equipo (cuota, ganado, gap, cobertura) y una tabla por comercial: cuota, ganado Q, gap, pipeline Q ponderado, cobertura, y semáforo de riesgo con motivo ("cobertura 0.8x del gap", "sin pipeline en etapas altas", "cumplida").
   - La columna Estado de la tabla de cuota pasa a considerar cobertura además de forecast, para que ambos números cuenten la misma historia.

3. **Colores semánticos en las secciones existentes**
   - Calidad del forecast: rojo cuando el % de deals de baja probabilidad o sin próxima actividad supera el umbral; verde cuando está bajo control.
   - Seguimiento con pinzas: rojo si el % del pipeline en pinzas es alto, ámbar medio, verde bajo.
   - Cierre del mes: higiene de fechas ya tiene semáforo; se extiende a "cierre vencido" y "sin fecha" (cualquier valor > 0 es ámbar, sobre 10% del pipeline es rojo).
   - Cumplimiento de cuota: la barra de avance se colorea con el mismo semáforo en vez de siempre ámbar.

## Otras mejoras de orden de la información

- **Reordenar el tablero por urgencia**: Resumen → Riesgo de cumplimiento → Cierre del mes e higiene → Seguimiento con pinzas → Calidad del forecast → Cuotas → Histórico → Alertas. Hoy lo accionable queda abajo.
- **Barra de resumen de riesgo** bajo el header: nº de comerciales en rojo / ámbar / verde, clicable para saltar a la sección.
- **Ordenar la tabla por comercial por riesgo** (peor primero) en vez de por monto.
- **Índice de secciones fijo** (chips que hacen scroll) para navegar el tablero largo.

## Detalles técnicos

- `src/lib/pulse.server.ts`: nuevo cálculo `coverage`, `riskLevel`, `riskReason` por owner y equipo, incorporado en `quotaRows` y en un nuevo bloque `risk` del reporte. Umbrales en constantes exportadas para un solo punto de verdad.
- `src/lib/pulse-types.ts`: `Tone = "ok" | "warn" | "bad" | "neutral"`, campos `coverage`, `risk`, `riskReason` en `QuotaRow`, y tipo `RiskSummary`.
- `src/components/pulse/PulseDashboard.tsx`: `Metric` cambia `accent` por `tone` opcional (manteniendo neutro por defecto), nueva sección de riesgo, reordenamiento de secciones, leyenda y barra de resumen.
- `src/styles.css`: variantes `.metric[data-tone=...]` con borde y halo por tono, `.progress[data-tone]`, y estilos de leyenda/índice. Todo con tokens existentes (`--success`, `--warning`, `--danger`, `--info`).
- Sin llamadas nuevas a HubSpot: todo se deriva de datos ya cargados.
