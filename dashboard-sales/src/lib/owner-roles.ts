/**
 * Rol comercial por dueño de HubSpot. AE = Gonza, Holly, Gio (Giordano) y
 * Andrés; KAM = Naty y Felipe. Fuente única para el filtro "Rol" del tablero:
 * el cliente agrupa con él y el servidor recorta el reporte con él.
 */
export type RoleFilter = "all" | "AE" | "KAM";

export const AE_OWNER_IDS = new Set(["82596016", "331766554", "373167468", "98326728"]);
export const KAM_OWNER_IDS = new Set(["91603512", "93662868"]);

/** Rol del dueño: AE, KAM o null si no pertenece a ninguno de los dos grupos. */
export function roleOfOwner(id: string): "AE" | "KAM" | null {
  if (AE_OWNER_IDS.has(id)) return "AE";
  if (KAM_OWNER_IDS.has(id)) return "KAM";
  return null;
}

/** Ids de dueños incluidos en el rol elegido; null significa "todo el equipo". */
export function roleOwnerIds(role: RoleFilter): Set<string> | null {
  if (role === "AE") return AE_OWNER_IDS;
  if (role === "KAM") return KAM_OWNER_IDS;
  return null;
}

export const ROLE_OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "AE", label: "AE" },
  { value: "KAM", label: "KAM" },
];
