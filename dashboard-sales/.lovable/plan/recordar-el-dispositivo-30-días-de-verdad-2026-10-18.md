# Recordar el dispositivo 30 días de verdad

## Problema confirmado
Hoy un navegador "de confianza" igual pide el código de 6 dígitos al iniciar sesión de nuevo. La confianza se guarda en el navegador, pero el servidor exige verificación en dos pasos en cada sesión nueva, así que la pantalla no se puede saltar sin cambiar cómo el servidor valida.

## Qué implementar
1. Al verificar el código con "recordar dispositivo", el servidor crea un token de confianza aleatorio (30 días) ligado a la persona, guarda solo su huella en la base de datos y lo devuelve al navegador.
2. En un inicio de sesión nuevo, si el navegador tiene un token válido, el servidor lo comprueba y la pantalla del código se salta.
3. La protección de los datos del reporte acepta: sesión verificada con código, o sesión de la misma persona con token de confianza válido y no revocado.
4. "Usar otra cuenta" y cerrar sesión revocan el token en el servidor, además de borrarlo del navegador.
5. Ajustar los textos de la pantalla para que coincidan con el comportamiento.

## Notas técnicas
- Nueva tabla `mfa_trusted_devices` (user_id, token_hash, expires_at, revoked_at), solo accesible por el servidor.
- `requireMfa` acepta aal2 o un header con token válido para el `userId` de la sesión; el token viaja con el middleware de cliente ya existente.
- Se elimina la firma con sal fija del navegador (`mfa-trust.ts`), que no aporta seguridad.
- La exigencia de cuenta @adere.so no cambia. Las herramientas para asistentes externos siguen exigiendo aal2.
