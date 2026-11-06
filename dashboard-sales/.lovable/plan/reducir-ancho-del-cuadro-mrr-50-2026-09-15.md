# Reducir ancho del cuadro MRR (~50%)

## Cambio
Achicar el ancho del cuadro "MRR activo histórico" en la barra de filtros a aproximadamente la mitad, manteniendo el alto actual. Ajustes en `src/styles.css`:

- `.filter-active-mrr`: `min-width` 380px → 200px; `grid-template-columns` `auto 150px` → `auto 80px`; `column-gap` 16px → 10px; `flex` `1 1 auto` → `0 0 auto` (que no crezca a llenar el espacio libre).
- `.filter-active-mrr > svg`: `width` 140px → 72px; `height` 48px (mantiene).
- `.filter-active-mrr > strong`: `font-size` 24px → 20px (proporcional al ancho menor).
- Estado flotante `.filter-panel-compact[data-floating="true"] .filter-active-mrr`: `min-width` 300px → 180px; `flex` `1 1 300px` → `0 0 auto`.
- Breakpoint móvil (~línea 1000): `min-width` 260px → 180px.

## Resultado
El cuadro queda más proporcional (mitad de ancho, mismo alto), sin invadir el espacio libre entre filtros y el borde derecho.
