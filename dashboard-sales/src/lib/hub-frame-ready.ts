/** The private document owns its visual readiness; iframe load alone is too early. */
export async function waitForHubFrame(frame: HTMLIFrameElement): Promise<void> {
  const child = frame.contentWindow as (Window & { aderesoHubReady?: Promise<void> }) | null;
  if (!frame.contentDocument?.getElementById('homeView') || !child?.aderesoHubReady) {
    throw new Error('Hub document did not initialize');
  }
  await child.aderesoHubReady;
}
