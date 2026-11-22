import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const start = html.indexOf('/* Hub navigation persistence:');
const source = html.slice(start, html.indexOf('/* End Hub navigation persistence. */', start));
const tools = ['pricing', 'descuentos', 'playbook', 'academy', 'operativa', 'argumentos', 'progpartners'].map(view => ({ k: view, view })).concat([
  { k: 'dashboard', view: 'embed' }, { k: 'crm', view: 'embed' },
]);
const context = { URL, URLSearchParams, resolveHubNavigation: undefined as any };
runInNewContext(source, context);
const restore = (saved: unknown, search = '') => JSON.parse(JSON.stringify(context.resolveHubNavigation(saved, tools, search)));

test('refresh restores every Hub page, including the exact embedded tool', () => {
  for (const tool of tools) {
    const saved = { view: tool.view, tool: tool.k, y: 340 };
    expect(restore(saved)).toEqual({ view: tool.view, tool: tool.view === 'embed' ? tool.k : '', y: 340 });
  }
  expect(restore({ view: 'home', y: 90 })).toEqual({ view: 'home', tool: '', y: 90 });
});

test('the current address wins over a previous page and preserves matching scroll', () => {
  expect(restore({ view: 'pricing', y: 400 }, '?hubView=playbook')).toEqual({ view: 'playbook', tool: '', y: 0 });
  expect(restore({ view: 'embed', tool: 'dashboard', y: 20 }, '?hubView=embed&hubTool=dashboard')).toEqual({ view: 'embed', tool: 'dashboard', y: 20 });
  expect(restore({ view: 'pricing' }, '?vista=dashboard&hubView=operativa').view).toBe('operativa');
  expect(restore({ view: 'pricing' }, '?vista=partners&hubView=pricing').view).toBe('progpartners');
});

test('unknown tools and malformed saved navigation never select an arbitrary frame', () => {
  for (const value of [null, {}, { view: 'bad' }, { view: 'embed', tool: 'https://example.com' }]) {
    expect(restore(value).view).toBe('home');
  }
});

test('navigation is saved immediately to this tab and both frame and outer address', () => {
  const stored = new Map<string, string>();
  const updates: string[] = [];
  const frame: any = { location: { search: '', href: 'https://hub.example/hub-content/index.html' }, history: { state: { router: true }, replaceState: (_: unknown, _title: string, url: URL) => updates.push(url.href) }, scrollY: 42 };
  const outer: any = { location: { href: 'https://hub.example/?keep=1' }, history: frame.history, document: { querySelector: () => ({ contentWindow: frame }) } };
  runInNewContext(source + '\nsaveHubNavigation();', { URL, URLSearchParams, curView: 'embed', curTool: 'crm', window: frame, parent: outer, location: frame.location, document: {}, sessionStorage: { setItem: (k: string, v: string) => stored.set(k, v) } });
  expect(JSON.parse(stored.get('adereso_hub_navigation_v1')!)).toEqual({ view: 'embed', tool: 'crm', y: 42 });
  expect(updates).toEqual(['https://hub.example/hub-content/index.html?hubView=embed&hubTool=crm', 'https://hub.example/?keep=1&hubView=embed&hubTool=crm']);
});

test('fresh tabs tolerate unfinished menu entries without a view',()=>{
 const incomplete=[...tools,{k:'pending'}];
 for(const saved of [null,undefined,{},17]){
  expect(context.resolveHubNavigation(saved,incomplete,'?hubView=pricing')).toEqual({view:'pricing',tool:'',y:0});
  expect(context.resolveHubNavigation(saved,incomplete,'')).toEqual({view:'home',tool:'',y:0});
 }
});


test('Brochure stays visibly under construction while its published content remains accessible', () => {
  const toolSource = html.match(/\{k:'brochure',name:'Brochure'[^\n]+/)! [0].replace(/,$/, '');
  const brochure = runInNewContext('(' + toolSource + ')');
  expect(brochure.construction).toBe(true);
  expect(brochure.openWhileBuilding).toBe(true);
  const grid = { innerHTML: '', addEventListener() {} };
  const renderStart = html.indexOf('function homeCard(');
  const render = html.slice(renderStart, html.indexOf('function setView(', renderStart));
  runInNewContext(render + ';renderHome();', {
    document: { getElementById: () => grid }, TOOLS: [{g:'Para reunión',items:[brochure]}],
    hgClosed: () => [], tIco: () => '', paintIcons: () => {}, homeConstruction: () => '<span>worksite</span>'
  });
  expect(grid.innerHTML).toContain('hg-card  construction');
  expect(grid.innerHTML).toContain('worksite');
  expect(grid.innerHTML).toContain('En construcción');
  expect(grid.innerHTML).not.toContain('aria-disabled');
  const start = html.indexOf("document.addEventListener('click',e=>{const b=e.target.closest('button[data-tool]')");
  const listener = html.slice(start, html.indexOf('});', start)+3);
  let click: any; const opened: string[] = [];
  runInNewContext(listener, {
    document: { addEventListener: (_:string, cb:any) => {click=cb;} },
    ALL_TOOLS: [brochure, {k:'blocked',view:'blocked',construction:true}],
    goView: (view:string) => opened.push(view), window: {open:()=>{throw Error('unexpected external navigation')}}
  });
  for (const key of ['brochure','blocked']) click({target:{closest:()=>({dataset:{tool:key}})}});
  expect(opened).toEqual(['brochure']);
});
