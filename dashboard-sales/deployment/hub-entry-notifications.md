# Avisos de entradas al Hub

## Qué se registra

Una entrada es la apertura de la raíz del Hub de producción o de su dashboard directo, una vez aceptada la cuenta corporativa y su segundo factor/dispositivo confiable. Incluye abrirlo de nuevo con una sesión guardada. Volver a un documento desde la caché de navegación también inicia una entrada. Cambiar el foco de pestaña, renovar tokens y recargar el mismo documento no cuentan como entradas nuevas.

La vista local, los despliegues de preview, la pantalla de consentimiento OAuth y los iframes internos quedan excluidos. El servidor vuelve a verificar la identidad y MFA y rechaza sesiones delegadas OAuth. El cliente nunca envía el correo, el usuario ni la hora para persistirlos.

`public.hub_entry_events` conserva solamente ID de evento, usuario, ID aleatorio de visita, identificador de sesión verificado y hora de recepción del servidor. El identificador de sesión no es un token ni concede acceso. Tiene RLS y permisos únicamente para el servidor; no es una API de lectura pública. No guarda tokens, IP, user-agent, rutas, datos comerciales ni fingerprints. La clave única `(user_id, visit_id)` hace idempotentes los reintentos. `hub_first_access` mantiene su uso exclusivo para la bienvenida.

En la pestaña se conserva una marca con usuario, identificador de sesión (no token) e ID de visita para ignorar recargas. No es una credencial ni autoriza acceso. Si el navegador bloquea ese almacenamiento, se conserva deduplicación dentro del documento, pero una recarga puede contar como una nueva apertura.

## Límites y fallos

El registro es independiente de las consultas de datos del dashboard. Una entrada autorizada no prueba que todos los reportes hayan cargado correctamente. Los fallos de registro no bloquean el Hub: cada ronda hace como máximo tres intentos con el mismo ID y sin reutilizar credenciales de otro usuario/sesión. Mientras la página siga abierta, una ronda fallida se vuelve a intentar después de un minuto, al recuperar conectividad o al volver a mostrar la pestaña; esto no crea otra entrada. Cerrar la página antes de registrar o un fallo prolongado de almacenamiento pueden impedir el registro. Este mecanismo no es una bitácora forense ni una garantía de entrega en tiempo real.

## País de conexión, no ubicación física

El navegador realiza una consulta adicional a `/auth/v1/user` del mismo proyecto Supabase que ya autentica al Hub. Lleva su token actual y un marcador aleatorio `hub_entry_visit`, nunca la IP en un campo. El destino está fijado al proyecto de producción; no admite otros hosts ni redirecciones y solo usa la clave pública existente. La sonda se ejecuta en paralelo: aunque falle, tarde o sea bloqueada, el evento se sigue registrando. No usa GPS, zona horaria, idioma, fingerprint ni proveedor GeoIP externo.

La sonda se reclama una sola vez por visita en memoria y sessionStorage antes de enviarse. Una recarga no puede añadir la ubicación posterior de una VPN a la entrada original. La marca conserva solo el ID aleatorio de visita; no contiene país ni token. Una sonda fallida queda desconocida, no se vuelve a observar una ubicación posterior bajo el mismo evento.

El monitor lee el país de `request.cf.country` de los registros privados `edge_logs` de Supabase. Es metadato de la conexión observado por el proveedor, no un país declarado por el cliente. No usar `cf-ipcountry`, `x-forwarded-for`, el cuerpo del evento ni una consulta del backend como sustitutos: podrían ser falsificables o corresponder al servidor. Los encabezados y el marcador solo sirven para correlacionar; no prueban el país por sí mismos.

La función `resolveHubEntryCountry` exige proyecto, ruta, método, respuesta 200, usuario autenticado, sesión, marcador único de visita, identificador de cliente, ID de registro y una ventana de cinco minutos antes a dos minutos después del evento. Supabase entrega timestamps UTC, incluso cuando omite el sufijo Z. La hora válida del evento es la del servidor. Si un reintento tardío queda fuera de la ventana, el país queda desconocido en lugar de atribuirle una conexión distinta.

Las reglas se guardan de forma privada por correo exacto en `hub_entry_country_expectations`. No hay lista global de países permitidos ni un país por defecto para todas las cuentas corporativas. Configurar por separado las cuentas comerciales verificadas que esperan CL y la excepción verificada que espera NL, según la instrucción autorizada. El roster y sus correos no se incluyen en Git. Una cuenta nueva, ambigua o sin regla queda `unconfigured`, nunca se supone chilena. El cambio de correo requiere revisar su regla.

Una observación fuera del país esperado produce `unusual_country`, incluso si otras observaciones de esa visita son del país esperado. Varias ubicaciones se conservan como evidencia múltiple. Una lectura parcial no establece normalidad. `XX`, `T1`, códigos inválidos o ausencia de evidencia son desconocidos, no países extranjeros. Guardar únicamente los códigos de país, evaluación, IDs de registros fuente y hora de evaluación en `hub_entry_country_assessments`; no copiar IP ni el log completo. Mantener explícita la diferencia entre desconocido, esperado y fuera de lo esperado.

El país describe la salida de red aproximada: VPN, proxy, viajes, cambios de red y errores de geolocalización pueden cambiarlo. Una alerta no prueba acceso indebido ni debe bloquear cuentas automáticamente. Un cliente modificado puede omitir la sonda o simular su propio evento; esta telemetría complementa, no sustituye, los controles Auth/MFA. Revisar la política interna de privacidad y acordar una retención acotada antes de activar el monitor. No se ha configurado limpieza ni ampliado accesos.

## Publicación y verificación

