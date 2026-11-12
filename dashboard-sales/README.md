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

Hub completo: http://127.0.0.1:8877/. La raíz del servidor muestra el ingreso único; `/?dashboard=1` abre el dashboard con esa misma sesión. Desde la raíz del repositorio, `npm run dev` inicia el proxy local y la aplicación.

El Hub completo se aloja en Render, con sus archivos privados fuera del directorio público. Docker usa la raíz del repositorio como contexto. Ver [DASHBOARD-SALES.md](../DASHBOARD-SALES.md) para autenticación, migración y despliegue. GitHub Pages no ejecuta esta protección y debe redirigirse al destino definitivo después de validar el ingreso.

## Conexiones y acceso

- `HUBSPOT_ACCESS_TOKEN`: token de una app privada de HubSpot con los permisos que requieren los reportes (deals, empresas, asociaciones, propietarios, propiedades, metas y demás objetos consultados). Permanece en el servidor. Las claves del conector Lovable no son intercambiables con este token.
- `SUPABASE_SERVICE_ROLE_KEY`: clave del mismo proyecto Supabase, usada únicamente en el servidor para snapshots, dispositivos de confianza y operaciones administrativas existentes.
- Configurar Email OTP de ocho dígitos y TOTP en el Supabase propio, con SMTP y plantilla de código. Ver `../DASHBOARD-SALES.md`. Los prefijos `VITE_` solo pueden contener configuración pública.
- La restricción `@adere.so`, el segundo factor del servidor y los permisos MCP se conservan. No hay un modo local que omita autenticación.
- El código y el segundo factor se completan en la entrada del Hub. El dashboard comparte el mismo origen y la misma sesión.

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

# Transferencia y actualización de informes

Los informes de ejecución usan `report-v2/<reporte>` y el almacenamiento comprimido
`report-storage/v1`. La compresión conserva íntegro el DTO deduplicado; las copias
anteriores y las ediciones inmutables de diagnóstico permanecen intactas. La lectura
consulta la copia antigua solo si falta o no puede decodificarse la nueva.

La migración `20261112125302_report_refresh_coordination.sql` coordina los refrescos
con reservas durables de Postgres, accesibles únicamente al servidor. Nunca compartir
promesas ni I/O entre solicitudes. Las pestañas reutilizan una comprobación realizada
en los últimos 60 segundos; actualizar manualmente reduce esa ventana a 5 segundos.
Una reserva vencida no puede sobrescribir el resultado de otra actualización.

Se compara todo el contenido excepto el `generatedAt` raíz. Si no cambió, se actualizan
solo los metadatos de comprobación, sin transmitir ni reescribir el informe. Los errores
no adelantan la fecha de comprobación y conservan la copia anterior. La frecuencia
automática del navegador sigue en 60 segundos y se mantiene el botón de actualización.

`report_refresh_state` registra compilaciones, escrituras, comprobaciones sin cambios
y bytes del informe antes/después. Son bytes del cuerpo de persistencia, no una factura
de Render ni todo el tráfico del servicio. Los registros `[report-transfer]` no incluyen
datos comerciales. `scripts/measure-report-transfer.ts` mide las copias existentes en
modo lectura y verifica su reconstrucción exacta; su resultado privado queda en
`.migration-backups/report-transfer-baseline.json`.
