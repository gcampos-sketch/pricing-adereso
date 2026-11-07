# Higiene de fecha de cierre (mes en curso)

Sí, el dato existe: cada deal abierto ya trae su `closedate` en vivo desde HubSpot. Hoy sólo se muestra como conteo "Mes" en la tabla por comercial, y en realidad son "próximos 30 días" (ventana móvil), no el mes calendario en curso.

## Qué se agrega

Nueva sección **Cierre del mes e higiene de fechas**, justo debajo de "Seguimiento con pinzas", con el mismo patrón de la app: pestañas Equipo / por comercial, tarjetas clicables y drilldown en el popup de deals.

Tarjetas (para el scope elegido):
- **Cierran este mes** — monto abierto con `closedate` dentro del mes calendario en curso + nº de deals.
- **Ponderado del mes** — monto x probabilidad de etapa, para ver cuánto es realista.
- **Cierre vencido** — deals abiertos con fecha ya pasada (higiene mala).
- **Sin fecha de cierre** — deals abiertos sin `closedate`.

Debajo, tabla de los deals que cierran el mes en curso, ordenada por fecha de cierre ascendente: deal, comercial, etapa, monto, fecha de cierre, días restantes, % cierre, Adobo, link a HubSpot. Fila marcada cuando la fecha cae en los próximos 7 días.

Y un indicador de higiene: % del pipeline abierto con fecha de cierre válida y no vencida (semáforo verde/ámbar/rojo).

## Detalles técnicos

- `src/lib/pulse.server.ts`: nueva agregación `buildCloseHygiene` sobre los deals abiertos ya cargados (sin llamadas extra a HubSpot). Ventana = primer al último día del mes actual. Drilldowns nuevos: `close-month`, `close-overdue`, `close-no-date` para equipo y por owner (`owner-{id}-close-month`, etc.).
- `src/lib/pulse-types.ts`: tipo `CloseHygieneScope` (id, label, cards, deals, healthPct) y campo `closeHygiene: CloseHygieneScope[]` en `PulseReport`.
- `src/components/pulse/PulseDashboard.tsx`: sección nueva con estado `closeScope`, reutilizando `Metric`, `pulse-table` y `DealModal` existentes.
- Se mantiene la columna "Mes" actual de la tabla por comercial, pero pasa a significar el mes calendario en curso para que ambos números coincidan.
