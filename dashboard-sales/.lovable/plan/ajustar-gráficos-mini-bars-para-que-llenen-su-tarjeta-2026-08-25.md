# Ajustar gráficos mini-bars para que llenen su tarjeta

## Problema
Los gráficos `MiniBars` (barras de "Ganados por trimestre", MRR, etc.) se ven minúsculos dentro de sus tarjetas `.rep-chart`. El contenedor `.mini-bars` está fijo en 186×52px y la altura máxima de cada barra está hardcodeada en 34px en el componente, dejando un gran espacio vacío debajo. Las etiquetas de eje (Q1-26, Q2-26...) quedan casi ilegibles.

## Causa confirmada
- `src/styles.css` líneas 684-726: `.mini-bars` fija `width: 186px; height: 52px`, `.mini-bar` fija `width: 26px; min-height: 44px`, y la etiqueta usa `font-size: 8px`.
- `src/components/pulse/MiniCharts.tsx` línea 19: `const height = Math.max(4, (item.amount / max) * 34);` — tope de 34px.

## Cambios
1. **`src/components/pulse/MiniCharts.tsx`** — Reemplazar el tope hardcoded `34` por una altura proporcional al contenedor. Opción más robusta: usar un `ref` + `ResizeObserver` para escalar la barra al alto real del contenedor, o más simple y suficiente: subir el tope a ~120px y dejar que CSS controle el alto. Elegiré la vía simple: parametrizar la altura máxima vía prop con default 120, y escalar `* maxH`.
2. **`src/styles.css`** — Hacer `.mini-bars` responsivo:
   - `width: 100%` (en vez de 186px fijo)
   - `height: 140px` (en vez de 52px)
   - `.mini-bar { width: auto; flex: 1 1 0; min-height: 120px }` para que las barras se repartan el ancho
   - `.mini-bar > em { font-size: 11px }` para legibilidad
3. Verificar que `MiniLine` (mismo card) no quede desproporcionado: ajustar `.mini-line` a `width: 100%` y mantener viewBox.

## Validación
- Reproducir con Playwright: navegar al tab Pipeline Comercial, sección "Ganados por Plan de Bot", y al tab Rendimiento del Equipo. Confirmar que las barras llenan la tarjeta y las etiquetas se leen bien.
- Comprobar que en el tab Partners los gráficos también se ven correctos.

## Notas
- No se cambia lógica de datos ni filtros, solo presentación.
- `MiniBars` se usa en 9 lugares, todos dentro de `.rep-chart`, así que un único cambio CSS+componente arregla todos.
