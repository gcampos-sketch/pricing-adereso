import { auth, defineMcp } from "@lovable.dev/mcp-js";
import teamSummary from "./tools/team-summary";
import owners from "./tools/owners";
import alerts from "./tools/alerts";
import kamBrief from "./tools/kam-brief";

// Vite inlines the stable ref; the published SUPABASE_URL may be a proxy.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "real-time-hub",
  title: "Real-Time Hub",
  version: "0.2.0",
  instructions:
    "Herramientas de solo lectura del Sales Dashboard de Adereso: resumen del trimestre, rendimiento por comercial, deals con alertas y cartera/cobertura KAM. Usa get_kam_brief para cartera propia; conserva los cortes independientes y la condición parcial de las reuniones. No confundir cobertura de reuniones con cobertura de pipeline, ni ausencia de evidencia con falta de contacto. Requiere cuenta @adere.so con verificación en dos pasos.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [teamSummary, owners, alerts, kamBrief],
});
