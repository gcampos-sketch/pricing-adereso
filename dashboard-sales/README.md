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

### Bajas programadas en el Home

El Home consulta con la conexión existente de solo lectura de HubSpot. Usa el `MRR Neto` de empresa que se carga desde Finanzas y el mes de `Fecha Lost` tras verificar en su historial que la fecha de primer día de mes fue registrada por una persona. Una fecha enviada solo por formulario queda por validar. El cruce usa el ID de instancia y la asociación del negocio a su empresa. Las instancias de un mismo holding y mes se suman una sola vez por instancia.

Las solicitudes se actualizan desde el formulario de baja. El riesgo sale de `Salud = Riesgo Fuga` y queda fuera del cálculo. La consulta se repite al abrir, refrescar o cada cinco minutos con el Home visible. No se requiere mantener un archivo local ni dar acceso a las hojas privadas de Finanzas.

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


## Reuniones y coaching: ediciones privadas publicadas

`bun --env-file=.env.local scripts/publish-commercial-evidence.ts /ruta/privada` compila y valida las fuentes revisadas; `--publish` inserta la edición privada en `report_cache`, comprueba la escritura exacta y conserva las anteriores. Nunca incluir ese directorio ni su contenido en Git o Docker. La fecha original de captura permanece visible; las actividades sin deal comercial y los cuerpos de Calendar/Memory no se publican. La cobertura parcial y los cruces pendientes no se convierten en ausencia de reuniones ni evaluaciones resueltas. El reporte de Coaching v3 separa el estado actual de HubSpot del histórico corroborado, sin crear eventos al leer.

La publicación de una edición no configura sincronización automática. La conexión nativa de Diio requiere sus credenciales de servidor y la de Calendar una autorización de servidor propia. No extraer credenciales de conectores ni reutilizar el permiso de Gmail. La edición publicada y verificada se conserva cuando una fuente está bloqueada; una nueva edición solo se anuncia después de validar y leer la escritura.

### Metadata de Creative Analytics para Análisis de pipeline

`PIPELINE_CREATIVE_CATALOG_JSON` admite un catálogo privado de objetos con los
campos `id`, `name` y `format` de `meta.ads` de Creative Analytics. El ID de Meta
se conserva como texto. El propietario del catálogo debe proporcionar esos tres
campos, sin el resto del lote ni sus datos de CRM. Un formato vacío queda sin
verificar. Configura el catálogo exclusivamente en el entorno del servidor de
Dashboard Sales. El Hub consulta HubSpot para las conversiones y cruza únicamente
por ID exacto. La carga del catálogo es manual y se debe actualizar al cambiar el
inventario. Si falta, no valida o no contiene un ID, el Sankey conserva el negocio
y muestra su ID cuando está disponible. Nunca versionar archivos del catálogo.
