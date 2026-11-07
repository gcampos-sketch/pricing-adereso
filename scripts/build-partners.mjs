// Run with Node 22+ and --experimental-strip-types. No secrets or dependencies required.
import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { roiDocument } from '../dashboard-sales/src/lib/roi-public.ts';
import { partnerDocument } from '../dashboard-sales/src/lib/partner-public.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = resolve(root, 'partners-public/partners');
await mkdir(destination, { recursive: true });
await writeFile(resolve(destination, 'index.html'), partnerDocument(await readFile(resolve(root, 'index.html'), 'utf8')));
for (const file of ['brand-system.css', 'chapter-index.js', 'logoadereso.webp']) await copyFile(resolve(root, file), resolve(destination, file));
await writeFile(resolve(root, 'partners-public/index.html'), '<!DOCTYPE html><html lang="es"><meta charset="utf-8"><title>Partners · Adereso</title><script>location.replace("/partners/"+location.search+location.hash)</script><a href="/partners/">Abrir Partners</a></html>');
console.log('Built public Partners presentation and three visual assets only.');

const roiDestination=resolve(root,'partners-public/roi');
await mkdir(roiDestination,{recursive:true});
await writeFile(resolve(roiDestination,'index.html'),roiDocument(await readFile(resolve(root,'index.html'),'utf8'),await readFile(resolve(root,'roi-standalone.js'),'utf8')));
for(const file of ['brand-system.css','logoadereso.webp'])await copyFile(resolve(root,file),resolve(roiDestination,file));
console.log('Built isolated public ROI calculator.');
