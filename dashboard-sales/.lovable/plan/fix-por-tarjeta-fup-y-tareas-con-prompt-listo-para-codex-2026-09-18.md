# Fix por tarjeta: FUP y tareas, con prompt listo para Codex

## Sobre conectar el Codex de cada persona

No se puede: Codex (OpenAI) no está entre las integraciones que la app puede
ofrecer para que cada usuario conecte su propia cuenta. La lista disponible
incluye HubSpot, Google, Microsoft, Slack, Salesforce, Notion, etc., pero no
Codex. Tampoco existe una forma de "abrir" el Codex de otra persona desde la app.

Así que el botón Fix hace las dos cosas útiles que sí podemos:

1. **Genera el prompt completo listo para Codex** (botón "Copiar prompt para
   Codex", por deal y para toda la tarjeta). Cada persona lo pega en su Codex y
   sigue el trabajo allá con su propia cuenta.
2. **Genera el borrador dentro de la app** (con la IA del tablero), revisable y
   editable, para quien prefiera resolverlo sin salir del dashboard.

Si más adelante quieres una conexión real por persona, se puede hacer con una
integración que sí exista (por ejemplo su correo) o con un espacio donde cada
uno pegue su propia llave — se puede plantear después.

## Deals activos sin secuencia

Antes de generar, el Fix marca cada deal según sus contactos:

- Se leen los contactos asociados al deal y, de cada contacto, el número de
  secuencias activas en que está inscrito.
- Deal **sin secuencia** = ningún contacto activo inscrito → entra al Fix.
- Deal **en secuencia** → aparece en la lista marcado y excluido por defecto
  (se puede incluir a mano).
- Sin contactos asociados → aviso "faltan datos", sin inventar nada.

Esto agrega una consulta por deal, así que la carga del panel es algo más lenta
y se hace en tandas con indicador de progreso.

## Fix distinto según la tarjeta

### On track = No → skill FUP (seguimiento)

- Un borrador de **seguimiento por deal**, dirigido al contacto principal.
- Contenido: motivo del contacto, referencia a la última interacción, propuesta
  de siguiente paso y cierre con pregunta concreta.
- Salida: prompt para Codex + borrador de mensaje editable.
- No se crea nada en HubSpot automáticamente. Botones: "Copiar", "Copiar prompt
  para Codex" y, opcionalmente, "Guardar como nota en el deal" tras tu
  aprobación.

### Sin próxima actividad → tarea de seguimiento en HubSpot

- Solo deals activos y sin secuencia.
- Borrador de **tarea** (asunto, descripción, fecha propuesta, tipo llamada /
  correo / reunión), editable.
- "Aprobar y crear tareas" las crea en HubSpot asignadas al dueño del deal, con
  resultado fila por fila (esto ya funciona hoy).
- Además "Copiar prompt para Codex" por deal y para toda la tarjeta.

### Con tareas vencidas y Deals en pinzas

Se mantienen con el comportamiento actual (borrador de tarea aprobable) y ganan
el botón de copiar prompt para Codex.

## Detalles técnicos

- `src/lib/pulse.server.ts`: nueva lectura de contactos por deal vía
  `/crm/objects/{version}/deals/{id}/associations/contacts` y luego los contactos
  con la propiedad de secuencias activas; cacheada con el TTL lento existente y
  pasada por el throttling del gateway.
- `src/lib/pulse-types.ts`: `DealDTO` gana `contactIds`, `primaryContact`
  (nombre, email, cargo) y `sequenceActive: boolean | null`.
- `src/lib/fix.server.ts`: dos modos, `mode: "task" | "fup"`.
  - `task`: esquema actual (`instruction` + `task`).
  - `fup`: esquema nuevo (`instruction` + `followUp { channel, subject, body }`).
  - Se mantiene `openai/gpt-6-astra`, streaming en servidor y salida estructurada
    estricta. Se agrega `codexPrompt`: el prompt textual armado en servidor
    (plantilla fija con deal, etapa, monto, problema, contacto, secuencia,
    contexto Adobo), no generado por la IA.
- `src/lib/pulse.functions.ts`: `generateFixDrafts` recibe `mode`; nueva función
  `saveFixNote` para el guardado opcional de la nota FUP.
- `src/components/pulse/FixPanel.tsx`: rinde según `mode`, muestra el chip
  "en secuencia" con exclusión por defecto, aviso "faltan datos", y los botones
  de copiar prompt (por fila y global).
- `src/components/pulse/PulseDashboard.tsx`: la prop `fix` pasa también
  `mode`: `"fup"` para On track = No, `"task"` para las otras tres.
- `src/styles.css`: chips y variantes del panel FUP, modo oscuro coherente.

## Orden de trabajo

1. Lectura de contactos y secuencias por deal.
2. Modo FUP en el generador y en el panel, aplicado a On track = No.
3. Filtro "activos sin secuencia" en Sin próxima actividad.
4. Botón "Copiar prompt para Codex" en las cuatro tarjetas.
