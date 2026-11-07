# Passkeys del Hub comercial

El ingreso admite passkeys nativas de Supabase (WebAuthn; API experimental), además del enlace/código al correo corporativo. Touch ID, Face ID, PIN o una llave verifican al usuario en su dispositivo: el Hub no recibe biometría. No requiere un proyecto Google Cloud.

En Supabase Authentication → Passkeys, habilitar el método con nombre `Hub comercial Adereso`, RP ID `adereso-hub-comercial.onrender.com` y origen único `https://adereso-hub-comercial.onrender.com`. Mantener este dominio estable: cambiar el RP ID invalida las passkeys anteriores. No usar el dominio compartido `onrender.com`. El origen local no pertenece a este RP y no sirve para probar la ceremonia de producción.

Cada usuario entra por el método existente una vez, completa TOTP y pulsa **Touch ID / Face ID → Activar en este dispositivo** en el Hub o en su menú de cuenta del Dashboard. Al abrir el popup se comprueba el AAL de Supabase. Una sesión recordada con AAL1 debe confirmar un código TOTP actual antes de habilitar el alta; se vuelve a comprobar antes de la ceremonia. El token de dispositivo confiable del Hub no sustituye esta elevación. Después, el usuario debe completar personalmente el diálogo del sistema o de Keeper. Solo se anuncia el alta después de la verificación de Supabase. En próximos ingresos, **Entrar con Touch ID / Face ID** inicia una sesión sin correo.

La sesión sigue pasando por MfaGate y por la autorización del servidor: dominio exacto `@adere.so` y `aal2` o un token de dispositivo confiable válido del mismo usuario. Una sesión passkey `aal1` por sí sola no abre el Hub. El segundo factor se recuerda durante los 30 días existentes; puede volver a pedirse en otro navegador. No alterar los grants de MCP.

La entrada por correo y los códigos de recuperación se conservan. Un navegador sin WebAuthn mantiene el ingreso existente. Cancelar una ceremonia no autentica al usuario. La validación final requiere que una persona registre su passkey y pruebe un acceso real desde el dominio de producción; las pruebas automáticas no sustituyen ese paso.
