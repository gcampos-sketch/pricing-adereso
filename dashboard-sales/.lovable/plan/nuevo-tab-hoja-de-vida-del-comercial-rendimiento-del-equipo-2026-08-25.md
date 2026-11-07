# Nuevo tab: Hoja de vida del comercial (Rendimiento del equipo)

Tercer tab junto a "Pipeline Comercial" y "Negocios de Partners": **Rendimiento del Equipo**, con resumen ejecutivo por comercial (semáforo por score) y ficha detallada al seleccionar a uno. Filtro por año y por trimestre dentro del año, más vista "General" (equipo) o por comercial (Holly, Gio, Felipe, Naty, Gonza).

## Qué se verá

**1. Resumen ejecutivo (vista general)**
- Una tarjeta por comercial, ordenada por score (peor primero, que es lo accionable): score 0-100 con color de semáforo, cumplimiento de cuota del periodo, win rate, cobertura, on-track % y antigüedad estimada.
- Barra de distribución: cuántos comerciales en verde / ámbar / rojo.
- Métricas de equipo arriba: cuota total, ganado, cumplimiento, win rate, reuniones, deals perdidos.

**2. Ficha detallada (al hacer clic en un comercial)**
Bloques, todos con tooltip ⓘ y clic para abrir el modal de deals ya existente:
- **Cumplimiento de cuota**: cuota vs ganado del periodo, barra de avance, y evolución por Q (mini-barras) y por año.
- **Pronóstico**: forecast ponderado del Q, gap, cobertura del gap, y semáforo de riesgo (misma lógica que ya usamos).
- **Gestión / cobertura on-track**: % del pipeline abierto marcado `on-track` en HubSpot (monto y nº de deals), % con seguimiento con pinzas, % sin próxima actividad, % con fecha de cierre vencida.
- **Tiempo por etapa**: días promedio en cada etapa del pipeline comercial (E1→E5.1) y días en la etapa actual de sus deals abiertos, con comparación contra el promedio del equipo.
- **Cierres**: nº y monto de cierres ganados por mes, por Q y por año, con evolución.
- **Win rate**: acumulado histórico y del Q, más evolución trimestral (mini-línea).
- **Deals en riesgo ("warning")**: deals abiertos con `on_track = No` y/o seguimiento con pinzas, con evolución trimestral del volumen.
- **Reuniones**: nº de reuniones del periodo por comercial y evolución por Q (desde el objeto de reuniones de HubSpot).
- **Deals perdidos**: nº, monto y principales motivos de pérdida.
- **Antigüedad**: años/meses estimados desde su primer deal creado en HubSpot (proxy), con nota de que es estimación.

**3. Score del comercial (0-100)**
Pesos propuestos (ajustables en un solo lugar del código):
- 35% cumplimiento de cuota del periodo
- 20% win rate (mezcla Q e histórico)
- 25% gestión/higiene: cobertura on-track, pinzas, fechas de cierre sanas, próxima actividad
- 10% velocidad: tiempo por etapa vs promedio del equipo
- 10% actividad: reuniones vs mediana del equipo

Color: ≥75 verde, 50-74 ámbar, <50 rojo. Cada componente se muestra desglosado con su aporte para que el score sea auditable, no una caja negra.

## Lo que HubSpot sí y no tiene (verificado)

- Sí: `on_track` (Sí/No), `seguimiento_con_pinzas`, `adobo_closing_score`, probabilidad, motivo de pérdida, cuotas por comercial y trimestre (hasta 2023), reuniones por propietario (2.780 registros para los 5 comerciales), y tiempo acumulado por etapa (`hs_v2_cumulative_time_in_<etapa>` + entrada a la etapa actual).
- No existe: campo de fecha de incorporación del comercial en HubSpot (ni en propietarios, ni en usuarios). Por eso usamos como proxy la fecha de su primer deal creado; si más adelante me das las fechas reales, las dejo fijas y el dato pasa a ser exacto.
- No existe un campo "warning" propio: los deals warning se derivan de `on_track = No` + pinzas.

## Extras que hay disponibles y vale la pena mirar

- **Resultado de la reunión** (`hs_meeting_outcome`): reuniones completadas vs no-show vs canceladas — buen indicador de calidad de agenda por comercial.
- **Reuniones agendadas por deal** (`hs_number_of_scheduled_meetings`) y próxima reunión: detecta deals abiertos sin ninguna reunión agendada.
- **Adobo closing score promedio** por comercial como termómetro de calidad del pipeline.
- **Deals estancados**: días en la etapa actual sobre el umbral del equipo.
- **Histórico de cuotas hasta 2023** si quieres evolución anual más larga (hoy el reporte parte en 2025; lo dejamos en 2025 según lo acordado, ampliable).

## Detalles técnicos

- `src/lib/team.server.ts` (nuevo): capa de datos del tab. Reutiliza `gateway`, `headers`, la cola de rate-limit, `NICKNAMES`, `WON_STAGES`/`LOST_STAGES` y `assessRisk` ya exportados en `src/lib/pulse.server.ts`. Trae deals con `hs_v2_cumulative_time_in_*` de las etapas gestionadas + `hs_v2_time_in_current_stage` + `on_track`, reuniones vía `/crm/v3/objects/meetings/search` por `hubspot_owner_id`, y cuotas vía `goal_targets` por año/Q.
- `src/lib/team-types.ts` (nuevo): `TeamReport`, `RepCard`, `RepDetail`, `ScoreBreakdown`, con reutilización de `DealDTO`/`Tone`.
- `src/lib/pulse.functions.ts`: nueva server function `getTeamReport({ year, quarter })`, con validación de entrada.
- `src/components/pulse/TeamDashboard.tsx` (nuevo): resumen ejecutivo + ficha, reutilizando `Metric` (tone, progress, tooltip), `MiniBars`, `MiniLine` y `DealModal`.
- `src/routes/index.tsx`: tercer tab y query con `refetchInterval` de 20 s, `enabled` sólo cuando el tab está activo.
- `src/styles.css`: estilos de tarjetas de score, medidor de score y grilla de la ficha, usando los tokens semánticos existentes.
- Sin cambios en la lógica de los tabs actuales.
