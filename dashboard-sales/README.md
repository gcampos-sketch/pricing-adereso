# Dashboard Sales · Adereso

Aplicación React + TanStack Start con servidor Node. El desarrollo se realiza localmente con Codex; no requiere el editor ni el hosting de Lovable. Supabase conserva las cuentas, MFA, permisos y snapshots existentes.

## Desarrollo local

Requiere Node 22.12+ y npm. Bun se instala como herramienta de desarrollo para ejecutar las pruebas existentes.

```sh
npm ci
cp .env.example .env.local
# Completar la configuración de .env.local; no reemplazar valores existentes a ciegas.
npm run check:config
npm run dev
```

La descarga original puede traer `.env` con la configuración pública de Supabase. En ese caso, basta agregar las claves privadas faltantes a `.env.local`. Ambos archivos quedan fuera de Git.

Dashboard: http://127.0.0.1:8878/. Hub comercial local: http://127.0.0.1:8877/?vista=dashboard.

El hub vive en `/Users/gonzalocampos/Projects/pricing-adereso`. Su herramienta Dashboard Sales incrusta el servidor local en el puerto 8878. Fuera de localhost usa la URL de servidor configurada en `dashboard-settings.js` o muestra la página de disponibilidad pendiente; no vuelve a Lovable. El dashboard es una aplicación con servidor: GitHub Pages por sí solo no ejecuta sus funciones.

## Conexiones y acceso

- `HUBSPOT_ACCESS_TOKEN`: token de una app privada de HubSpot con los permisos que requieren los reportes (deals, empresas, asociaciones, propietarios, propiedades, metas y demás objetos consultados). Permanece en el servidor. Las claves del conector Lovable no son intercambiables con este token.
- `SUPABASE_SERVICE_ROLE_KEY`: clave del mismo proyecto Supabase, usada únicamente en el servidor para snapshots, dispositivos de confianza y operaciones administrativas existentes.
- Configurar Email OTP de ocho dígitos y TOTP en el Supabase propio, con SMTP y plantilla de código. Ver `../DASHBOARD-SALES.md`. Los prefijos `VITE_` solo pueden contener configuración pública.
- La restricción `@adere.so`, el segundo factor del servidor y los permisos MCP se conservan. No hay un modo local que omita autenticación.
- El código de correo puede ingresarse dentro del hub. Si el navegador bloquea almacenamiento entre sitios, usar el enlace «Abrir» del hub.

Las librerías MCP de Lovable se conservan como dependencia de código para mantener las herramientas existentes; no necesitan el editor. Las rutas MCP no confían por defecto en cabeceras de proxy suministradas por el cliente. Si el hosting usa un proxy, revisar su contrato antes de cambiar esa configuración.

## Validación y producción

```sh
npm run typecheck
npm test
npm run build
npm run start
```

El build genera `.output/`. El inicio carga `.env` y `.env.local` si existen; en producción configurar las variables mediante el proveedor de hosting. El servidor debe alojarse en un servicio compatible con Node, con HTTPS. Mantener las migraciones Supabase existentes; no crear ni reemplazar la base de datos durante esta migración.

## GitHub

El código forma parte de `gcampos-sketch/pricing-adereso`, dentro de `dashboard-sales/`. Esa carpeta es la fuente de trabajo; la descarga original queda como respaldo. No contiene un repositorio Git anidado. No usar `real-time-hub` para nuevos cambios.

`npm ci` usa `package-lock.json`; `bun.lock` se conserva como referencia de la descarga y no es el lockfile del flujo npm. El workflow del hub valida cambios y el contenedor permite alojar la aplicación con un servidor Node independiente de Lovable.
