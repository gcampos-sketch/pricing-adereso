# Acceso y alta del Hub comercial

El acceso habitual usa passkeys nativas de Supabase (WebAuthn, API experimental). Keeper, Touch ID, Face ID, PIN o una llave de seguridad pueden custodiar la passkey. El Hub no recibe biometría. No requiere Google SSO.

## Alta inicial autorizada el 8 de noviembre de 2026

1. En el Hub oficial, pulsar **Iniciar sesión**. Un navegador utilizado recientemente va a la passkey; uno desconocido pide el correo exacto `@adere.so`. Si la cuenta ya está confirmada, continúa a passkey sin enviar un código de alta.
2. Recibir e introducir el código de ocho dígitos enviado al buzón. Solo entonces se obtiene una sesión y se muestra el QR de Authenticator.
3. Configurar Authenticator y verificar un código TOTP actual. Guardar los códigos de recuperación.
4. Guardar una passkey en Keeper o en el dispositivo. El Hub se abre solo cuando el servidor confirma que existe una passkey registrada para esa cuenta.

El envío usa `auth.signUp`, no `signInWithOtp`. El requisito de contraseña de esa API se satisface con un valor aleatorio generado y descartado en el servidor; no se solicita ni se devuelve una contraseña al usuario. Una cuenta ya confirmada no recibe una nueva sesión mediante este formulario. Los códigos se verifican con tipo `signup`, no con tipo `email`. La acción devuelve solo el siguiente paso: `email-code` para una identidad nueva/no confirmada o `passkey` ante la respuesta nativa de cuenta existente (usuario ofuscado con identidades vacías o error `user_already_exists`). No devuelve IDs, registros de usuario ni sesiones; mantiene las limitaciones nativas de signup. Una respuesta ambigua falla sin anunciar envío ni autenticación. Un alta interrumpida se retoma con la sesión conservada; si ya confirmó el correo y perdió la sesión antes de crear una passkey, requiere asistencia administrativa. No crear un segundo usuario ni habilitar un ingreso rutinario por correo para resolverlo.

AuthGate comprueba el correo confirmado. El servidor vuelve a consultar el usuario en Auth y vincula ID y correo al token verificado: `user_metadata.email_verified` no autoriza nada. `requireMfa` y `verifyHubIdentity` exigen además una passkey registrada, y mantienen AAL2 o el token confiable vigente de la misma cuenta. Las operaciones de configuración de MFA y la consulta de existencia de passkey están disponibles durante el alta sin abrir contenido privado. Las cuentas existentes con correo confirmado y passkey conservan su acceso.

## Configuración necesaria antes de publicar

En Supabase:

- Habilitar Email y el alta; mantener **Confirm email** activado (`mailer_autoconfirm=false`). Nunca autoconfirmar usuarios nuevos desde el cliente o mediante una función administrativa.
- Conectar **Before User Created** a `public.dashboard_restrict_signup_email`. La función se define en la migración `20261106183000_dashboard_email_signup.sql`; su existencia no demuestra que el hook esté conectado.
- Configurar SMTP y la plantilla **Confirm signup** con `deployment/email-code.html`, que incluye `{{ .Token }}`. No basta con configurar la plantilla Magic Link.
- Configurar ocho dígitos, vencimiento de 10 minutos y límites de envío/verificación de Auth; no desactivar las protecciones de fuerza bruta. La pausa visual de reenvío no sustituye estos límites.
- Habilitar TOTP y Passkeys. Mantener nombre `Hub comercial Adereso`, RP ID `adereso-hub-comercial.onrender.com` y origen único `https://adereso-hub-comercial.onrender.com`. No cambiar el RP ID ni usar `onrender.com` como RP compartido.

Estas opciones son configuración de infraestructura, no quedan activadas por editar el código. No publicar hasta verificar plantilla, hook, longitud, vencimiento y throttling en el proyecto destino.

## Ingresos posteriores y vista local

La primera pantalla tiene una sola acción: **Iniciar sesión**. Tras identificar el recorrido, **Entrar con Touch ID, Face ID o PIN** aparece primero y **Entrar con Keeper** debajo; ambos inician la autenticación WebAuthn nativa. Keeper necesita su extensión desbloqueada y una passkey guardada. No hay botón separado para registrarse ni un código por correo en ingresos habituales de cuentas confirmadas.

`hub-sign-in-device-v1` recuerda durante 30 días que el navegador se utilizó con una passkey. Solo orienta la siguiente pantalla; no identifica una cuenta, no demuestra que la passkey siga disponible y no autoriza contenido. El navegador no permite enumerar silenciosamente las passkeys de todos sus proveedores. Si ese recuerdo es incorrecto, **Continuar con mi correo** permite retomar el recorrido. No almacenar correo, tokens o IDs de credenciales en esta pista.

MfaGate mantiene el segundo factor y ofrece **Recordar este navegador por 30 días**. Desmarcarlo evita emitir un nuevo token confiable y elimina el token local anterior, con intento de revocación en servidor. AAL2 ya obtenido sigue siendo válido en la sesión actual. La passkey AAL1 por sí sola no abre el Hub. El token confiable del Hub no eleva AAL para registrar otra passkey: `preparePasskeyEnrollment` exige TOTP AAL2 y vuelve a comprobarlo antes de la ceremonia. No alterar los grants MCP.

La vista local usa OAuth/PKCE hacia el Hub oficial. El formulario de alta y las ceremonias reales se ejecutan en el origen oficial; no registrar localhost como RP, copiar sesiones ni añadir una excepción de autenticación. Los fixtures visuales de pruebas contienen solo interfaz pública y no sustituyen un alta real.

## Validación de publicación

Probar con una persona y un buzón corporativo autorizados: recepción del código, rechazo de código erróneo/vencido/reutilizado, ausencia de contenido privado tras confirmar solo el correo o solo MFA, registro personal de la passkey y un nuevo ingreso por passkey. Probar también una cuenta existente y el retorno autenticado a la vista local. Las pruebas unitarias no demuestran entrega de correo ni completan WebAuthn. No enviar códigos a terceros ni crear cuentas de prueba en producción sin autorización específica.
