import {build} from '../dashboard-sales/node_modules/esbuild/lib/main.js';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
await build({absWorkingDir:root,entryPoints:['scripts/brochure-pdf.entry.js'],outfile:'brochure-pdf.js',bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,legalComments:'eof'});
console.log('Brochure PDF renderer built from the installed html2canvas-pro dependency.');
