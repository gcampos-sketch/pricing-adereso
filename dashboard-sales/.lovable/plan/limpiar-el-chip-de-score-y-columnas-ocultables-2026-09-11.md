# Limpiar el chip de score y columnas ocultables

## 1. Quitar la repetición del score

En la línea del acordeón, el chip "Score: 88" repite exactamente la columna Adobo de la misma fila. Se elimina ese chip y quedan solo los que aportan información nueva:

- Tendencia (subiendo / estable / bajando)
- "N sin evidencia" cuando hay huecos

El score sigue visible en su columna y, en detalle, dentro del panel abierto.

## 2. Columnas ocultables

Cada encabezado de columna recibe una x discreta que la oculta; la fila se recompone al instante sin dejar huecos.

Un control "Columnas" junto a los filtros del popup abre una lista con todas las columnas y su casilla, para volver a mostrar cualquiera o restaurar todas de una vez. Deal siempre queda visible como ancla.

La elección se recuerda por navegador, así que al volver a abrir cualquier popup de negocios se mantiene la vista que dejaste. Buscador, filtros de mes, orden y el acordeón siguen funcionando igual; si ocultas la columna por la que estabas ordenando, el orden vuelve a Adobo.

## Detalles técnicos

- `src/components/pulse/DealModal.tsx`: quitar el chip de score del resumen del acordeón; agregar estado `hiddenColumns` (Set de keys) persistido en `localStorage` (`deal-modal-hidden-columns`); derivar `visibleColumns` y usarlo en `gridTemplate`, header, filas y `allText()`; botón por header para ocultar; popover "Columnas" con checkboxes y "Mostrar todas"; fallback de `sort.key` a `adobo` si su columna se oculta.
- `src/styles.css`: estilos del botón de ocultar en el header y del popover de columnas, en línea con el resto (liquid glass, sin hover en inactivos).
- Verificación: `bunx tsgo --noEmit` y revisión visual del popup con columnas ocultas y restauradas.
