/** Expand over the source card; shift only enough to clear a viewport edge. */
export function popupOverTrigger(
  trigger: { left: number; top: number; width: number; height: number },
  popup: { width: number; height: number },
  viewport: { width: number; height: number },
  padding = 12,
) {
  const width = Math.min(popup.width, Math.max(0, viewport.width - padding * 2));
  const height = Math.min(popup.height, Math.max(0, viewport.height - padding * 2));
  const left = Math.max(padding, Math.min(trigger.left, viewport.width - padding - width));
  const top = Math.max(padding, Math.min(trigger.top, viewport.height - padding - height));
  return { left, top, width, height };
}