1. Obtener autorización explícita para publicar. Reconciliar este cambio con la rama de producción actual y preservar cambios ajenos.
2. Pasar tests, typecheck, build y CI de frontera de GitHub Pages. Revisar la migración de permisos antes de aplicarla al proyecto correcto.
3. Aplicar la migración `hub_entry_events` y verificar estructura, RLS y ausencia de permisos para `anon`/`authenticated`. No cambiar configuración Auth/MFA ni crear credenciales.
4. Publicar el commit aprobado. El registro se habilita únicamente cuando `RENDER_EXTERNAL_URL` coincide exactamente con `https://adereso-hub-comercial.onrender.com`.
5. Probar con una sesión real autorizada: abrir, recargar, renovar token, volver a abrir, probar preview y dashboard embebido. El primer caso y la reapertura deben generar eventos distintos; recarga y renovación no. No simular entradas ajenas ni marcar un fixture como ingreso de una persona.
6. Verificar la sonda de extremo a extremo: localizar el marcador exacto en los logs, confirmar usuario y sesión coincidentes, respuesta 200 y `request.cf.country`. Confirmar que el país es metadato del proveedor y no un encabezado modificable por el navegador. Probar fallos de sonda: deben conservar la entrada y quedar desconocidos. No anunciar cobertura geográfica hasta completar esta verificación.
7. Poblar las reglas privadas con las identidades verificadas y países autorizados, leerlas de vuelta y probar las evaluaciones con fixtures separados, sin insertar entradas reales ficticias. Revisar retención y acceso del monitor.
8. Crear el monitor solo después de verificar la fuente. La migración o el despliegue por sí solos no activan avisos. Verificar destino, frecuencia, estado durable de deduplicación y un aviso real antes de afirmar que está activo.

Estado de publicación: la migración `20261108225217_hub_entry_events.sql` y las reglas privadas fueron aplicadas y leídas de vuelta con autorización el 8 de noviembre de 2026. Existen pruebas unitarias para sondas y correlación, y se confirmó en lectura que el proyecto entrega `request.cf.country` y datos autenticados en peticiones reales `/auth/v1/user`. La verificación de la sonda de extremo a extremo y la activación de avisos se realizan después del despliegue; no asumirlas por la existencia de las tablas.

## Lectura para el monitor

Leer en servidor con el conector autorizado. Resolver el correo actual desde `auth.users`, sin duplicarlo en la tabla de eventos:

```sql
select e.id, e.user_id, e.auth_session_id, e.visit_id, e.entered_at, u.email
from public.hub_entry_events e
join auth.users u on u.id = e.user_id
where e.entered_at >= :activation_time
order by e.entered_at, e.id;
```

El monitor debe tener su propio estado durable de eventos ya avisados por ID y destino. No usar solo un cursor de tiempo: las transacciones tardías pueden aparecer después. Separar pendiente, envío aceptado y envío incierto; un envío incierto exige reconciliación, nunca reenvío automático. Una lectura fallida o parcial no permite avanzar el estado. Configurar la frecuencia soportada y el destino en la conversación autorizada, sin depender de que el Mac esté abierto. No asumir que Supabase ofrece un webhook compatible con la plataforma de avisos.

Para enriquecer el país, usar `query_logs` con rango explícito (máximo 24 horas por consulta), seleccionar solo campos necesarios y paginar completamente. Ejemplo de proyección ClickHouse:

```sql
select id, timestamp, source,
  map(
    'request.cf.country', log_attributes['request.cf.country'],
    'request.host', log_attributes['request.host'],
    'request.path', log_attributes['request.path'],
    'request.method', log_attributes['request.method'],
    'response.status_code', log_attributes['response.status_code'],
    'request.sb.auth_user', log_attributes['request.sb.auth_user'],
    'request.sb.jwt.authorization.payload.session_id', log_attributes['request.sb.jwt.authorization.payload.session_id'],
    'request.sb.jwt.authorization.payload.role', log_attributes['request.sb.jwt.authorization.payload.role'],
    'request.search', log_attributes['request.search'],
    'request.headers.x_client_info', log_attributes['request.headers.x_client_info']
  ) as log_attributes
from logs
where source = 'edge_logs'
  and log_attributes['request.path'] = '/auth/v1/user'
  and log_attributes['request.headers.x_client_info'] = 'hub-entry-country/v1'
order by timestamp, id
limit 1000;
```

Convertir únicamente estas filas del conector con `countryLogFromProviderRow`; nunca aceptar datos enviados a la API del Hub como filas del proveedor. Comprobar el total y continuar páginas por `(timestamp, id)` cuando corresponda. No interpretar un truncamiento o error como ausencia de conexiones. Correlacionar con la función probada, leer las reglas privadas, evaluar y persistir el resultado antes de que expire la retención de logs del plan (retención actual aún por verificar). Procesar de nuevo los pendientes con solapamiento por posible retraso de ingesta; no cambiar una observación positiva a normal por una lectura parcial. No esperar indefinidamente para avisar una entrada: si falta el país, avisar «país no disponible» y permitir una actualización posterior si aparece evidencia fuera de lo esperado.

El mensaje debe incluir cuenta, hora y país observado o desconocido. Para una discrepancia: «Entrada de [cuenta] desde [país de la conexión], fuera del país esperado [país]. Puede deberse a VPN o viaje». No afirmar «hackeo» ni ubicación física. Conservar el ID de evento como deduplicación de la entrada y distinguir una eventual actualización geográfica; no reenviar la entrada completa por cada reintento del monitor.

Referencias: [campos de logs de Supabase](https://supabase.com/docs/guides/observability/log-field-reference), [interpretación de errores y metadatos](https://supabase.com/kb/troubleshooting/discovering-and-interpreting-api-errors-in-the-logs-7xREI9), [códigos de país de Cloudflare](https://developers.cloudflare.com/fundamentals/reference/http-headers/).
