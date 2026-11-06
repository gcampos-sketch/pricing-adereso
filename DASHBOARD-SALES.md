# Dashboard Sales · un solo repositorio

La fuente de trabajo es `https://github.com/gcampos-sketch/pricing-adereso`, con el dashboard dentro de `dashboard-sales/`. No tiene un repositorio Git anidado. La descarga en Downloads queda como respaldo.

Desde la raíz del hub:

```sh
npm run setup
npm run dev
```

El arranque reutiliza el hub del puerto 8877 si ya está abierto y levanta el dashboard en 8878. Acceso: `http://127.0.0.1:8877/?vista=dashboard`.

Configurar las claves privadas de HubSpot y Supabase en `dashboard-sales/.env.local`, que no se publica. `npm run check:config` muestra solo cuáles faltan. `npm test`, `npm run typecheck` y `npm run build` validan el dashboard desde la raíz. El workflow `.github/workflows/dashboard-sales.yml` repite esas validaciones en GitHub.

## Publicación independiente

GitHub Pages puede alojar el hub estático. El dashboard consulta HubSpot desde un servidor para proteger las claves, así que necesita un hosting Node o de contenedores. No puede ejecutarse directamente en GitHub Pages.

El `Dockerfile` del dashboard usa `dashboard-sales/` como contexto. Sus tres argumentos de build son públicos: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_SUPABASE_PROJECT_ID`. Al ejecutar el contenedor, configurar `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` y `HUBSPOT_ACCESS_TOKEN` como variables del servidor. Mantener la base de datos y las migraciones existentes; agregar el dominio final a los retornos permitidos de Google en Supabase.

Una vez desplegado, poner su URL HTTPS en `dashboard-settings.js` y publicar el hub desde GitHub. Hasta entonces el sitio publicado muestra una página de disponibilidad pendiente. No usa Lovable como destino alternativo.

La dependencia npm `@lovable.dev/mcp-js` se conserva para mantener las herramientas MCP existentes: es una librería de código y no encarga el desarrollo, hosting ni acceso a HubSpot a Lovable. Las rutas existentes de consentimiento conservan su nombre por compatibilidad con la configuración OAuth actual.

Los cambios previos del hub (identidad, Partners, índice y demás secciones) se conservan en el mismo árbol de trabajo. Publicar el conjunto completo con sus archivos nuevos.
