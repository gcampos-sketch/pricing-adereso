# Seguimiento con pinzas desde HubSpot (no más heurística)

Hoy la sección "Seguimiento con pinzas" inventa las señales en el código (14+ días sin movimiento, sin próxima actividad, etc.). Tú ya tienes la verdad en HubSpot: la propiedad de deal **Seguimiento con pinzas** (`seguimiento_con_pinzas`, booleano, marcada por Adobo). Verificado en vivo: existe y hoy hay **18 deals marcados** en el portal.

El plan: la lista de pinzas pasa a ser exactamente los deals marcados en HubSpot, y la sección se simplifica visualmente para mostrar esa lista.

## Qué cambia en pantalla

- La sección deja de mostrar las 9 tarjetas de señales heurísticas.
- Arriba: 4 cápsulas — Deals en pinzas (conteo), Monto en pinzas, % del pipeline abierto, Adobo promedio de esos deals.
- Debajo: una sola lista/tabla con los deals marcados, ordenada por monto: deal, comercial, etapa, monto, fecha de cierre, % cierre, Adobo scoring y botón "Abrir deal" en HubSpot.
- Se mantiene el selector General / por comercial (filtra la misma lista por dueño) y el click en cada cápsula abre el popup de deals con las columnas ya existentes (incluye Adobo y % cierre).
- Si un comercial no tiene deals marcados: estado vacío limpio.
- Layout revisado en móvil (390px), que es donde estás viendo el tablero.

## Frescura de datos

- El auto-refresh baja de 60s a 20s, con el indicador "Actualizado hace Xs" en vivo.
- La marca de pinzas se lee en cada refresco directo desde HubSpot, así que si Adobo marca o desmarca un deal se refleja en el siguiente ciclo.

## Detalle técnico

- `src/lib/pulse.server.ts`: agregar `seguimiento_con_pinzas` a `DEAL_PROPS`; reemplazar `trackingSignals` / `buildTracking` por una construcción basada en el flag (`properties.seguimiento_con_pinzas === "true"`) sobre los deals abiertos E1–E5.1, por equipo y por comercial. Se conservan los drilldowns (`*-track-all`) y se elimina la generación de drilldowns por señal.
- `src/lib/pulse-types.ts`: `TrackingScope` pierde `signals`/`hygiene`/`healthyCount` y expone `deals: DealDTO[]` más los agregados de las 4 cápsulas.
- `src/components/pulse/PulseDashboard.tsx`: reescribir el bloque de seguimiento (cápsulas + tabla), quitar `track-grid` y `track.focus`.
- `src/routes/index.tsx`: `refetchInterval` a 20s.
- `src/styles.css`: ajustar estilos de las tarjetas de seguimiento a la nueva tabla y su comportamiento responsive.
- Las señales heurísticas siguen disponibles en la tabla "Por comercial" (7d, Venc., Sin fecha, Sin prox., 14+d), así que no se pierde esa información.
