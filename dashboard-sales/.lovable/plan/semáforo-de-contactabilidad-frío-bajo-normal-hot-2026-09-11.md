# Semáforo de contactabilidad (frío / bajo / normal / hot)

Objetivo: que en todo el pipeline se vea de un vistazo, con color, el riesgo de contactabilidad de cada negocio y su efecto sobre el Adobo score.

## Reglas del semáforo

Se calculan con los tres datos que ya llegan de HubSpot: intentos de contacto, respuestas del prospecto y tasa de contactabilidad.

| Estado | Condición | Color | Efecto sobre el score mostrado |
|---|---|---|---|
| Frío / riesgo ghosting | 3+ intentos y 0 respuestas | Rojo | Score tope 45 |
| Baja contactabilidad | 4+ intentos y tasa < 25% | Ámbar | Score tope 55 |
| Normal | Tiene respuestas, o tasa ≥ 25%, o menos de 3 intentos | Verde suave | Sin castigo |
| Hot | Score 76+ y además timing 0–30 con urgencia alta/media | Verde | Sin castigo (etiqueta "Hot") |
| Sin dato | No hay intentos ni tasa registrados | Gris | Sin castigo, se marca como falta de evidencia |

Notas:
- Entre 61 y 75 se marca como "pre-hot": aparece como candidato, no como hot.
- El límite de 30 días de la regla de frío se aplica sobre la última reunión/última actividad registrada por Adobo, que es la fecha disponible en el negocio; si no hay fecha, la regla se evalúa solo por intentos sin respuesta y se indica en el tooltip.
- El score original de HubSpot nunca se pierde: se muestra el valor con tope y, al lado, el valor bruto cuando difieren.

## Dónde se verá

1. **Listados de negocios (popup):** nueva columna/chip "Temperatura" con el color y el detalle (intentos, respuestas, tasa), ordenable y ocultable como el resto de columnas. En el detalle desplegable del score se explica por qué quedó frío/bajo y cuál es el tope aplicado.
2. **Resumen ejecutivo (Pipeline Comercial):** tarjeta "Contactabilidad" pasa a mostrar el semáforo con conteo y monto de negocios fríos, de baja contactabilidad, normales y hot; cada bloque abre su listado, respetando los filtros maestros de año, trimestre y comercial.
3. **Higiene de pipeline:** cuadrito de "Riesgo ghosting (3+ intentos, 0 respuestas)" con drilldown.
4. **Rendimiento del equipo:** columna compacta por comercial con el % de su pipeline abierto en frío, con tendencia sutil.
5. **Simulador y forecast:** los negocios con score capeado usan el score con tope, para que el forecast no se infle con negocios sin respuesta.

## Detalle técnico

- `src/lib/adobo.server.ts`: función `contactTemperature(props)` que normaliza tasa (acepta 0–1 y 0–100), calcula estado, tope de score y motivo legible; se expone en `AdoboDealDetail` (`temperature`, `scoreCapped`, `capReason`) manteniendo compatibilidad con snapshots antiguos (campos opcionales).
- `src/lib/pulse-types.ts`: extensión de tipos con campos opcionales y un `ContactTempScope` agregado (conteo/monto por estado + modal).
- `src/lib/pulse.server.ts`: agregación server-side por estado dentro del bloque donde ya se calcula la contactabilidad promedio, con drilldowns registrados y series de tendencia mensual como el resto de tarjetas.
- `src/lib/team.server.ts`: % de pipeline frío por comercial.
- `src/components/pulse/DealModal.tsx`: columna Temperatura + explicación del tope en el acordeón Adobo.
- `src/components/pulse/PulseDashboard.tsx`: tarjetas con semáforo y drilldowns.
- `src/styles.css`: tonos del semáforo reutilizando los tokens existentes (ok/warn/bad/neutral), sin colores nuevos hardcodeados.
- Verificación: `bunx tsgo --noEmit` y revisión visual del dashboard.
