# Acordeón "Composición Adobo score" por deal

Cada fila de la tabla de negocios podrá abrirse con un chevron discreto y mostrar, debajo y a ancho completo, un panel con todo lo que explica el puntaje de ese negocio.

## Qué verá el usuario

Al abrir una fila:

1. **Score principal** — puntaje Adobo, su tendencia, el motor principal, la razón del último cambio y cuándo cambió.
2. **Base / etapa** — % de cierre de HubSpot, etapa y fecha de cierre.
3. **Señales vivas** — correos entrantes recientes, WhatsApp registrado, notas con riesgo de alcance/expectativas (solo si vienen en los datos), más contactabilidad: tasa, intentos y respuestas.
4. **Snapshot comercial** — fit, ICP fit y su evidencia, pain, motivo de compra, urgencia, timing, objeción, competidor, next step claro, decisor, presupuesto, riesgos, compromisos, stakeholders y última reunión (fecha, tipo, calidad, confianza).

Los grupos se muestran como chips agrupados en **Positivo** (verde), **Riesgo** (rojo) y **Contexto** (amarillo/neutro). Cualquier dato ausente aparece como "sin evidencia" en gris — nunca se oculta, para poder auditar vacíos.

Debajo, tres líneas cortas calculadas en pantalla: "Sube por: …", "Baja por: …", "Sin evidencia: …". Solo se usan valores reales del negocio; nada inventado.

Un botón **Copiar desglose** copia ese resumen en texto.

## Comportamiento

- El chevron reemplaza el actual botón "+ Adobo" de cada fila; la tabla mantiene su alto y densidad.
- El panel ocupa el ancho completo bajo la fila; en pantallas chicas se apila en bloque vertical legible.
- Abrir/cerrar no afecta buscador, filtros de mes ni ordenamientos actuales; el estado de apertura sobrevive a los refrescos de datos.

## Detalles técnicos

- `src/lib/hubspot.server.ts`: agregar al fetch de deals `adobo_score_trend`, `adobo_score_driver_principal`, `adobo_score_last_change_reason`, `adobo_score_last_changed_at`, `adobo_icp_fit`, `adobo_icp_fit_evidencia`, `adobo_intentos_contacto_prospecto`, `adobo_respuestas_prospecto`. Antes de agregarlas verifico que existan en el portal (una propiedad inexistente hace fallar el fetch con 400); las que no existan quedan fuera y se muestran como "sin evidencia".
- `src/lib/adobo.server.ts`: extender `adoboDetail()` con esos campos, normalizando defensivamente (numéricos, tri-estado, listas separadas por `;`).
- `src/lib/pulse-types.ts`: extender `AdoboDealDetail` con los nuevos campos opcionales.
- `src/components/pulse/DealModal.tsx`: reemplazar `AdoboRow` por un acordeón (`chevron` + panel `colSpan` completo), con agrupación positivo/riesgo/contexto, cálculo en cliente de sube/baja/sin evidencia y `CopyTextButton` para el desglose.
- `src/styles.css`: estilos sobrios del panel, chips por tono y layout responsive.
- Lectura tolerante: los snapshots guardados antiguos no traen los campos nuevos, así que todo se lee con fallback a "sin evidencia".
- Verificación: `bunx tsgo --noEmit` y revisión visual del acordeón abierto/cerrado en preview.
