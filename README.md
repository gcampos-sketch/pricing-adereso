# Hub comercial Adereso

El acceso oficial está en [adereso-hub-comercial.onrender.com](https://adereso-hub-comercial.onrender.com/). Reúne Pricing, Partners, ROI, Playbook, Operativa, Sales Academy y Dashboard Sales con una sesión corporativa y segundo factor.

El ingreso del Hub usa passkeys (Touch ID, Face ID o Keeper), con Authenticator cuando corresponde. El envío de enlaces/códigos por correo fue retirado de la pantalla de acceso. La configuración y el alta inicial asistida se documentan en [passkeys.md](dashboard-sales/deployment/passkeys.md).

Las vistas externas de [Partners](https://adereso-partners.onrender.com/partners/) y [ROI](https://adereso-partners.onrender.com/roi/) son publicaciones independientes del contenido interno del Hub.

Playbook y Operativa muestran sus fuentes de Notion. Sales Academy incorpora la biblioteca de Notion y el Help Center. Los lectores privados conservan versiones verificadas y mantienen la anterior si una actualización falla. Consultar `AGENTS.md` para realizar cambios de contenido y comprobar su sincronización.

## Desarrollo y publicación

La aplicación vive en `dashboard-sales/`; los archivos del Hub se sirven mediante su control de acceso. Ejecutar `npm ci` y `npm run dev` desde esa carpeta. Las credenciales se configuran en archivos privados excluidos de Git. El origen local enlaza al Hub oficial para iniciar sesión con la passkey de producción.

Render utiliza la rama `codex/dashboard-sales-hub` según `render.yaml`. GitHub Pages conserva únicamente páginas de redirección al sitio oficial y a las vistas públicas correspondientes. `_config.yml` excluye los archivos de la aplicación de esa publicación; CI comprueba que el sitio generado contenga solo las redirecciones.

Validación: `npm test`, `npm run typecheck` y `npm run build` desde `dashboard-sales/`. No subir credenciales, copias de Notion ni archivos de entorno.
