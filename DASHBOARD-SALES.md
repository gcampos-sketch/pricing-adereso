# Hub comercial · acceso único

La fuente de trabajo es `https://github.com/gcampos-sketch/pricing-adereso`, con el dashboard dentro de `dashboard-sales/`. No tiene un repositorio Git anidado. La descarga en Downloads queda como respaldo.

Desde la raíz del hub:

```sh
npm run setup
npm run dev
```

El Hub se abre en `http://127.0.0.1:8877/`. El puerto 8877 es un proxy local hacia la aplicación del 8878; ninguno sirve el HTML privado sin sesión. La raíz muestra el ingreso corporativo por correo y segundo factor. Una sola sesión permite navegar por todas las herramientas, incluido Dashboard Sales.

Configurar las claves privadas de Supabase en `dashboard-sales/.env.local`, que no se publica. `HUBSPOT_ACCESS_TOKEN` es necesario para los reportes del dashboard, pero su ausencia no bloquea el arranque del Hub. `npm run check:config` muestra solo qué configuración falta. `npm test`, `npm run typecheck` y `npm run build` validan la aplicación desde la raíz; GitHub repite esas validaciones.

## Una sola entrada protegida

Render aloja el Hub completo con su servidor Node. Después de Email OTP y MFA, `/api/hub/session` verifica el JWT corporativo y el segundo factor en el servidor y emite una cookie HttpOnly. Cada archivo bajo `/hub-content/` exige una sesión válida antes de leerse. Los archivos permitidos se empaquetan en `private-hub/`, fuera del directorio público del servidor. El dashboard se abre en `/?dashboard=1`, dentro del mismo origen, y reutiliza la misma sesión. Sus funciones conservan además los controles de dominio, MFA y permisos por usuario.

