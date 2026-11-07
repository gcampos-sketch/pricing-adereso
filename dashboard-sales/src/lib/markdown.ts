/**
 * Convierte Markdown sencillo al HTML acotado que HubSpot renderiza bien en
 * notas y tareas (p, br, strong, em, u, s, code, a, ul/ol, li, h3/h4, blockquote).
 * Todo lo demás se escapa: nunca inyectamos HTML del usuario tal cual.
 */

const escapeHtml = (raw: string) =>
  raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Marcas inline sobre texto ya escapado. */
function inline(text: string): string {
  return (
    text
      // `código`
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      // [texto](url)
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
      // ***negrita cursiva***
      .replace(/\*\*\*([^*\n]+)\*\*\*/g, "<strong><em>$1</em></strong>")
      // **negrita** y __negrita__
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
      // ~~tachado~~
      .replace(/~~([^~\n]+)~~/g, "<s>$1</s>")
      // *cursiva* y _cursiva_
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>")
      // saltos simples dentro del párrafo
      .replace(/\n/g, "<br>")
  );
}

export function markdownToHubspotHtml(raw: string): string {
  const text = (raw ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text) return "";

  const out: string[] = [];
  let listTag: "ul" | "ol" | null = null;
  const closeList = () => {
    if (listTag) {
      out.push(`</${listTag}>`);
      listTag = null;
    }
  };

  for (const line of text.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed) {
      closeList();
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    const quote = /^>\s?(.*)$/.exec(trimmed);

    if (bullet) {
      if (listTag !== "ul") {
        closeList();
        out.push("<ul>");
        listTag = "ul";
      }
      out.push(`<li>${inline(escapeHtml(bullet[1] ?? ""))}</li>`);
      continue;
    }

    if (numbered) {
      if (listTag !== "ol") {
        closeList();
        out.push("<ol>");
        listTag = "ol";
      }
      out.push(`<li>${inline(escapeHtml(numbered[1] ?? ""))}</li>`);
      continue;
    }

    closeList();

    if (heading) {
      const level = (heading[1] ?? "#").length <= 2 ? 3 : 4;
      out.push(`<h${level}>${inline(escapeHtml(heading[2] ?? ""))}</h${level}>`);
      continue;
    }

    if (quote) {
      out.push(`<blockquote>${inline(escapeHtml(quote[1] ?? ""))}</blockquote>`);
      continue;
    }

    if (/^([-*_])\1{2,}$/.test(trimmed)) {
      out.push("<hr>");
      continue;
    }

    // Párrafo: junta líneas contiguas con <br>
    const previous = out[out.length - 1];
    if (previous?.startsWith("<p>") && previous.endsWith("</p>")) {
      out[out.length - 1] = `${previous.slice(0, -4)}<br>${inline(escapeHtml(trimmed))}</p>`;
    } else {
      out.push(`<p>${inline(escapeHtml(trimmed))}</p>`);
    }
  }

  closeList();
  return out.join("");
}
