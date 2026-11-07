import { auth, defineMcp } from "@lovable.dev/mcp-js";
import teamSummary from "./tools/team-summary";
import owners from "./tools/owners";
import alerts from "./tools/alerts";

// Vite inlines the stable ref; the published SUPABASE_URL may be a proxy.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "real-time-hub",
  title: "Real-Time Hub",
  version: "0.1.0",
  instructions: "Herramientas de solo lectura del Sales Dashboard de Adereso: resumen del trimestre, rendimiento por comercial y deals con alertas. Requiere cuenta @adere.so con verificación en dos pasos.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [teamSummary, owners, alerts],
});
