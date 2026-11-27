import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { walletSources } from '../src/lib/wallet-public';

const hub = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const source = hub.slice(hub.indexOf('const EMAIL_FREE_QUANTITY='), hub.indexOf('function waService()'));

const initialPricingState = hub.slice(hub.indexOf('const state={'), hub.indexOf('/* Hub navigation persistence:'));
const channelCatalog = hub.slice(hub.indexOf('const CHANNELS='), hub.indexOf('const SECTIONS='));
const channelRenderer = hub.slice(hub.indexOf('function renderOpts()'), hub.indexOf("document.addEventListener('click',e=>{const b=e.target.closest('[data-soon-tg]')"));

function calculator() {
  const initial = runInNewContext(initialPricingState + ';INITIAL_STATE');
  const state = {
    ...initial,
    existing: false,
    desk: true,
    studio: true,
    scope: 'bolsa',
    communicationMode: 'both',
    engage: false,
    out: { ...initial.out },
    humanVoiceMinutes: 7500,
    voiceMinutes: 12350,
  };
  const channels = { innerHTML: '' };
  const pricing = runInNewContext(source + walletSources(hub).formulas + channelCatalog + channelRenderer
    + ';({ emailOutboundPack, voicePack, VOICE_POOLS, selectedEmailPack, selectedVoicePools, outboundMonthly, waCalls, sipOutboundActive, renderOpts })', {
    state,
    document: { getElementById: () => channels },
    paintIcons: () => {},
    hasExistingDesk: () => state.existing && state.hasDeskContracted,
    hasService: () => state.desk || state.studio,
  });
  return { state, pricing, channels };
}

test('mass email accepts exact tiers and applies a 15% surcharge to extra sends', () => {
  const { pricing } = calculator();
  expect(pricing.emailOutboundPack(1000)).toEqual({ quantity: 1000, monthly: 0, overage: null });
  for (const quantity of [null, 999, 1001, 35000, 1000001]) {
    expect(pricing.emailOutboundPack(quantity)).toBeNull();
  }
  for (const [quantity, monthly, overage] of [
    [10000, 29, .003335], [20000, 49, .0028175], [50000, 89, .002047],
    [100000, 139, .0015985], [250000, 279, .0012834],
    [500000, 499, .0011477], [1000000, 990, .0011385],
  ]) {
    expect(pricing.emailOutboundPack(quantity)).toEqual({ quantity, monthly, overage });
  }
});

