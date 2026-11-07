# Acelerar la carga del reporte

## Qué está pasando hoy

Cada pestaña arma su reporte pidiéndole a HubSpot **todos los deals otra vez**: `pulse.server.ts`, `insights.server.ts`, `team.server.ts` y `partner.server.ts` tienen cada uno su propio `fetchDeals()` + `fetchQuotas()` + owners. Además todas las llamadas pasan por una cola que espacia cada request 260 ms para no chocar con el límite de HubSpot, así que las páginas se suman en serie: paginar 200 deals por página varias veces, luego tareas, luego asociaciones. Nada se guarda: cambiar de pestaña, refrescar o el refetch automático (20 s en Pipeline Comercial) vuelve a pagar el costo completo.

## Qué implementar

1. **Caché en memoria en el servidor (lo que más se nota).** Una capa `cache.server.ts` con TTL por clave: los deals crudos, las cuotas y los owners se piden una vez y se reutilizan entre pestañas y entre usuarios. TTL sugerido: 90 s para deals/tareas, 10 min para cuotas y owners. Refresco "stale-while-revalidate": si el dato está vencido se devuelve el viejo y se actualiza en segundo plano, así nunca se ve el skeleton largo.

2. **Un solo fetch de deals compartido.** Unificar los cuatro `fetchDeals()` en un fetch por pipeline con la **unión** de propiedades, cacheado. Cada builder sigue filtrando y clasificando como hoy, pero sobre el mismo set. Esto elimina 3 de cada 4 recorridos de paginación.

3. **Menos vueltas de red por recorrido.** Subir el `limit` de búsqueda a 200 donde falte, pedir solo las propiedades que cada reporte usa realmente en el set unificado, y paralelizar las páginas cuando HubSpot entrega `total` (hoy es estrictamente secuencial). Bajar el gap de 260 ms a ~120 ms manteniendo el reintento con backoff que ya existe.

4. **UX de carga en el frontend.** En `src/routes/index.tsx`: `placeholderData: keepPreviousData` para que al volver a una pestaña se vea el dato anterior mientras refresca; subir el `refetchInterval` de 20 s a 60 s en Pipeline Comercial (los otros ya están en 60 s) y refrescar solo la pestaña visible; y **precargar** en segundo plano los reportes de las otras pestañas una vez que la primera terminó, para que el cambio de pestaña sea instantáneo.

5. **Indicador honesto.** Mantener el skeleton solo en el primer render; en refrescos posteriores mostrar el punto de "actualizando" que ya existe sin desmontar los paneles.

## Notas técnicas

- Nuevo `src/lib/cache.server.ts`: `Map` de `{ value, expiresAt, inflight }` con `getCached(key, ttlMs, loader)` que deduplica llamadas concurrentes (evita que 4 pestañas disparen 4 fetchs simultáneos del mismo dato).
- Nuevo `src/lib/hubspot-deals.server.ts` con `getCommercialDeals()` / `getPartnerDeals()` y la lista unificada de propiedades; los cuatro builders lo consumen.
- La caché vive en el proceso del servidor; en el runtime edge puede haber varias instancias, así que se trata como optimización best-effort, no como fuente de verdad.
- Sin cambios de esquema, ni de base de datos, ni de la lógica de negocio: los números calculados quedan idénticos.

## Resultado esperado

Primera carga notablemente más corta (una sola paginación en vez de varias), cambio de pestaña casi instantáneo, y refrescos sin pantalla en blanco.