El `Dockerfile` usa la raíz del repositorio como contexto. Sus tres argumentos de build son públicos: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_SUPABASE_PROJECT_ID`. Las claves privadas se configuran únicamente en runtime. Render proporciona `RENDER_EXTERNAL_URL` para validar el origen del intercambio de sesión detrás de su proxy HTTPS; no se confía en cabeceras de origen reenviadas por el cliente.

GitHub Pages no puede proteger el Hub con este servidor. Antes de afirmar que la publicación está protegida, reemplazar la copia pública anterior por una redirección al nuevo destino HTTPS, una vez validado el ingreso real. El repositorio público también conserva el código de las páginas; la autenticación protege la aplicación y sus datos privados, no oculta ese código. La vista externa autorizada de Partners está en `/partners/`: extrae únicamente la plantilla Partners del mismo `index.html` y permite sus tres recursos visuales. No sirve el Hub completo ni consulta datos privados. Compartir conserva tipo, categoría y extras en la URL, sin sesiones, contactos ni clientes. Cada despliegue actualiza esa vista con la misma fuente que la sección interna; el enlace se mantiene. El resto de `/hub-content/` conserva el ingreso corporativo.

La dependencia npm `@lovable.dev/mcp-js` se conserva para mantener las herramientas MCP existentes: es una librería de código y no encarga el desarrollo, hosting ni acceso a HubSpot a Lovable. Las rutas existentes de consentimiento conservan su nombre por compatibilidad con la configuración OAuth actual.

Los cambios previos del hub (identidad, Partners, índice y demás secciones) se conservan en el mismo árbol de trabajo. Publicar el conjunto completo con sus archivos nuevos.

## Supabase propio del dashboard

Destino: proyecto `nsflqsdtfmnuangezsid` (organización Adereso, `supabase-coral-cave`). El código local utiliza su URL y claves desde archivos de entorno ignorados. Mantener los mismos valores de URL y clave publicable en cliente y servidor; la clave privada va únicamente en `SUPABASE_SERVICE_ROLE_KEY`. Ese nombre acepta la clave secreta moderna `sb_secret_`; nunca copiarla a `VITE_*`.

Para instalar el esquema en un destino vacío, revisar y ejecutar `dashboard-sales/deployment/supabase-bootstrap.sql` en el editor SQL del proyecto correcto. Agrupa las migraciones del esquema y del control de dominio en una transacción y se detiene si encuentra tablas o funciones del dashboard existentes. No usarlo para actualizar un esquema instalado. No borra datos ni copia información del origen. El trigger de fechas usa un nombre propio del dashboard para evitar reemplazar funciones de otras aplicaciones.

El esquema consta de seis tablas con RLS: reportes, coaching, recuperación MFA, dispositivos confiables, permisos MCP y notificaciones personales. El acceso al caché de reportes queda reservado al servidor. Cada usuario solo puede leer sus propios grants MCP; la función de escritura de notificaciones es exclusiva del servidor. Comprobar tablas, políticas y rechazos sin sesión después de instalar.

Una instalación nueva no importa usuarios, eventos de coaching ni notificaciones del proyecto anterior. Los reportes se reconstruyen desde HubSpot con una clave válida. Para conservar historial almacenado se requiere una exportación autorizada del origen y una revisión de las asociaciones a usuarios. Las cuentas deben volver a configurar MFA y reconectar clientes MCP; no copiar sesiones, dispositivos confiables ni grants vigentes del proyecto anterior.

Las exportaciones privadas de una migración se guardan en `dashboard-sales/.migration-backups/`, excluidas de Git, Docker y Google Cloud. El archivo `notifications.json` conserva la relación entre el UUID anterior y el correo. Después de que cada persona ingrese y verifique su correo en el proyecto nuevo, ejecutar `npm --prefix dashboard-sales run restore:notifications -- --source .migration-backups/2026-11-06/notifications.json` para revisar el plan; agregar `--apply` para restaurar las cuentas elegibles. El proceso exige correo corporativo exacto y verificado, conserva el owner de CRM y el historial, actualiza también `payload.account`, y nunca reemplaza una configuración nueva ni borra el respaldo original. Los conflictos se revisan antes de aplicar cambios; las cuentas que todavía no existen quedan pendientes.

El ingreso elegido es código de ocho dígitos al correo `@adere.so`, seguido de TOTP. `AuthGate` solicita y verifica el código con Supabase; solo después muestra `MfaGate`. `requireMfa` conserva la validación del dominio y de `aal2` o un dispositivo confiable verificado por el servidor. No hace falta configurar Google OAuth para este ingreso.

En Supabase, habilitar Email, mantener Confirm email y TOTP habilitados, y conservar la longitud OTP de ocho dígitos. Adjuntar `public.dashboard_restrict_signup_email` como hook Postgres **Before User Created**. La migración `20261106183000_dashboard_email_signup.sql` instala esa función con ejecución exclusiva de Auth; la función rechaza registros de otros dominios.

Para enviar códigos, configurar un SMTP autorizado en Authentication → Emails → SMTP Settings y usar `dashboard-sales/deployment/email-code.html` en las plantillas Magic link or OTP y Confirm sign up. Asunto sugerido: «Tu código de acceso · Adereso». La variable `{{ .Token }}` es necesaria para mostrar el código. El plan gratuito observado no permite editar las plantillas sin SMTP y usa un enlace por defecto; con esa configuración la pantalla de código todavía no completa el ingreso. No se ha contratado un plan superior ni debe declararse validado el envío hasta recibir y verificar un código real. Mantener las credenciales SMTP fuera de Git.

Antes de conectar el sitio público, probar código recibido, MFA, rechazo de cuentas externas y un reporte real.

## Despliegue en Render (destino elegido)

`render.yaml` en la raíz define un Web Service Docker llamado `adereso-hub-comercial`, usando `dashboard-sales/Dockerfile` y la raíz del repositorio como contexto. El servicio conserva Supabase; no crea una base de datos nueva ni utiliza GCP o Lovable para alojar la aplicación.

1. Ingresar a Render con la cuenta de trabajo y crear un Blueprint desde este repositorio, rama `codex/dashboard-sales-hub`, archivo `render.yaml`. Revisar la conexión GitHub antes de autorizarla. El plan inicial es gratuito y se suspende tras inactividad; cambiar a uno pagado requiere aprobar su costo.
2. Render solicita las seis variables con `sync: false`. Las cinco de URL/clave publicable/ID salen de la configuración existente de Supabase. La privada es `SUPABASE_SERVICE_ROLE_KEY`; agregar `HUBSPOT_ACCESS_TOKEN` cuando esté disponible para habilitar los reportes. Ingresar las claves privadas directamente en Render por un canal seguro, nunca en Git, chat, argumentos públicos ni variables con prefijo `VITE_`.
3. Construir el servicio. Render pasa las variables a Docker como argumentos, pero el Dockerfile declara únicamente los tres argumentos públicos VITE; las claves privadas se usan solo en runtime. El puerto es `10000`. La comprobación `/healthz` impide declarar disponible una revisión sin toda la configuración requerida; no verifica validez de las claves ni acceso a proveedores.
4. Con la URL HTTPS real, configurar los destinos de retorno exactos en Supabase y revisar los orígenes de MCP si se usan. Probar código al correo `@adere.so`, MFA, rechazo de acceso no autorizado y un reporte real. Mantener la base de datos y migraciones actuales.
5. Después de esas pruebas, usar la URL de Render como entrada del Hub completo y reemplazar la publicación estática anterior por una redirección. No anticipar una URL ni conectar una revisión fallida.

Render despliega automáticamente cuando pasan los checks de la rama configurada. Tras integrar el PR a `main`, cambiar `branch` en el Blueprint y su configuración en Render a `main`. Los cambios posteriores de secretos se hacen en el servicio: `sync: false` solo solicita valores durante la creación inicial del Blueprint. No se ha contratado un plan pagado.

Documentación oficial: [Blueprints](https://render.com/docs/blueprint-spec), [Docker](https://render.com/docs/docker) y [límites gratuitos](https://render.com/docs/free).

## Alternativa preparada para Google Cloud Run

Destino propuesto: proyecto `adereso-internal-tools`, región `us-central1`, servicio nuevo `sales-dashboard`. La documentación interna menciona este proyecto; todavía hay que verificar el acceso y los recursos reales. No se reutiliza ni modifica el backend del CRM. Supabase conserva la base de datos, Auth por correo y MFA; no hace falta Firebase adicional.

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

La URL HTTPS será accesible para mostrar el inicio de sesión. Las consultas privadas conservan correo `@adere.so`, MFA y permisos verificados en el servidor. El despliegue solicita acceso público al transporte de Cloud Run; verificar que esa configuración sea compatible con las políticas de la organización. No hace público el contenido autenticado por Supabase.

El endpoint `/healthz` devuelve solo `ready` (200) o `not-ready` (503), sin detalles de claves. Comprueba presencia de configuración; no certifica que las credenciales sean válidas ni que HubSpot y Supabase respondan. `.gcloudignore` y `.dockerignore` excluyen archivos de entorno y dependencias locales del paquete enviado.

Después del despliegue:

1. Registrar la URL HTTPS y el retorno exacto de autenticación que utiliza la aplicación entre los destinos permitidos en Supabase. Revisar también los orígenes permitidos de MCP si corresponde.
2. Entrar con una cuenta autorizada, completar MFA y comprobar un reporte real, filtros y permisos. Comprobar que una sesión no autorizada no pueda consultar los datos.
3. Solo entonces usar la URL como entrada del Hub completo y sustituir la publicación estática anterior por una redirección.
4. Para actualizaciones, guardar el código en un commit y repetir el despliegue; la imagen usa el identificador de ese commit. Si una revisión falla, recuperar la revisión anterior desde Cloud Run y comprobar ingreso y reporte antes de volver a darla por operativa.

Estado de esta preparación: código y validaciones locales listos; recursos, claves, autenticación productiva y publicación final pendientes de verificación en las cuentas correspondientes.

## Destino desplegado

Hub: https://adereso-hub-comercial.onrender.com/ . Vista externa: https://adereso-hub-comercial.onrender.com/partners/ . Servicio Render `srv-dbn287bl550s73f8sds0`, Blueprint `exs-dbn0g9m7bikc73c6e7lg`, plan Free. El primer despliegue del Hub unificado quedó Live; siguen pendientes SMTP, prueba de código/TOTP real, conexión de reportes y sustitución de Pages anterior.

La presentación externa también se publica como Static Site `adereso-partners`, separado del servidor del Hub. `scripts/build-partners.mjs` usa exactamente `partnerDocument` y genera únicamente HTML de Partners y tres recursos visuales en `partners-public/`. No necesita dependencias ni variables privadas. La entrega por CDN evita el arranque después de inactividad del Web Service gratuito. Compartir apunta al dominio estático; publicar ambos servicios cuando cambie Partners. La ruta pública anterior del Hub permanece compatible.

## Envío por Gmail desde el Hub

Implementación en `dashboard-sales/deployment/gmail-connection.md`. Cada usuario conecta su propia cuenta Google, que debe coincidir con su cuenta corporativa verificada del Hub. El popup privado incluye remitente, destinatario y envío directo; el sitio externo no permite conectar cuentas internas. Requiere cliente OAuth de Google, configuración privada en Render y consentimiento del usuario. Sin esa configuración, muestra conexión pendiente y no simula un envío.

## Calculadora ROI externa

`https://adereso-partners.onrender.com/roi/` publica exclusivamente la calculadora y sus fórmulas extraídas de `index.html`, con contexto editable de `roi-standalone.js`. No entrega el documento completo de Pricing ni sus catálogos. El build estático publica el HTML independiente y solo CSS/logo; la ruta equivalente del servidor aplica una lista explícita de recursos. Compartir ROI usa esta dirección e incluye únicamente mensualidad, volumen y tarifa unitaria de plantilla cuando está definida. No se incluyen identidades, sesión, datos de clientes ni el resto de la cotización. El cliente puede cambiar los supuestos sin acceder al Hub.

