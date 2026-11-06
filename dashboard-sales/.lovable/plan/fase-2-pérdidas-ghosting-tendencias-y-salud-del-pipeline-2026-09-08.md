# Fase 2: pérdidas, ghosting, tendencias y salud del pipeline

Ya está en preview la primera parte (panel "Proyectos ganados en curso", estado de contratos, cobros setup/MRR, país en el popup y corrección de firmados sin 6.2). Esta fase cubre lo que falta de tu lista.

## 1. Deals perdidos

- **Ghosting con alertas**: apartado dentro del tab de pérdidas con los deals perdidos por motivo "ghosting". Para cada uno se revisan las actividades de HubSpot del propietario del deal (emails, llamadas, WhatsApp registradas como actividades). Alerta amarilla/roja si no cumple el mínimo: 2 correos + 2 llamadas + 2 WhatsApp. Drilldown con el detalle por deal (cuántas de cada tipo tuvo).
- **Motivos agrupados**: motivos de pérdida ordenados de mayor a menor monto asociado (hoy es por cantidad), con drilldown. Respeta los filtros principales de año/Q/comercial.
- **MRR perdido por objeción**: monto perdido agrupado por `adobo_current_objecion` (precio, timing, integración, competidor, etc.) con recomendaciones cortas de mejora por cada objeción frecuente.
- **Inbound vs outbound en resumen de pérdidas**: comparativa usando fuente de creación — inbound = forms de contacto inbound (Adereso/Cassper); outbound = prospección SDR (Adereso/Cassper). Cantidad, monto y win rate por lado.
- **Score alto perdidos**: deals perdidos con Adobo score sobre 60, mostrando desde qué etapa del pipeline se perdieron (siendo deal activo), con drilldown.
- **Simulador**: agregar columna/chip con % de cierre antes del Adobo score en la lista de deals del simulador.

## 2. On track y actividad

- **Corrección on track**: contar solo deals activos con la etiqueta puesta, y mostrar el total de activos como denominador para que calce.
- **Reuniones por comercial**: verificar si ya existe el conteo de reuniones recibidas por comercial; si no, agregarlo.

## 3. Tendencias y salud

- **Mini tendencia en cada métrica**: sparkline sutil de los últimos 6 meses (incluye arrastre de meses fuera del Q filtrado) en las métricas principales de Pipeline Comercial.
- **Chip de tendencia en Adobo scoring**: mini línea de tendencia del promedio de score.
- **Tooltip de Adobo scoring**: al pasar el mouse, explicar cómo se compone el score.
- **Gráfico de tendencia de pipeline por comercial**: evolución mensual del pipeline abierto, con filtro por todos o por cada comercial.
- **Contactabilidad**: usar `adobo_tasa_contactabilidad_prospecto` en la sección de salud del pipeline (promedio por equipo/comercial, con drilldown).

## 4. Verificación

- Typecheck (`bunx tsgo --noEmit`) y revisión del preview al terminar.
- No se publica a producción; queda en preview.

## Detalles técnicos

- Actividades de HubSpot vía engagements API (emails/calls) filtradas por deal y owner; WhatsApp se detecta por tipo/canal de actividad registrada en HubSpot.
- Las tendencias usan los timestamps ya disponibles (creado, ganado, fecha de cierre) agrupados por mes; no requieren nuevas llamadas pesadas.
- Todo respeta los filtros principales de año, Q y comercial.
