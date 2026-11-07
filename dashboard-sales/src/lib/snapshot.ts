/** Utilidades de portapapeles: imagen de una sección y texto de tablas. */

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function bg() {
  const body = getComputedStyle(document.body).backgroundColor;
  return body && body !== "rgba(0, 0, 0, 0)" ? body : "#0b0d12";
}

/**
 * Captura el bloque que arranca en `headEl` (título de sección) y termina antes
 * del siguiente título, y lo deja como PNG en el portapapeles.
 */
export async function copyBlockImage(headEl: HTMLElement) {
  const html2canvas = (await import("html2canvas-pro")).default;
  const parent = headEl.parentElement;
  if (!parent) return false;

  const nodes: HTMLElement[] = [headEl];
  let cursor = headEl.nextElementSibling as HTMLElement | null;
  while (cursor && !cursor.hasAttribute("data-section-head")) {
    nodes.push(cursor);
    cursor = cursor.nextElementSibling as HTMLElement | null;
  }

  let top = Infinity;
  let bottom = -Infinity;
  let left = Infinity;
  let right = -Infinity;
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (!rect.width && !rect.height) continue;
    top = Math.min(top, rect.top);
    bottom = Math.max(bottom, rect.bottom);
    left = Math.min(left, rect.left);
    right = Math.max(right, rect.right);
  }
  if (!Number.isFinite(top) || bottom <= top) return false;

  const background = bg();
  const parentRect = parent.getBoundingClientRect();
  const canvas = await html2canvas(parent, { backgroundColor: background, scale: 2, useCORS: true });
  const k = canvas.width / parentRect.width;
  const pad = 20 * k;

  const sx = Math.max(0, (left - parentRect.left) * k - pad);
  const sy = Math.max(0, (top - parentRect.top) * k - pad);
  const sw = Math.min(canvas.width - sx, (right - left) * k + pad * 2);
  const sh = Math.min(canvas.height - sy, (bottom - top) * k + pad * 2);

  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(sw));
  out.height = Math.max(1, Math.round(sh));
  const ctx = out.getContext("2d");
  if (!ctx) return false;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);

  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
  if (!blob) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    // Fallback: descarga el PNG si el navegador bloquea la escritura de imágenes.
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "captura.png";
    link.click();
    URL.revokeObjectURL(url);
    return true;
  }
}