## Sales Academy · sincronización de fuentes (preparada, pendiente de activar)

La biblioteca dentro de Academy consulta `GET /api/academy/content`, protegido por la misma sesión corporativa y MFA del Hub. Su material no se incluye en los archivos públicos ni se publica en el repositorio. El entrenamiento base, sus evaluaciones y la clave de avance `adereso_academy` no cambian. Esta primera fase publica documentos vigentes de las fuentes; no afirma haber regenerado las lecciones, preguntas ni escenarios históricos.

Fuentes fijas:
- Wiki comercial de producto: `3219c274-7df5-81a2-baeb-de4de645d487`, con sus páginas hijas. La ficha de Notion llamada “Wiki producto” enlaza a esta misma wiki.
- Artículos de `https://help.adereso.ai/sitemap.xml`; se excluyen las categorías. Solo se extrae el cuerpo del artículo, en texto, con título, enlace, fecha de edición y huella del contenido. No se siguen otros sitios ni se ejecuta HTML.

Notion aporta contexto comercial y anuncios; Help Center aporta instrucciones, requisitos y límites. Se mantienen como documentos separados con su procedencia; no se fusionan declaraciones contradictorias ni se convierten demos, beta o pendientes en disponibilidad general.

### Activación de una sola vez

1. Aplicar `dashboard-sales/supabase/migrations/20261107040000_academy_sync.sql` en el Supabase propio. Tablas y funciones son exclusivas de `service_role`, con RLS y sin permisos para anon/authenticated.
2. Crear una conexión interna de Notion con capacidad **Read content**, sin escritura ni acceso a usuarios/comentarios. Compartir únicamente la wiki y sus descendientes con esa conexión. Guardar su token en Render como `ACADEMY_NOTION_TOKEN`; guardar también `ACADEMY_NOTION_INTEGRATION_ID` y `ACADEMY_NOTION_WORKSPACE_ID`. La autorización del conector de este chat no sustituye este token del servidor.
3. Crear `ACADEMY_SYNC_SECRET` aleatorio, al menos 32 caracteres, en Render y como secreto de GitHub Actions con el mismo nombre. No pegar valores en el chat, documentos o commits. El endpoint `POST /api/academy/sync` solo acepta ese Bearer y procesa las fuentes configuradas. El Help Center no requiere credencial.
4. Para Notion, habilitar temporalmente `ACADEMY_NOTION_SETUP_ENABLED=true`. Crear la suscripción HTTPS a `https://adereso-hub-comercial.onrender.com/api/academy/notion-webhook`, eventos `page.created`, `page.content_updated`, `page.properties_updated`, `page.deleted`, `page.undeleted`, `page.moved`. La verificación inicial se guarda como candidata cifrada, no se devuelve públicamente ni se utiliza para firmar automáticamente.
5. Recuperar la candidata desde `POST /api/academy/notion-setup` con el Bearer del programador en una herramienta privada. Pegar el valor en la verificación de la conexión de Notion y, solo si Notion lo acepta, guardarlo en Render como `ACADEMY_NOTION_WEBHOOK_SECRET`. Deshabilitar el modo de alta y borrar la fila de `academy_webhook_setup`. Si una petición ajena ocupó la candidata antes de la auténtica, borrar esa fila y reenviar la verificación; nunca aceptar esa candidata sin la comprobación de Notion.
6. Ejecutar una primera sincronización y verificar ambos estados, fuentes, fechas y contenido dentro de una sesión real del Hub. Confirmar que una petición anónima no puede leer el contenido y que Partners/ROI no lo contienen.
7. Habilitar el programador en el Supabase propio: guardar la misma clave de Render en Vault con nombre `academy-sync-secret` y ejecutar `dashboard-sales/deployment/academy-schedule.sql` como administrador. El job `adereso-academy-sync` revisa cada 5 minutos la cola; cada fuente se comprueba al menos cada 15 minutos. El instalador se detiene si faltan las tablas o la clave. La función tiene destino fijo y no es ejecutable por roles del navegador ni `service_role`; el valor no aparece en la definición del job. Los administradores de base de datos pueden inspeccionar la cola HTTP de pg_net, que utiliza el secreto durante el envío. Verificar el estado real de `cron.job`, las respuestas HTTP y una primera publicación antes de marcarlo activo.

