# Transición encapsulada del detalle de negocios

## Objetivo
Hacer que cada ventana de negocios parezca expandirse desde el cuadro seleccionado y vuelva suavemente a ese mismo punto al cerrarse.

## Cambios
- Capturar la posición y tamaño del botón o tarjeta que abrió el detalle.
- Animar el panel desde ese origen con escala, desplazamiento y desvanecimiento del fondo.
- Mantener el contenido visible durante la animación de cierre antes de desmontarlo.
- Aplicar el mismo cierre suave al botón, clic fuera y tecla Escape.
- Respetar la preferencia del sistema para reducir movimiento.

## Verificación
- Probar apertura y cierre desde una tarjeta real del dashboard.
- Confirmar que el foco, notas, tareas y filtros del detalle siguen funcionando.
- Ejecutar la verificación de TypeScript.