test('human and IA voice use independent volume tiers and overage rates', () => {
  const { pricing } = calculator();
  const [human, ai] = pricing.VOICE_POOLS;
  for (const quantity of [null, 0, -1, 1, 1.5, 1250, 1999, 2000.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    expect(pricing.voicePack(quantity, human.tiers)).toBeNull();
    expect(pricing.voicePack(quantity, ai.tiers)).toBeNull();
  }
  for (const [quantity, humanMonthly, aiMonthly] of [
    [2000, 60, 360],
    [4999, 149.97, 899.82], [5000, 140, 850], [10000, 260, 1600], [20000, 480, 3000],
    [35000, 805, 4900], [50000, 1100, 6500], [100000, 2000, 12000], [125000, 2500, 15000],
  ]) {
    expect(pricing.voicePack(quantity, human.tiers).monthly).toBe(humanMonthly);
    expect(pricing.voicePack(quantity, ai.tiers).monthly).toBe(aiMonthly);
  }
  expect(pricing.voicePack(7500, human.tiers)).toMatchObject({ baseTier: 5000, rate: .028, monthly: 210, overage: .0322 });
  expect(pricing.voicePack(12350, ai.tiers)).toMatchObject({ baseTier: 10000, rate: .16, monthly: 1976, overage: .184 });
});

test('any call mode quotes both shared packs at or above the 2,000-minute floor', () => {
  const { state, pricing } = calculator();
  expect(pricing.selectedVoicePools()).toHaveLength(0);
  state.engage = true;
  state.out.wacall = true;
  for (const attention of ['human', 'ai', 'both']) {
    state.callAttention = attention;
    expect(pricing.selectedVoicePools().map(({ kind }: { kind: string }) => kind)).toEqual(['human', 'ai']);
    expect(pricing.outboundMonthly()).toBe(2186);
    expect(pricing.waCalls()).toBe(true);
  }
  state.out.sip = true;
  expect(pricing.outboundMonthly()).toBe(2186);
  state.humanVoiceMinutes = 1999;
  expect(pricing.selectedVoicePools()[0].pack).toBeNull();
  state.engage = false;
  expect(pricing.selectedVoicePools()).toHaveLength(2);
  expect(pricing.waCalls()).toBe(false);
  state.communicationMode = 'text';
  expect(pricing.selectedVoicePools()).toHaveLength(0);
  expect(pricing.outboundMonthly()).toBe(0);
});

test('mass email is priced only when explicitly selected under Engage', () => {
  const { state, pricing } = calculator();
  state.engage = true;
  expect(pricing.selectedEmailPack()).toBeNull();
  state.out.correo = true;
  expect(pricing.selectedEmailPack()).toMatchObject({ quantity: 1000, monthly: 0 });
  state.emailQuantity = 20000;
  expect(pricing.outboundMonthly()).toBe(49);
  state.emailQuantity = 35000;
  expect(pricing.selectedEmailPack()).toBeNull();
  state.engage = false;
  expect(pricing.outboundMonthly()).toBe(0);
});

test('a new quote starts with every available inbound channel unselected', () => {
  const { pricing, channels } = calculator();
  pricing.renderOpts();
  const inbound = [...channels.innerHTML.matchAll(/data-chan="([^"]+)" aria-pressed="([^"]+)"/g)];
  expect(inbound.map(match => match[1])).toEqual([
    'whatsapp', 'webchat', 'instagram', 'facebook', 'correo', 'linkedin', 'x', 'tiktok', 'app_store', 'google_play',
  ]);
  expect(inbound.every(match => match[2] === 'false')).toBe(true);
});

test('WhatsApp and email outbound require Engage and SIP can use Desk or Studio', () => {
  const { state, pricing, channels } = calculator();
  pricing.renderOpts();
  expect(channels.innerHTML).toContain('data-chan="correo"');
  expect(channels.innerHTML).toContain('Canales de salida');
  expect(channels.innerHTML).toContain('Requiere Engage');
  expect(channels.innerHTML).not.toMatch(/data-out="(?:correo|whatsapp|wacall)"/);
  state.engage = true;
  pricing.renderOpts();
  expect(channels.innerHTML).toContain('Canales de salida');
  expect(channels.innerHTML).toContain('data-out="correo"');
  expect(channels.innerHTML).toContain('data-out="wacall"');
  state.engage = false;
  pricing.renderOpts();
  expect(channels.innerHTML).toContain('Canales de salida');
  expect(channels.innerHTML).toContain('Requiere Engage');
  expect(channels.innerHTML).not.toMatch(/data-out="(?:correo|whatsapp|wacall)"/);
  expect(channels.innerHTML).toContain('data-out="sip"');
  state.desk = false;
  state.studio = false;
  state.hasStudioContracted = true;
  state.existing = true;
  state.hasDeskContracted = false;
  pricing.renderOpts();
  expect(channels.innerHTML).toContain('data-out="sip"');
});

test('WhatsApp and SIP put independent attention selectors inside their selected cards', () => {
  const { state, pricing, channels } = calculator();
  state.engage = true;
  pricing.renderOpts();
  expect(channels.innerHTML).not.toContain('data-call-attention');
  state.out.wacall = true;
  state.callAttention = 'both';
  pricing.renderOpts();
  state.out.sip = true;
  state.sipCallAttention = 'human';
  pricing.renderOpts();
  const cards = [...channels.innerHTML.matchAll(/<div class="chan on paid call-channel">([\s\S]+?)<\/div>/g)];
  expect(cards).toHaveLength(2);
  expect(cards[0][1]).toMatch(/data-out="wacall"[\s\S]+?<select data-call-attention="wacall">/);
  expect(cards[0][1]).toContain('<option value="both" selected');
  expect(cards[1][1]).toMatch(/data-out="sip"[\s\S]+?<select data-call-attention="sip">/);
  expect(cards[1][1]).toContain('<option value="human" selected');
  state.studio = false;
  pricing.renderOpts();
  expect(channels.innerHTML).not.toMatch(/<option value="(?:ai|both)"/);
  expect(channels.innerHTML.match(/<option value="human" selected/g)).toHaveLength(2);
  expect(pricing.selectedVoicePools().map(({ kind }: { kind: string }) => kind)).toEqual(['human']);
  expect(pricing.outboundMonthly()).toBe(210);
});

test('existing customers can add outbound packs using contracted Desk and Studio', () => {
  const { state, pricing, channels } = calculator();
  Object.assign(state, { existing: true, desk: false, studio: false, engage: true });
  pricing.renderOpts();
  expect(channels.innerHTML).toContain('WhatsApp Call');
  expect(channels.innerHTML).toContain('Correo masivo');
  expect(channels.innerHTML).toContain('1.000 gratis/mes');
  expect(channels.innerHTML).not.toContain('Canales de entrada');

  state.out.correo = true;
  expect(pricing.selectedEmailPack()).toMatchObject({ quantity: 1000, monthly: 0 });
  state.emailQuantity = 20000;
  expect(pricing.outboundMonthly()).toBe(49);

  state.out.wacall = true;
  state.callAttention = 'both';
  expect(pricing.waCalls()).toBe(true);
  pricing.renderOpts();
  expect(channels.innerHTML).not.toMatch(/<option value="(?:ai|both)"/);
  expect(pricing.selectedVoicePools().map(({ kind }: { kind: string }) => kind)).toEqual(['human']);
  state.hasStudioContracted = true;
  pricing.renderOpts();
  expect(channels.innerHTML).toContain('<option value="both" selected');
  expect(pricing.selectedVoicePools()).toHaveLength(2);
  expect(pricing.outboundMonthly()).toBe(2235);

  state.engage = false;
  pricing.renderOpts();
  expect(channels.innerHTML).toContain('data-out="sip"');
  expect(channels.innerHTML).not.toContain('data-out="wacall"');
  expect(pricing.outboundMonthly()).toBe(0);
});

test('voice packs are customizable and email displays only fixed choices', () => {
  const gridSource = hub.slice(hub.indexOf('function volumeTile('), hub.indexOf('function conversationNumber('));
  const tiles = runInNewContext(source + gridSource + `;
    ({
      human: outboundVolumeGrid('voice-human', 'minutos', VOICE_POOLS[0].tiers, 3000),
      ai: outboundVolumeGrid('voice', 'minutos', VOICE_POOLS[1].tiers, 5000),
      email: outboundVolumeGrid('email', 'envíos', [[EMAIL_FREE_QUANTITY, 0], ...EMAIL_PACKS], 1000)
    })
  `);
  expect(tiles.human).toContain('class="vtile vtile-in sel"');
  expect(tiles.human).toContain('Bolsa personalizada: 3.000 minutos');
  expect(tiles.human).toContain('data-out-qty="voice-human" min="2000"');
  expect(tiles.ai).toContain('data-out-pack="voice" data-qty="5000" aria-pressed="true"');
  expect(tiles.ai).toContain('Otra cantidad');
  expect([...tiles.email.matchAll(/data-out-pack="email"/g)]).toHaveLength(8);
  expect(tiles.email).toContain('data-out-pack="email" data-qty="1000" aria-pressed="true"');
  expect(tiles.email).not.toMatch(/data-out-edit|data-out-qty|Otra cantidad/);
});

test('private email and Studio price tables stay outside the public Meta wallet', () => {
  const { formulas, calculator } = walletSources(hub);
  expect(formulas + calculator).not.toMatch(/EMAIL_PACKS|VOICE_POOLS|function voicePack/);
});

test('a voice upgrade credits only the selected voice pack, even when both are quoted', () => {
  const { state, pricing } = calculator();
  Object.assign(state, { existing: true, engage: true, callAttention: 'both' });
  state.out.wacall = true;
  state.voiceUpgrades['voice-human'] = { active: true, pay: null };
  expect(pricing.selectedVoicePools()[0].additional).toBeNull();
  state.voiceUpgrades['voice-human'].pay = 60;
  expect(pricing.selectedVoicePools()[0]).toMatchObject({ additional: 150, credit: 60, upgrading: true });
  expect(pricing.outboundMonthly()).toBe(2126);
  state.voiceUpgrades['voice-human'].active = false;
  expect(pricing.outboundMonthly()).toBe(2186);
});

test('channel mode reveals the chosen groups in consistent direction and type order', () => {
  const { state, pricing, channels } = calculator();
  const headings = () => [...channels.innerHTML.matchAll(/<h[34][^>]*>([^<]+)<\/h[34]>/g)].map(([, title]) => title);
  state.engage = true;
  state.communicationMode = runInNewContext(initialPricingState + ';INITIAL_STATE.communicationMode');
  pricing.renderOpts();
  expect([...channels.innerHTML.matchAll(/data-communication-mode="[^"]+" aria-pressed="false"/g)]).toHaveLength(3);
  expect(channels.innerHTML).not.toContain('class="channel-panel"');

  state.communicationMode = 'text';
  pricing.renderOpts();
  expect(headings()).toEqual(['Canales de entrada', 'Texto', 'Canales de salida', 'Texto']);
  expect(channels.innerHTML).toContain('data-out="correo"');
  expect(channels.innerHTML).not.toMatch(/data-out="(?:sip|wacall)"/);

  state.communicationMode = 'voice';
  pricing.renderOpts();
  expect(headings()).toEqual([
    'Canales de entrada', 'Llamadas', 'Canales de salida', 'Llamadas',
  ]);
  expect(channels.innerHTML).toContain('data-out="wacall"');
  expect(channels.innerHTML).toContain('data-out="sip"');
  expect(channels.innerHTML).not.toContain('data-chan=');
  expect(channels.innerHTML).not.toContain('data-out="correo"');
  expect(channels.innerHTML).toContain('No disponible');

  state.communicationMode = 'both';
  pricing.renderOpts();
  expect(headings()).toEqual([
    'Canales de entrada', 'Texto', 'Llamadas', 'Canales de salida', 'Texto', 'Llamadas',
  ]);
  expect(channels.innerHTML).toContain('data-out="wacall"');
  expect(channels.innerHTML).toContain('data-chan="correo"');
});

test('SIP saliente is independent of WhatsApp and its Meta wallet', () => {
  const { state, pricing, channels } = calculator();
  state.communicationMode = 'voice';
  state.out.sip = true;
  pricing.renderOpts();
  expect(channels.innerHTML).toContain('data-out="sip" aria-pressed="true"');
  expect(channels.innerHTML).toContain('precio a confirmar');
  expect(pricing.sipOutboundActive()).toBe(true);
  expect(pricing.waCalls()).toBe(false);
  expect(pricing.selectedVoicePools()).toHaveLength(2);
  state.studio = false;
  pricing.renderOpts();
  expect(channels.innerHTML).toContain('<option value="human" selected');
  expect(pricing.sipOutboundActive()).toBe(true);
  state.desk = false;
  expect(pricing.sipOutboundActive()).toBe(false);
});

test('voice and inbound conversation volume start with the 2,000 tiles selected', () => {
  const { state } = calculator();
  const initial = runInNewContext(initialPricingState + ';INITIAL_STATE');
  Object.assign(state, initial, { communicationMode: 'both', out: { ...initial.out, sip: true } });
  const gridSource = hub.slice(hub.indexOf('function volumeTile('), hub.indexOf('function conversationNumber('));
  const volumeRenderer = hub.slice(hub.indexOf('function renderOutboundVolume()'), hub.indexOf('function updateOutboundQuantity('));
  const area = { innerHTML: '' };
  const walletNote = { hidden: false };
  const { volGrid, renderOutboundVolume } = runInNewContext(source + gridSource + volumeRenderer + ';({ volGrid, renderOutboundVolume })', {
    state,
    TILES: [2000, 3000],
    document: { getElementById: (id: string) => id === 'volumeWalletNote' ? walletNote : area },
    hasExistingDesk: () => false,
    hasService: () => true,
    renderOutboundQuote: () => {},
  });
  renderOutboundVolume();
  expect(area.innerHTML).toContain('data-out-pack="voice-human" data-qty="2000" aria-pressed="true"');
  expect(area.innerHTML).toContain('data-out-pack="voice" data-qty="2000" aria-pressed="true"');
  expect(walletNote.hidden).toBe(true);
  expect(volGrid(state.volMode === 'custom')).toContain('data-vol="2000" aria-pressed="true"');
});

test('the summary shows selected overages independently and explains the Free limit', () => {
  const summary = hub.slice(hub.indexOf('function usageOverageSummary('), hub.indexOf('function renderSummary('));
  const markup = runInNewContext(source + summary + `;({
    all: usageOverageSummary({ split: true, desk: .10051, studio: .122245, total: .222755 }, [
      { ...VOICE_POOLS[0], pack: voicePack(2000, VOICE_POOLS[0].tiers) },
      { ...VOICE_POOLS[1], pack: voicePack(2000, VOICE_POOLS[1].tiers) }
    ], emailOutboundPack(10000)),
    desk: usageOverageSummary({ split: false, desk: .1005, studio: null, total: .1005 }, [], null),
    studio: usageOverageSummary({ split: false, desk: null, studio: .1222, total: .1222 }, [], null),
    free: usageOverageSummary(null, [], emailOutboundPack(1000))
  })`);
  expect(markup.all).toContain('Conversaciones · Desk + Studio');
  expect(markup.all).toContain('USD 0,222755');
  expect(markup.all).toContain('USD 0,0345');
  expect(markup.all).toContain('USD 0,207');
  expect(markup.all).toContain('USD 0,003335');
  expect(markup.all).toContain('Por envío adicional');
  expect(markup.desk).toContain('Conversaciones · Desk');
  expect(markup.desk).not.toContain('Studio');
  expect(markup.studio).toContain('Conversaciones · Studio');
  expect(markup.studio).not.toContain('Desk');
  expect(markup.free).toContain('Requiere una bolsa pagada');
  expect(markup.free).toContain('Sobre 1.000 envíos al mes');
});

test('the quote reveals downstream steps after choosing a channel mode', () => {
  const { state } = calculator();
  const navigation = hub.slice(hub.indexOf('function volumeVisible()'), hub.indexOf('function buildNav('));
  const flow = runInNewContext(source + navigation + ';({ activeSections, volumeVisible })', {
    state,
    SECTIONS: ['s0', 's1', 'sc', 's2', 's4', 's3', 'sp', 's5', 's6', 's7', 's8'],
    hasService: () => state.desk || state.studio,
    hasExistingDesk: () => state.existing && state.hasDeskContracted,
    conversationTarget: () => state.desk ? 'desk' : state.studio ? 'studio' : '',
    scopeBag: () => true,
    implVisible: () => state.desk || state.studio,
    waActive: () => state.walletOnly,
  });

  state.communicationMode = '';
  expect(flow.activeSections()).toEqual(['s1', 'sc']);
  expect(flow.volumeVisible()).toBe(false);
  for (const mode of ['text', 'voice', 'both']) {
    state.communicationMode = mode;
    expect(flow.activeSections()).toContain('s2');
    expect(flow.activeSections()).toContain('s5');
  }

  Object.assign(state, { communicationMode: '', existing: true, desk: false, studio: false });
  expect(flow.activeSections()).toEqual(['s0', 's1', 'sc']);
  state.walletOnly = true;
  expect(flow.activeSections()).toContain('s4');
  expect(flow.activeSections()).not.toContain('s2');
});
