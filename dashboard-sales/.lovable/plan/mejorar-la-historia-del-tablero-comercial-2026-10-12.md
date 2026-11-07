# Mejorar la historia del tablero comercial

## Qué conviene mejorar

La información clave ya existe, pero hoy se mezclan dos lecturas distintas: **lo ocurrido en el período seleccionado** y la **foto operativa de hoy**. Además, las acciones aparecen repartidas entre alertas, calidad, tareas y seguimiento. La mejora debe ordenar la lectura, no sumar más ruido.

## Historia propuesta

```text
1. Generación        2. Activación          3. Conversión       4. Resultado        5. Acción
Deals creados   →    E0 y actividad    →    avance y velocidad → cuota y WR     →   qué trabajo hoy
```

### 1. Hacer explícito el Top of Funnel

- Reemplazar la nota comprimida de “Deals creados” por una secuencia fácil de leer:
  - **Creados**: cantidad y monto del período.
  - **Valorizados**: cantidad y porcentaje con monto mayor a cero, más monto total.
  - **Activados E0→E1**: cantidad y tasa, mostrando claramente el denominador.
  - **Perdidos antes de E1**: cantidad y tasa.
- Mantener el gráfico de tendencia y agregar una variación sutil contra el período anterior equivalente.
- Mostrar la cobertura del dato: cuántos deals creados tienen historial suficiente para calcular el paso E0→E1, evitando interpretar un 0% incompleto como desempeño real.

### 2. Separar “período” de “foto de hoy”

- Agrupar como **Resultados del período**: creados, activación, ganados, perdidos, win rate, ticket y cumplimiento.
- Agrupar como **Estado actual**: pipeline abierto, ponderado, cobertura, deals estancados, sin actividad y tareas.
- Marcar visualmente “Hoy” en las métricas que son una foto actual y “Q/Año” en las que responden al filtro temporal.
- Mantener Rol, Comercial y Tipo deal en ambas lecturas; evitar que Año/Trimestre parezca afectar indicadores que realmente representan el estado actual.

### 3. Convertir actividad en una señal comparable

- Mantener “Actividades por deal”, pero acompañarla con contexto: universo analizado y cantidad de deals con dato.
- Priorizar dos señales accionables sobre el promedio aislado:
  - deals sin actividad de venta por más de 10 días;
  - deals en E0 por más de 10 días.
- Revisar si el historial disponible permite comparar actividad en una ventana equivalente; si no, no mostrar una tendencia engañosa.

### 4. Unificar “Qué trabajo hoy”

- Reunir en un solo bloque priorizado las señales hoy dispersas en Alertas, Calidad del pipeline, Próxima actividad y Seguimiento deals.
- Ordenarlas por impacto:
  1. cierre cercano en riesgo;
  2. sin actividad o tarea vencida;
  3. estancados;
  4. candidatos a perdido;
  5. higiene de datos.
- Cada señal conservará su lista de deals, monto afectado y acción disponible; los bloques informativos permanecerán fuera de esta cola.

### 5. Dar una conclusión ejecutiva

- Añadir una franja compacta al inicio con tres respuestas:
  - **¿Estamos generando suficiente?** tendencia de creación y activación;
  - **¿Alcanza para la cuota?** cumplimiento, gap y cobertura;
  - **¿Dónde está el riesgo?** principal alerta por monto y cantidad.
- Usar reglas transparentes y tooltips; no generar recomendaciones automáticas si los datos no sostienen una conclusión.

## Validación

- Comprobar con los filtros Equipo, AE, KAM y comercial individual.
- Verificar Todo, Inbound, Outbound, Upsell y Cross sell.
- Contrastar un trimestre actual y uno histórico para confirmar que período y foto actual no se mezclen.
- Validar que cada cantidad y monto abra exactamente los deals que componen la métrica.
- Revisar legibilidad en escritorio y móvil, sin aumentar la densidad del primer pantallazo.

## Prioridad sugerida

Primero haría **Top of Funnel + separación período/hoy + unificación de acciones**. Son los cambios que más mejoran la historia sin requerir nuevas fuentes de datos. La conclusión ejecutiva debe venir después, cuando esas definiciones estén consolidadas.