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

## Despliegue en Render (destino elegido)

`render.yaml` en la raíz define un Web Service Docker llamado `adereso-sales-dashboard`, usando el Dockerfile y contexto de `dashboard-sales/`. El servicio conserva Supabase; no crea una base de datos nueva ni utiliza GCP o Lovable para alojar la aplicación.

1. Ingresar a Render con la cuenta de trabajo y crear un Blueprint desde este repositorio, rama `codex/dashboard-sales-hub`, archivo `render.yaml`. Revisar la conexión GitHub antes de autorizarla. El plan inicial es gratuito y se suspende tras inactividad; cambiar a uno pagado requiere aprobar su costo.
2. Render solicita las siete variables con `sync: false`. Las cinco de URL/clave publicable/ID salen de la configuración existente de Supabase. Las dos privadas son `SUPABASE_SERVICE_ROLE_KEY` y `HUBSPOT_ACCESS_TOKEN`: ingresarlas directamente en Render por un canal seguro, nunca en Git, chat, argumentos públicos ni variables con prefijo `VITE_`.
3. Construir el servicio. Render pasa las variables a Docker como argumentos, pero el Dockerfile declara únicamente los tres argumentos públicos VITE; las claves privadas se usan solo en runtime. El puerto es `10000`. La comprobación `/healthz` impide declarar disponible una revisión sin toda la configuración requerida; no verifica validez de las claves ni acceso a proveedores.
4. Con la URL HTTPS real, configurar los destinos de retorno exactos en Supabase y revisar los orígenes de MCP si se usan. Probar Google `@adere.so`, MFA, rechazo de acceso no autorizado y un reporte real. Mantener la base de datos y migraciones actuales.
5. Después de esas pruebas, poner la URL en `dashboard-settings.js` y publicar el hub. Hasta entonces sigue mostrando disponibilidad pendiente en producción. No anticipar una URL ni conectar una revisión fallida.

Render despliega automáticamente cuando pasan los checks de la rama configurada. Tras integrar el PR a `main`, cambiar `branch` en el Blueprint y su configuración en Render a `main`. Los cambios posteriores de secretos se hacen en el servicio: `sync: false` solo solicita valores durante la creación inicial del Blueprint. No se ha contratado un plan pagado.

Documentación oficial: [Blueprints](https://render.com/docs/blueprint-spec), [Docker](https://render.com/docs/docker) y [límites gratuitos](https://render.com/docs/free).

## Alternativa preparada para Google Cloud Run

Destino propuesto: proyecto `adereso-internal-tools`, región `us-central1`, servicio nuevo `sales-dashboard`. La documentación interna menciona este proyecto; todavía hay que verificar el acceso y los recursos reales. No se reutiliza ni modifica el backend del CRM. Supabase conserva la base de datos, Google Auth y MFA existentes; no hace falta Firebase adicional.

```sh
npm run deploy:dashboard:plan
# Con acceso GCP renovado, recursos preparados y cambios guardados en un commit:
npm run deploy:dashboard
```

El primer comando solo muestra el plan. El segundo construye y despliega; requiere Google Cloud CLI (`gcloud` en PATH o `GCLOUD_BIN` con la ruta al ejecutable). No configura permisos, activa APIs ni crea secretos automáticamente.

Antes de aplicar, el administrador del proyecto debe verificar o preparar:

- Facturación y APIs de Cloud Run, Cloud Build, Artifact Registry y Secret Manager habilitadas.
- Repositorio Docker regional `commercial-hub`.
- Cuentas dedicadas `sales-dashboard-build` y `sales-dashboard-runtime`. La cuenta de build necesita subir imágenes al repositorio y escribir sus logs; la de runtime necesita leer únicamente las dos versiones de secretos del dashboard. El operador necesita construir, desplegar y actuar como estas cuentas. Revisar también los permisos del agente de Cloud Build sobre la cuenta de build.
- Secretos `sales-dashboard-hubspot-token` y `sales-dashboard-supabase-service-role`, versión numérica `1` habilitada. Cargarlos directamente en Secret Manager por un canal seguro; no ponerlos en GitHub, argumentos de build ni en este documento. HubSpot debe tener solo los alcances que necesita el dashboard.

Los nombres pueden ajustarse mediante `DASHBOARD_ARTIFACT_REPOSITORY`, `DASHBOARD_BUILD_SERVICE_ACCOUNT`, `DASHBOARD_RUNTIME_SERVICE_ACCOUNT`, `DASHBOARD_HUBSPOT_SECRET`, `DASHBOARD_SUPABASE_SECRET` y sus respectivas variables `DASHBOARD_HUBSPOT_SECRET_VERSION` y `DASHBOARD_SUPABASE_SECRET_VERSION`. No se toman automáticamente claves de otras aplicaciones.

La revisión propuesta usa 1 CPU, 1 GiB, mínimo 0 y máximo 2 instancias, facturación por solicitudes y concurrencia 20. Estos límites contienen la capacidad pero no constituyen un presupuesto máximo: build, almacenamiento, red, secretos y uso del servicio pueden generar cargos. El arranque desde cero puede agregar espera a la primera visita.

La URL HTTPS será accesible para mostrar el inicio de sesión. Las consultas privadas conservan Google `@adere.so`, MFA y permisos verificados en el servidor. El despliegue solicita acceso público al transporte de Cloud Run; verificar que esa configuración sea compatible con las políticas de la organización. No hace público el contenido autenticado por Supabase.

El endpoint `/healthz` devuelve solo `ready` (200) o `not-ready` (503), sin detalles de claves. Comprueba presencia de configuración; no certifica que las credenciales sean válidas ni que HubSpot y Supabase respondan. `.gcloudignore` y `.dockerignore` excluyen archivos de entorno y dependencias locales del paquete enviado.

Después del despliegue:

1. Registrar la URL HTTPS y el retorno exacto de autenticación que utiliza la aplicación entre los destinos permitidos en Supabase. Revisar también Google OAuth y los orígenes permitidos de MCP si corresponde.
2. Entrar con una cuenta autorizada, completar MFA y comprobar un reporte real, filtros y permisos. Comprobar que una sesión no autorizada no pueda consultar los datos.
3. Solo entonces escribir la URL en `dashboard-settings.js`, validar el hub y publicar en GitHub. El script no cambia ese destino automáticamente.
4. Para actualizaciones, guardar el código en un commit y repetir el despliegue; la imagen usa el identificador de ese commit. Si una revisión falla, recuperar la revisión anterior desde Cloud Run y comprobar ingreso y reporte antes de volver a darla por operativa.

Estado de esta preparación: código y validaciones locales listos; recursos, claves, autenticación productiva y publicación final pendientes de verificación en las cuentas correspondientes.
