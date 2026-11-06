# Compactar filtros: Etapa junto a Trimestre

## Problema
El panel de filtros ocupa 3 filas y desperdicia la mitad derecha del ancho en cada una:
1. Año | Trimestre
2. Comercial
3. Etapa

## Solución
Mover "Etapa" a la primera fila, junto a "Trimestre", quedando en 2 filas:
1. **Año | Trimestre | Etapa** (todo en una fila, `filter-row-inline`)
2. **Comercial**

### Cambios
- `src/components/pulse/PulseDashboard.tsx`: agrupar el bloque de Etapa dentro del mismo `filter-row filter-row-inline` que ya contiene Año y Trimestre (líneas ~566–608), eliminando el `filter-row` separado de Etapa (líneas ~634–665).
- `src/styles.css`: añadir `flex-wrap: wrap` ya existe en `.filter-row-inline`, así que los tres grupos se acomodan solos. Ajustar el `gap` de `.filter-row-inline` a `16px` para separar visualmente Etapa de Trimestre con un separador sutil (borde izquierdo o margen extra).
- En móvil (`max-width: 900px`) los grupos envuelven naturalmente sin cambios extra.

### Resultado
- 2 filas en vez de 3
- Aprovecha el ancho horizontal vacío
- Etapa queda junto a Trimestre como pidió el usuario
