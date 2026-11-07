# Filtros autocontenidos y expandibles

## Objetivo
Unificar Año, Trimestre, Comercial y Etapa como cuatro controles compactos e independientes, sin una cápsula adicional separada al desplegar opciones.

## Diseño e interacción
- Mostrar el título (`Año`, `Trimestre`, `Comercial`, `Etapa`) encima de cada control, no dentro de la selección.
- En reposo, cada control muestra solamente la opción activa dentro de una cápsula amarilla legible.
- Al pulsar la cápsula, el mismo contenedor se ensancha horizontalmente y revela todas las opciones en su orden original.
- La opción activa permanece amarilla dentro del conjunto; las demás se muestran neutras dentro de la misma superficie continua.
- Al elegir otra opción, esta pasa a amarillo y el control se colapsa mostrando únicamente la nueva selección.
- Al pulsar fuera o volver a pulsar el control, se cierra sin cambiar la selección.
- Solo un filtro podrá permanecer abierto a la vez, evitando cruces y duplicaciones visuales.
- Mantener selección múltiple en Etapa: las etapas elegidas permanecen amarillas mientras el control está abierto y el resumen compacto se conserva al cerrarlo.

## Ajustes visuales
- Usar la misma altura, tipografía, borde, fondo liquid glass y animación para los cuatro filtros.
- Eliminar la separación visual actual entre la cápsula seleccionada y la bandeja de alternativas.
- Mantener el desplazamiento horizontal del conjunto cuando el espacio disponible no alcance, sin cortar opciones.
- Conservar los filtros compactos durante scroll y en pantallas pequeñas.

## Verificación
- Probar apertura, selección, cierre, click fuera y cambio repetido en los cuatro filtros.
- Confirmar que no se repita visualmente la selección ni aparezca una segunda caja separada.
- Revisar escritorio y móvil para evitar recortes, superposiciones y saltos bruscos.

## Detalles técnicos
- Centralizar el estado de apertura en la fila de filtros para coordinar un único control abierto.
- Reutilizar una composición común para filtros simples y adaptar Etapa a selección múltiple.
- Animar el ancho del contenedor completo, no un popover independiente.
