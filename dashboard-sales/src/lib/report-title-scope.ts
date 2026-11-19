export function commercialShortName(full: string) {
  const trimmed = (full || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "sin propietario") return trimmed || "S/N";
  return trimmed.split(/\s+/)[0];
}

export function reportTitlePeriod(year: string, quarter: string, currentYear: string) {
  if (quarter === "all") return `Año ${year}`;
  return year === currentYear ? `Q${quarter}` : `Q${quarter} ${year}`;
}
