# Pulir el cuadro de MRR en servicio

## Por qué no cuadraba

Son dos métricas distintas con nombres parecidos:

- **Ganado Q3-26 ($16,982)**: deals cerrados en el trimestre (fecha de cierre), en cualquier etapa ganada, sumando el monto del deal.
- **"$24,352 en Q3 26"**: deals que hoy están en Inicio de servicio y entraron a esa etapa dentro del trimestre, sumando el campo MRR de HubSpot (y el monto solo si el MRR está vacío).

Nunca van a coincidir, y así etiquetados se leen como si debieran.

## Cómo queda el cuadro

- **Monto principal**: todo el MRR acumulado que hoy está en Inicio de servicio, sin filtros, usando el **monto del deal** como única fuente (se deja de usar el campo MRR y su relleno mixto).
- **Se excluyen los clientes con churn**: si la empresa asociada al deal tiene tipo de cliente = churn, ese deal no suma ni en el total ni en la tendencia.
- **Chip del trimestre**: pasa a mostrar lo que se **incorporó a servicio en el último trimestre** y su variación contra el trimestre anterior (QoQ), con texto explícito ("arrancó servicio en Q3-26") para que no se confunda con lo ganado.
- El detalle al hacer clic mantiene granularidad Año · Trimestre · Mes · Semana, ya sin deals de clientes en churn.
- Los deals en $0 se mantienen visibles: son desarrollos y renovaciones sin MRR recurrente.

## Detalle técnico

- `src/lib/hubspot.server.ts`: nuevo lector de empresas — asociación `deals → companies` por lotes y lectura por lotes de la propiedad de tipo de cliente (se resuelve su nombre interno consultando las propiedades de company; se cachea con el TTL lento).
- `src/lib/pulse.server.ts`: `mrrOf` usa solo `amount`; `liveDeals` filtra los deals cuya empresa asociada está en churn; `activeMrrValue`, `activeMrrHistory` y `activeMrrEntries` se recalculan sobre ese conjunto limpio. Se agrega al payload el conteo de deals excluidos por churn.
- `src/lib/pulse-types.ts` y `src/contexts/RefreshContext.tsx`: el bloque `activeMrr` incorpora el resumen de churn excluido.
- `src/components/pulse/FilterBar.tsx`: el chip del cuadro deja de depender del filtro de año/trimestre y muestra siempre el último trimestre cerrado con su variación QoQ, con etiqueta explícita.
- `src/components/pulse/ActiveMrrDetail.tsx`: encabezado con la aclaración de la métrica y el aviso de deals excluidos por churn.

## Nota

La serie histórica se sigue construyendo desde las fechas reales de entrada a Inicio de servicio más los snapshots diarios; el churn anterior a esta implementación queda excluido del total actual, no reconstruido hacia atrás.
