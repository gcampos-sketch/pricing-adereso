# Enviar Partners desde el correo del usuario

Flujo activo elegido por Gonzalo: el popup permite escribir destinatario y mensaje, y abre Gmail con asunto y enlace preparados. La persona confirma el envío allí. La conexión OAuth y el envío directo quedan preparados, pero desactivados; no mostrar un botón de envío bloqueado por esa configuración.

El popup privado permite conectar la cuenta Google del usuario del Hub, elegir un destinatario y enviar una plantilla editable con el enlace público estático. La página externa sigue ofreciendo copiar enlace/abrir correo y no habilita las conexiones internas.

## Configuración necesaria

1. Un administrador debe registrar una aplicación OAuth de tipo Web para uso interno de Google Workspace Adereso y habilitar Gmail API. No requiere alojar el servidor en Google Cloud. Solicitar únicamente `openid`, `email` y `https://www.googleapis.com/auth/gmail.send`.
2. Registrar exactamente este retorno: `https://adereso-hub-comercial.onrender.com/api/hub/mail/callback`. En desarrollo se puede configurar un cliente separado con `http://127.0.0.1:8877/api/hub/mail/callback`.
3. Aplicar `supabase/migrations/20261106200000_partner_gmail.sql` en el Supabase propio. Incluye tres tablas privadas sin permisos para anon/authenticated y una función de reserva de envío ejecutable solo por service_role.
4. Configurar únicamente en el servidor Render: `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET` y `GMAIL_TOKEN_ENCRYPTION_KEY` (32 bytes aleatorios, 64 caracteres hexadecimales). La clave de cifrado debe ser estable; perderla obliga a reconectar cuentas. Nunca copiar estas claves a variables VITE ni al sitio estático. `HUB_PUBLIC_ORIGIN` es opcional si Render proporciona `RENDER_EXTERNAL_URL`; usar origen exacto sin barra final.
5. Cada usuario ingresa al Hub, completa MFA y concede personalmente el permiso de envío a Google. Se exige que la identidad Google tenga correo verificado y dominio adere.so, y que coincida exactamente con la identidad del Hub. No pedir ni almacenar contraseñas.
6. Validar conexión, rechazo de otra cuenta, desconexión, un envío expresamente autorizado y su aparición en Enviados. No declarar operativo el envío real antes de esa prueba.

Si las claves faltan, el Hub sigue funcionando y el popup muestra conexión pendiente. No existe un envío alternativo desde una cuenta compartida ni desde el conector Gmail de Codex. Tampoco se leen correos, contactos o bandejas: el alcance solicitado es envío.

## Controles

- OAuth con estado aleatorio de un solo uso ligado al usuario, expiración de 10 minutos, PKCE y nonce verificado en ID token firmado por Google.
- Refresh tokens cifrados con AES-256-GCM, asociados al usuario y contexto; solo en tablas privadas del servidor. No se devuelven al navegador ni se escriben en logs.
- Origen y sesión corporativa con MFA verificados en cada acción; el destinatario no puede elegir remitente ni identidad. Un solo destinatario, texto plano y enlace de Partners construido en el servidor.
- Reserva atómica en Postgres e identificador único por intento: no reenviar automáticamente ante timeout. Un resultado incierto pide revisar Enviados. Límite por usuario de 30 intentos por hora, sin almacenar cuerpo ni destinatario en el historial técnico; solo huella, estado e identificador del proveedor.
- Desconectar borra la credencial local e intenta revocar el permiso en Google. Si Google está inaccesible, el usuario también puede retirar el permiso desde su cuenta Google.

Documentación: https://developers.google.com/identity/protocols/oauth2/web-server y https://developers.google.com/workspace/gmail/api/guides/sending .
