import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.argv[2]||'_site';
const allowed=new Set(['index.html','404.html',...['academy','playbook','operativa','argumentaciones','dashboard','pricing','partners','roi'].map(x=>x+'/index.html')]);
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(dir,x.name)):[path.join(dir,x.name)]);}
const files=walk(root).map(x=>path.relative(root,x)).sort();assert.deepEqual(files,[...allowed].sort(),'Pages must not publish Hub source files or internal content');
for(const file of files){const html=fs.readFileSync(path.join(root,file),'utf8');assert.ok(html.includes('data-hub-moved'));assert.ok(!html.includes('pbTpl'));assert.ok(html.includes('https://adereso-hub-comercial.onrender.com/'));}
console.log(JSON.stringify({redirectPages:files.length,privateHubFiles:0}));
