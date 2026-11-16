import { test,expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { load } from 'cheerio';
const source=readFileSync(new URL('../../brochure-releases.js',import.meta.url),'utf8');
const catalogue=JSON.parse(readFileSync(new URL('../../brochure-releases.json',import.meta.url),'utf8'));
const start=source.indexOf('const visuals={'),end=source.indexOf('\n function select',start);
const visuals=runInNewContext(source.slice(start,end)+'\nvisuals;') as Record<string,string>;
test('every published announcement has a visible illustrative example, not an empty visual card',()=>{
 for(const release of catalogue.releases){
  const $=load(visuals[release.visual]??'');
  expect($('.br-release-example').length).toBe(1);
  expect($('.br-release-example b').text().trim().length).toBeGreaterThan(10);
  expect($('.br-release-example').text().trim().length).toBeGreaterThan(80);
  expect($('script,iframe,form,input').length).toBe(0);
 }
});
test('examples preserve public launch limits on comments, recovery and chat progress',()=>{
 expect(load(visuals['internal-notes']!).text()).toContain('tester sigue pendiente');
 expect(load(visuals.recovery!).text()).toContain('Finalizar sin enviar');
 expect(load(visuals.progress!).text()).toContain('nuevo Chat Web');
});
