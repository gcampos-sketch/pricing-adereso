export type CopyableDeal = {
  name: string;
  url: string;
  details?: readonly string[];
};

function webUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escape = (text: string) => text.replace(/[&<>"']/g, character => entities[character]!);
const htmlText = (text: string) => escape(text).replace(/\r\n?|\n/g, "<br>");

export function buildDealListClipboard(deals: readonly CopyableDeal[], heading: readonly string[] = []) {
  const unique = new Map<string, { name: string; url: string; details: Set<string> }>();
  for (const deal of deals) {
    const url = webUrl(deal.url);
    const key = url || deal.name;
    const details = unique.get(key)?.details ?? new Set<string>();
    for (const detail of deal.details ?? []) if (detail) details.add(detail);
    unique.set(key, { name: deal.name, url, details });
  }

  const htmlRows: string[] = [];
  const textRows: string[] = [];
  for (const { name, url, details } of unique.values()) {
    const title = url ? `<a href="${escape(url)}">${htmlText(name)}</a>` : htmlText(name);
    htmlRows.push(`<li>${[title, ...[...details].map(htmlText)].join("<br>")}</li>`);
    textRows.push([`• ${name}${url ? ` — ${url}` : ""}`, ...details].join("\n"));
  }

  return {
    count: unique.size,
    html: heading.map(line => `<p>${htmlText(line)}</p>`).join("") + `<ul>${htmlRows.join("")}</ul>`,
    text: [...heading, textRows.join(deals.some(deal => deal.details?.length) ? "\n\n" : "\n")].join("\n"),
  };
}