La alternativa `.github/workflows/academy-sync.yml` queda disponible, pero no habilitar ambos programadores. **Los horarios de GitHub Actions solo corren cuando el workflow está en la rama predeterminada**. Usar Supabase Cron evita depender de un merge de la rama del Hub. No se considera activado solo por desplegar Render. No se añade un cron de pago de Render ni se cambia `main` como parte de esta activación.

Los avisos de Notion se validan mediante HMAC, conexión, workspace y antigüedad. Solo marcan la fuente fija como pendiente; el identificador recibido no habilita lecturas de otras páginas. La cola persiste antes del 202. Un aviso nunca inicia trabajo en una promesa descartable después de responder. La espera será la agregación de Notion más el siguiente turno del programador; no se promete actualización instantánea. El Help Center se revisa periódicamente, sin asumir que ofrece webhooks propios. El Render Free puede añadir espera de arranque.

### Publicación, errores y recuperación

Cada fuente tiene una exclusión temporal en base de datos y una clave de versión por contenido. Una transacción comprueba la exclusión antes de publicar; un proceso viejo no puede reemplazar una versión nueva. Los eventos recibidos durante una lectura quedan pendientes para el siguiente turno. Las lecturas incompletas, límites, formatos inesperados o fallos conservan la última versión y marcan error. Se guardan hasta cinco versiones por fuente. La UI distingue fuente pendiente, error y comprobación atrasada; “fuente editada” no significa que una capacidad esté disponible.

