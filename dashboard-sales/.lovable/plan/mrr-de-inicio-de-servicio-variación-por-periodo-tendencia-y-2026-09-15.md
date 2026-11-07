# MRR de inicio de servicio: variación por periodo, tendencia y detalle

## Qué cambia en pantalla

El cuadrito de MRR (junto a los filtros) pasa a mostrar, aprovechando mejor el espacio:

- Monto total de MRR activo (deals en "Servicio iniciado") y cantidad de deals.
- **Variación según el filtro activo**: si está filtrado por trimestre, muestra el MRR ganado en ese Q vs. el Q anterior; si está en "todo el año", compara año contra año anterior. El signo y color (verde/rojo) reflejan la dirección.
- **Tendencia** visible: mini gráfico de la serie del periodo correspondiente (Q a Q cuando el filtro es trimestral, mes a mes cuando es anual), con puntos que muestran periodo y monto al pasar el mouse.
- **Chip con la fecha del último inicio de servicio registrado** (y el nombre del deal en el tooltip).

Al hacer click en el cuadrito se abre un panel con el detalle gráfico:

- Gráfico de barras/línea de MRR incorporado por periodo, con selector de granularidad: **Año · Trimestre · Mes · Semana**.
- Cada periodo muestra monto incorporado, cantidad de deals y variación vs. el periodo anterior.
- Debajo, la lista de deals que iniciaron servicio en el periodo seleccionado (fecha, deal, comercial, MRR), ordenable, con el mismo estilo de los popups actuales.

## Detalle técnico

- `src/lib/pulse.server.ts`: extender el bloque `activeMrr` para devolver, además del total y el historial diario, la lista de **entradas a servicio** (`dealId`, nombre, `ownerId`, fecha de `hs_v2_date_entered_173990327`, MRR). Esto permite construir series reales por año/Q/mes/semana en cliente sin nuevas llamadas a HubSpot.
- `src/lib/pulse-types.ts`: ampliar el tipo `activeMrr` con `entries[]` y `lastStart`.
- `src/contexts/RefreshContext.tsx`: el objeto `activeMrr` que viaja al header incluye las entradas y la fecha del último inicio.
- `src/components/pulse/PulseDashboard.tsx`: calcular la variación dependiente del filtro (QoQ cuando hay trimestre, YoY cuando es año completo) y la serie de tendencia, y pasarlos a la barra de filtros. El total sigue siendo global (no filtrado).
- `src/components/pulse/FilterBar.tsx`: rediseñar `ActiveMrrCard` en dos columnas (monto + meta a la izquierda, sparkline y variación a la derecha), añadir el chip de última fecha y hacerla clickeable (`button`) para abrir el detalle.
- Nuevo `src/components/pulse/ActiveMrrDetail.tsx`: panel/modal con selector de granularidad, gráfico de barras con hover, variación por periodo y tabla de deals del periodo.
- `src/styles.css`: estilos del cuadrito reorganizado, chip de fecha y del panel de detalle (mismo lenguaje liquid glass y semáforo de colores ya usado).

## Notas

- La agrupación por semana usa semanas ISO (lunes a domingo).
- Las series se construyen desde las fechas reales de entrada a servicio; el churn pasado (deals que ya salieron de servicio) no es reconstruible retroactivamente, así que el histórico de churn se sigue acumulando desde ahora vía snapshots.
