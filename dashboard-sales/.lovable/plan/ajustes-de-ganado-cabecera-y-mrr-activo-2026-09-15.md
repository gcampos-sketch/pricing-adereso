# Ajustes de ganado, cabecera y MRR activo

## Cambios visibles
- Quitar el texto redundante bajo la barra de avance de “Ganado / cuota”.
- Añadir un chip comparativo en esa tarjeta: QoQ cuando se selecciona un trimestre y YoY cuando se selecciona el año completo, calculado sobre MRR ganado.
- Reemplazar el bloque derecho de la barra de filtros por una tarjeta sutil de “MRR activo histórico”, independiente de año, trimestre, comercial y etapa.
- Mostrar la antigüedad de los datos debajo de la barra de filtros.
- Mover “Refrescar ahora” al menú de cuenta, junto a “Cerrar sesión”.

## Datos del MRR activo
- Calcular la foto actual sumando el MRR de todos los deals que hoy están exactamente en “Inicio de servicio”.
- Mantener una serie histórica persistente por fecha para reflejar altas y churn; el valor no cambiará al usar filtros.
- Inicializar meses anteriores con los deals activos actuales y su fecha de entrada a “Inicio de servicio”; desde esta implementación, cada refresco conservará fotos reales y mostrará correctamente las bajas futuras.
- Presentar una mini tendencia en la tarjeta y el cambio contra la foto anterior.

## Detalles técnicos
- Reutilizar la copia persistente del reporte para conservar la serie sin agregar una nueva pantalla ni llamadas adicionales desde el navegador.
- Compartir la acción de refresco con el menú de sesión para que siempre actualice el reporte visible.
- Mantener el formato compacto y flotante de filtros en escritorio y móvil.