Help Center reutiliza artículos sin cambios según el sitemap y vuelve a leer todo al menos semanalmente. Cambios de navegación, referencias de Notion no soportadas y tamaños fuera de límites detienen esa fuente con aviso, sin publicar una copia parcial. Una nueva raíz o fuente requiere cambiar la configuración revisada en código.

Pruebas: autenticación/MFA, aislamiento del endpoint del programador, firma y tamaño de webhooks, aislamiento de workspace, alta de firma en cuarentena, destinos de lectura permitidos, rechazo de redirecciones y respuestas grandes, extracción de artículo y conservación de límites en Notion. La activación productiva y una edición real de extremo a extremo siguen pendientes de credenciales, migración y programador.

### Estado verificado · 7 de noviembre de 2026

- Instaladas en el Supabase propio las migraciones `academy_source_sync` y `academy_scheduled_sync`. Job `adereso-academy-sync` activo cada cinco minutos como `postgres`; Vault guarda la clave del programador y Render recibió el mismo valor. No se creó infraestructura de pago ni se modificó `main`.
- Help Center: primera versión de 268 artículos publicada. La lectura completa se materializó con el lector local autorizado; después, el endpoint real de Render volvió a consultar la fuente y confirmó `unchanged`, 268 documentos. Las comprobaciones periódicas están habilitadas; la relectura completa semanal sigue su política normal de errores y conserva versión si falla.
- Wiki: importada una versión inicial mediante el conector autorizado de Notion, con procedencia y fecha de edición `2026-11-07T03:37:09.336Z`. No se incluyó el texto de la wiki en Git ni en el sitio público. **La actualización automática de Notion sigue pendiente de la conexión interna de lectura y, para sus avisos, de la suscripción webhook.** No confundir esta carga inicial con una conexión automática activa.
- Verificados por permisos efectivos: anon/authenticated no pueden leer las tablas de Academy ni ejecutar el despachador; `service_role` puede publicar. Las peticiones anónimas al contenido del Hub requieren autenticación. Los avisos del asesor sobre RLS sin políticas son intencionales para estas tablas exclusivas del servidor.
- La primera carga remota se interrumpió por un despliegue concurrente. Se recuperó únicamente la exclusión antigua mediante comparación de su vencimiento, sin reemplazar una exclusión nueva. El lector se ajustó para no construir el DOM de toda la aplicación del Help Center, clasificar fallos de transporte y esperar las lecturas ya iniciadas cuando falla un lote. Pruebas y CI pasaron para `e5072c9b6ff73eecbf3631274e8c0df1f344325e`; desplegado en Render.
- La credencial pendiente se puede guardar en `dashboard-sales/.env.academy`, archivo privado ignorado por Git. Las copias iniciales de fuentes quedan en `.migration-backups/academy/`, también ignoradas y excluidas del despliegue. Ninguna de esas rutas debe compartirse ni subirse al repositorio.
