# Tiempo por etapas y Deal Velocity

## Objetivo
Agregar bajo el Resumen ejecutivo dos lecturas con datos reales de HubSpot: permanencia mediana por etapa y Deal Velocity. Desde “Ver pipeline animado” se abrirá una vista amplia del recorrido del pipeline, con detalle por flujo sin tapar el diagrama.

## Datos y reglas
- Usar las etapas reales del pipeline Comercial y sus fechas/tiempos acumulados de HubSpot.
- Calcular cada mediana solo con deals que ya salieron de esa etapa, respetando periodo, comercial y tipo de deal seleccionados.
- Construir las transiciones desde las fechas reales de entrada a cada etapa; diferenciar avance, pérdida en ventas, pérdida en desarrollo y saltos que evitan E4.
- Mantener las reglas: gana en E6, cuenta en E6.2 y comisiona en E8.
- El grosor de cada flujo será proporcional a la cantidad de deals; los porcentajes usarán el total real de la etapa origen.
- Alimentar nodos, flujos, métricas, tooltips y drill-downs desde arrays calculados, sin cifras de ejemplo.

## Interfaz
- “Tiempo por etapas”: tarjetas horizontales por etapa con mediana, variación y mini tendencia; debajo, ciclos E1→E6, E6→E8 y E1→E8.
- “Deal Velocity”: oportunidades × win rate × ticket promedio ÷ ciclo, con la composición visible y el resultado en MRR por día.
- “Ver pipeline animado”: abre una vista amplia con SVG adaptable, zona ganada, niveles, conversiones, pérdidas y anomalías.
- Hover en etapas: nombre, deals, MRR, mediana y hito.
- Hover en flujos: origen/destino, cantidad y acceso al detalle.
- Clic en cualquier flujo: panel lateral interno con deals reales y enlace a HubSpot; Escape cierra primero el panel y luego la vista.
- Animación shimmer suave sobre las corrientes y pulso en anomalías, desactivados con reducción de movimiento.
- En pantallas pequeñas, permitir desplazamiento horizontal legible sin comprimir los nodos.

## Integración
- Incorporar el nuevo resumen al reporte existente y reutilizar sus filtros y refresco en vivo.
- Mantener el modal y el panel dentro del estilo actual del dashboard.
- No modificar otras secciones ni publicar a producción.

## Validación
- Comprobar cálculos contra deals reales y ausencia de dobles conteos.
- Probar apertura, hover, clic de cada tipo de flujo, enlaces, panel y cierre con Escape.
- Revisar escritorio y móvil, reducción de movimiento y TypeScript.
