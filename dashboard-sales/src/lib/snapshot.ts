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
async function renderBlockPng(headEl: HTMLElement): Promise<Blob> {
  const html2canvas = (await import("html2canvas-pro")).default;
  const parent = headEl.parentElement;
  if (!parent) throw Error("Sección no disponible");

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
  if (!Number.isFinite(top) || bottom <= top) throw Error("Sección vacía");

  const background = bg();
  const parentRect = parent.getBoundingClientRect();
  const x = Math.max(0, left - parentRect.left - 20);
  const y = Math.max(0, top - parentRect.top - 20);
  // Render only this section, rather than allocating a canvas for the whole dashboard.
  const out = await html2canvas(parent, {
    backgroundColor: background, scale: 2, useCORS: true,
    x, y,
    width: Math.ceil(Math.min(parentRect.width - x, right - left + 40)),
    height: Math.ceil(Math.min(parentRect.height - y, bottom - top + 40)),
    ignoreElements: element => element.hasAttribute("data-capture-ignore"),
  });

  return canvasPng(out);
}

async function renderElementPng(element: HTMLElement): Promise<Blob> {
  const html2canvas = (await import("html2canvas-pro")).default;
  const surface = element.closest(".modal") ?? document.body;
  const canvas = await html2canvas(element, {
    backgroundColor: getComputedStyle(surface).backgroundColor,
    scale: 2,
    ignoreElements: node => node.hasAttribute("data-capture-ignore"),
  });
  return canvasPng(canvas);
}

async function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw Error("No se pudo generar el PNG");
  return blob;
}

/** Start the clipboard write within the click gesture, including browsers that require it. */
async function copyPng(render: () => Promise<Blob>): Promise<boolean> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return false;
  try {
    const png = render();
    // Observe rendering failures even if permission is rejected before the browser awaits the blob.
    void png.catch(() => {});
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    return true;
  } catch {
    return false;
  }
}

export function copyBlockImage(headEl: HTMLElement) {
  return copyPng(() => renderBlockPng(headEl));
}

export function copyElementImage(element: HTMLElement) {
  return copyPng(() => renderElementPng(element));
}
