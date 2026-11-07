# Seguimiento deals: On Track y Pinzas

## Qué cambia
- Renombrar **Seguimiento con pinzas** a **Seguimiento deals**.
- Agregar el subtítulo **On Track** con dos cuadros: **Sí** y **No**.
- Cada cuadro mostrará cantidad y monto; al hacer clic abrirá el listado de deals correspondiente en el popup existente.
- Mantener debajo el subtítulo **Seguimiento con pinzas** con sus cuatro indicadores actuales.
- Todo respetará el filtro principal de comercial y etapa, igual que el resto de la vista.

## Detalle técnico
- Extender `TrackingScope` con conteos, montos y claves de popup para `on_track = true` y `on_track = false`.
- Construir ambos listados desde la propiedad real de HubSpot `on_track` (booleano: **Sí**=`true`, **No**=`false`) y registrarlos en los drilldowns existentes.
- Actualizar `PulseDashboard` para renderizar la nueva jerarquía visual sin cambiar el comportamiento de los popups.
- Validar visualmente en escritorio y móvil, incluyendo apertura de ambos listados.
