# Carga instantánea + loading con progreso real

## Qué pasa hoy

Al entrar, el reporte pide todo a HubSpot desde cero (deals paginados, tareas, asociaciones, cuotas, propietarios). Hay caché en memoria del servidor, pero se pierde cuando el servidor se recicla, así que muchas veces la primera carga vuelve a pagar los ~40 s completos y solo se ve un esqueleto gris sin decir qué falta.

## Qué implementar

### 1. Copia guardada: la página abre al instante
- Cada vez que se arma un reporte, se guarda el resultado en la base con su hora.
- Al entrar, la página muestra esa copia de inmediato y arranca el refresco en segundo plano; cuando llega el dato nuevo, se actualiza sin parpadeo.
- Se muestra siempre un sello honesto: "Datos de hace X min · actualizando…" con botón para forzar refresco.
- La copia se refresca sola cada pocos minutos mientras alguien tenga el reporte abierto.

### 2. Carga por partes en el primer tab
- Se separa el reporte en dos: el **núcleo** (cuotas, forecast, cumplimiento, tabla de comerciales) y los **paneles pesados** (tareas pendientes/actividad, riesgos y capa Adobo, tiempos entre etapas, Plan de Bot, OTF).
- El núcleo llega primero; cada panel pesado se rellena solo con su propio mini-esqueleto en su lugar, sin mover el resto de la página.
- Los otros tabs se siguen precargando en segundo plano como hoy, pero después de que el núcleo esté visible.

### 3. Loading que explica la espera
- Se reemplaza el esqueleto plano por un panel de progreso con pasos reales del servidor: "Leyendo negocios (1.200)…", "Cuotas y comerciales…", "Tareas y próximas actividades…", "Calculando riesgos y Adobo…", "Listo".
- Barra de avance por pasos ya completados + tiempo estimado basado en la última carga medida (no un número inventado).
- Se mantiene el estilo oscuro actual: mismos tonos, chips y tipografía; nada de nueva estética.
- Si un paso tarda más de lo normal, el texto lo dice ("HubSpot está lento, reintentando…") en vez de quedarse mudo.

### 4. Bajar el peso real de la carga
- Pedir a HubSpot solo las propiedades que cada reporte usa, en vez de la unión gigante actual para todos.
- Paginar en paralelo (varias páginas a la vez) en vez de estrictamente una tras otra.
- Traer tareas y asociaciones solo para los negocios que realmente entran en el rango filtrado.
- Aumentar la vida útil de cuotas y propietarios (cambian casi nunca) y compartir el mismo set de negocios entre tabs.
- Los números calculados quedan idénticos; solo cambia cómo se piden y cachean.

## Notas técnicas

- Nueva tabla `report_cache` (clave, payload jsonb, generated_at) con RLS: lectura para usuarios autenticados, escritura solo desde el servidor (service role). GRANT explícitos.
- `hubspot.server.ts`: `getCached` gana persistencia opcional (lee/escribe `report_cache`) manteniendo el stale-while-revalidate en memoria.
- Nuevos server fns: `getPulseCore` y `getPulseHeavy` (o `deferred` en el mismo fn); `src/routes/index.tsx` los consume con dos `useQuery` y `placeholderData: keepPreviousData`.
- Progreso: server fn `getLoadProgress` con contador de pasos por request id, o (más simple y preferido) pasos derivados en el cliente a partir del tiempo medido de la última carga guardada en `report_cache`. Se implementa la variante simple primero.
- Nuevo componente `src/components/pulse/LoadingProgress.tsx` + estilos en `src/styles.css`.
- Sin cambios de lógica de negocio ni de las métricas existentes.

## Resultado esperado

Entrar al reporte muestra números en menos de un segundo (copia guardada), el refresco real ocurre detrás, y mientras se espera un dato nuevo se ve un progreso que dice exactamente qué se está trayendo.
