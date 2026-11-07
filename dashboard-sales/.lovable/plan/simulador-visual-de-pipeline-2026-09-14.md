# Simulador visual de pipeline

## Objetivo
Rediseñar `Simulador de Estrategia > Pipeline Comercial` para que siga la referencia: cuatro etapas horizontales, lectura inmediata y controles de escenario dentro de cada etapa.

## Cambios
- Mostrar Generado, Valorizado, Ganado y Perdido como cuatro módulos conectados de izquierda a derecha.
- Mantener monto, porcentaje, barra de avance, contexto y accesos a deals en cada módulo.
- Integrar los controles donde impactan: generación y ticket en Generado; valorización en Valorizado; win rate por monto y por cantidad en Ganado.
- Mantener Perdido como resultado calculado, sin control propio.
- Mostrar participación por comercial, WR por segmento y principales motivos de pérdida como chips compactos.
- Mantener el botón para volver a los valores actuales y destacar claramente cuándo hay un escenario activo.
- Adaptar la composición a una columna legible en pantallas pequeñas.

## Validación
- Confirmar que todos los controles actualizan el escenario sin saltos.
- Confirmar que reset restaura los valores actuales.
- Confirmar que los accesos a deals siguen funcionando y que no hay superposiciones en escritorio ni móvil.

## Detalles técnicos
- Reutilizar los datos y filtros actuales; no cambiar consultas ni métricas del resto del dashboard.
- Reorganizar `PipelineFunnel` y sus estilos usando los tokens visuales existentes.
- Mantener TypeScript estricto y respetar reducción de movimiento.
