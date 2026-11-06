import { expect, test } from 'bun:test';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createPartnerPublicGateway, partnerDocument } from '../src/lib/partner-public';
import { createHubGateway } from '../src/lib/hub-gateway';
const root = resolve(import.meta.dir, '../..');
const read = (path: string) => readFile(resolve(root, path));
const origin = 'https://hub.example.test';
test('external presentation contains only the current Partners document, no Hub navigation or other tools', async () => {
 const source = await readFile(resolve(root, 'index.html'), 'utf8');
 const page = partnerDocument(source);
 expect(page).toContain('<base href="/partners/">');
 expect(page).not.toContain('<html lang="es" data-hub-mail="true">');
 expect(page).toContain('Resumen Programa Partner');
 expect(page).toContain('Fee de Partner');
 for (const privateMarker of ['id="homeGrid"', 'id="acadTpl"', 'id="opTpl"', 'id="ppTpl"', 'dashboard-settings.js', 'DASHBOARD_SALES_URL']) expect(page).not.toContain(privateMarker);
 expect(partnerDocument(source.replace('Fee de Partner', 'Fee actualizado'))).toContain('Fee actualizado');
 expect(page).toContain("new URL('/partners/',base)");
 expect(page).not.toContain('gcampos-sketch.github.io');
});
test('missing, duplicate or incomplete templates fail closed', () => {
 for (const source of ['private Hub', '<template id="ppTpl"><head>', '<template id="ppTpl"><head></body></template><template id="ppTpl">']) expect(() => partnerDocument(source)).toThrow();
});
test('public Partners and its dependencies work without a login and never set an auth cookie', async () => {
 const gateway = createPartnerPublicGateway(read);
 for (const path of ['', 'brand-system.css', 'chapter-index.js', 'logoadereso.webp']) {
  const response = await gateway(new Request(origin + '/partners/' + path));
  expect(response?.status).toBe(200); expect(response?.headers.get('set-cookie')).toBeNull();
  expect(response?.headers.get('cache-control')).toBe('no-store');
  expect((await response!.arrayBuffer()).byteLength).toBeGreaterThan(0);
 }
 const head = await gateway(new Request(origin + '/partners/', { method: 'HEAD' }));
 expect(head?.status).toBe(200); expect(await head?.text()).toBe('');
});
test('public routing cannot select private files, endpoints or arbitrary templates', async () => {
 let reads = 0;
 const gateway = createPartnerPublicGateway(async () => { reads++; return new Uint8Array(); });
 for (const path of ['index.html', '.env', 'dashboard-settings.js', 'academy/index.html', '%2e%2e%2findex.html', 'assets/adereso-symbol.svg', 'api/hub/session']) {
  expect((await gateway(new Request(origin + '/partners/' + path)))?.status).toBe(404);
 }
 expect(reads).toBe(0);
 expect((await gateway(new Request(origin + '/partners/', { method: 'POST' })))?.status).toBe(405);
 expect((await gateway(new Request(origin + '/partners?vista=home')))?.headers.get('location')).toBe('/partners/?vista=home');
});
test('presentation parameters never grant access to the private Hub or change the served template', async () => {
 const publicGateway = createPartnerPublicGateway(read);
 const plain = await (await publicGateway(new Request(origin + '/partners/')))!.text();
 const changed = await (await publicGateway(new Request(origin + '/partners/?vista=dashboard&template=opTpl&access_token=forged')))!.text();
 expect(changed).toBe(plain);
 const privateGateway = createHubGateway({ verify: async () => null, read });
 expect((await privateGateway(new Request(origin + '/hub-content/index.html?vista=partners')))?.status).toBe(401);
 expect(await publicGateway(new Request(origin + '/hub-content/index.html'))).toBeNull();
});

test('static publication packages only the external document and visual dependencies', async () => {
 execFileSync('node', ['--experimental-strip-types', 'scripts/build-partners.mjs'], { cwd: root, stdio: 'pipe' });
 const files = (await readdir(resolve(root, 'partners-public'), { recursive: true })).filter(path => path !== 'partners').sort();
 expect(files).toEqual(['index.html', 'partners/brand-system.css', 'partners/chapter-index.js', 'partners/index.html', 'partners/logoadereso.webp']);
 const page = await readFile(resolve(root, 'partners-public/partners/index.html'), 'utf8');
 expect(page).toBe(partnerDocument(await readFile(resolve(root, 'index.html'), 'utf8')));
 expect(page).not.toContain('id="homeGrid"');
 expect(page).toContain('https://adereso-partners.onrender.com');
});
