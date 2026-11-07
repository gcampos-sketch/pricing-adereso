# Botón "Fix" en las tarjetas de seguimiento

Un botón discreto **Fix** en la esquina de las tarjetas de seguimiento. Al hacer clic abre un panel donde la IA propone, para cada deal de esa tarjeta, qué hay que resolver y un borrador de tarea corto. Tú revisas, editas y apruebas; al aprobar, las tareas se crean en HubSpot asignadas al comercial dueño de cada deal.

Sobre "el Codex de cada usuario": no existen cuentas de Codex individuales que se puedan levantar desde la app. El trabajo lo genera la IA del propio dashboard con los datos reales de HubSpot, y queda repartido por dueño: cada tarea nace asignada al comercial del deal, así cada uno ve su propio trabajo en HubSpot.

## Dónde va el botón

Dentro del popup que abre la tarjeta (el listado de deals), junto a "Copiar todo", pequeño, con ícono de rayo y estilo liquid glass del dashboard. El botón **Fix** aparece solo en los popups de estas 4 tarjetas:

- Sin próxima actividad
- Con tareas vencidas
- Deals en pinzas (Seguimiento con pinzas)
- On Track · No (requieren seguimiento)

Hoy la tarjeta `Metric` es un solo botón, así que no se puede anidar otro dentro; además, en el popup el usuario ya vio la lista antes de generar, y el mismo botón cubre una sola vez el problema de cada tarjeta. El popup y el Fix respetan los filtros activos (año, trimestre, comercial, etapa).

## El panel "Fix — [nombre de la tarjeta]"

- Se abre encima del popup, con el nombre de la tarjeta y cuántos deals trae.
- Mientras la IA trabaja: barra de progreso y las filas apareciendo a medida que se resuelven.
- Una fila por deal, agrupadas por comercial, con: nombre del deal (link a HubSpot), monto, etapa, dueño, y el problema detectado (sin próxima actividad / tarea vencida hace X días / marcado por Adobo / on track = No).
- Por deal, generado por la IA con el contexto real (etapa, monto, última reunión analizada por Adobo, próximo paso declarado, días estancado):
  - **Instrucción**: una frase accionable de qué hay que resolver.
  - **Borrador de tarea**: título corto, 2-3 líneas de descripción, fecha propuesta y tipo (llamada, correo o reunión). Tono directo y breve.
- Todo editable en línea antes de aprobar; casilla por fila para incluir o excluir.
- Si a un deal le faltan datos para proponer algo con fundamento, la fila lo dice ("faltan datos: sin próximo paso ni reuniones analizadas") y no se inventa nada.
- Botones: **Copiar** por deal (instrucción + borrador), **Copiar todo**, y **Aprobar y crear tareas** para las filas marcadas.

## Al aprobar

Se crean las tareas en HubSpot (una por deal, asociada al deal y asignada a su dueño) con el título, descripción, fecha y tipo del borrador. El panel muestra fila por fila si quedó creada o falló, con el motivo. Nada se envía antes de que aprietes ese botón: la IA solo propone.

## Detalles técnicos

- `src/lib/fix.server.ts`: recibe los deals de un drilldown y genera instrucción + borrador con Lovable AI (`openai/gpt-6-astra`, Responses API, streaming consumido en el servidor, salida estructurada estricta). Plantilla fija de prompt: `Deal: {nombre} · Etapa: {etapa} · Monto: {monto} · Problema: {problema}` + contexto Adobo; la IA devuelve `{ instruction, task: { subject, body, dueDate, type } }` o `{ insufficientData: true, reason }`. La clave (`LOVABLE_API_KEY`) vive solo en el servidor; nada de claves en el código.
- `src/lib/pulse.functions.ts`: nuevo `generateFixDraftsFn` (server function, entrada validada con zod, lotes de ~8 deals para respetar el rate limit) y `createFixTasksFn` que reutiliza `createDealTask` de `src/lib/tasks.server.ts`, extendida para aceptar `hubspot_owner_id` y `hs_task_type`.
- `src/lib/pulse-types.ts`: `DealDTO` gana `ownerId` (hoy solo trae el nombre) para poder asignar la tarea; `src/lib/pulse.server.ts` lo puebla desde `hubspot_owner_id`.
- `src/components/pulse/FixPanel.tsx`: panel nuevo, mismo patrón de modal/overlay que `DealModal` (por encima de tabs y filtros), estado local de borradores editables y aprobados persistido en `localStorage` por clave de tarjeta.
- `DealModal.tsx` recibe una prop `fix?: { problem: string }`; cuando existe, muestra el botón Fix en la cabecera del popup junto a "Copiar todo". `PulseDashboard.tsx` la pasa según la clave del modal (`taskData.noActivityModal`, `taskData.overdueTaskModal`, `track.allModal`, `track.onTrackNoModal`). `Metric` no cambia.
- Estilos nuevos en `src/styles.css` (`.fix-panel*` y el botón Fix), tokens existentes de modo oscuro.

## Orden de trabajo

1. Flujo completo en "Sin próxima actividad": botón Fix dentro del popup, panel, generación, aprobación y creación en HubSpot.
2. Replicar el botón en los popups de "Con tareas vencidas", "Deals en pinzas" y "On Track · No", cada uno con su descripción de problema.
