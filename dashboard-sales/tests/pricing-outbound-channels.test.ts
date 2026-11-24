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
    engage: false,
    out: { correo: false, wacall: false },
    callAttention: '',
    emailPlan: 'free',
    emailQuantity: 35000,
    humanVoiceMinutes: 7500,
    voiceMinutes: 12350,
  };
  const channels = { innerHTML: '' };
  const pricing = runInNewContext(source + walletSources(hub).formulas + channelCatalog + channelRenderer
    + ';({ emailOutboundPack, voicePack, VOICE_POOLS, selectedEmailPack, selectedVoicePools, outboundMonthly, waCalls, renderOpts })', {
    state,
    document: { getElementById: () => channels },
    paintIcons: () => {},
    hasExistingDesk: () => state.existing && state.hasDeskContracted,
    hasService: () => state.desk || state.studio,
  });
  return { state, pricing, channels };
}

test('outbound email switches from Free to the published paid tiers', () => {
  const { pricing } = calculator();
  expect(pricing.emailOutboundPack(1000).monthly).toBe(0);
  expect(pricing.emailOutboundPack(1001).monthly).toBe(2.90);
  for (const [quantity, monthly] of [[10000, 29], [20000, 49], [50000, 89], [100000, 139], [250000, 279], [500000, 499], [1000000, 990]]) {
    expect(pricing.emailOutboundPack(quantity).monthly).toBe(monthly);
  }
  expect(pricing.emailOutboundPack(35000)).toMatchObject({ baseTier: 20000, monthly: 85.75 });
});

test('human and IA voice use independent volume tiers and overage rates', () => {
  const { pricing } = calculator();
  const [human, ai] = pricing.VOICE_POOLS;
  for (const quantity of [null, 0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    expect(pricing.voicePack(quantity, human.tiers)).toBeNull();
    expect(pricing.voicePack(quantity, ai.tiers)).toBeNull();
  }
  for (const [quantity, humanMonthly, aiMonthly] of [
    [1, .03, .18], [1250, 37.5, 225], [1999, 59.97, 359.82], [2000, 60, 360],
    [4999, 149.97, 899.82], [5000, 140, 850], [10000, 260, 1600], [20000, 480, 3000],
    [35000, 805, 4900], [50000, 1100, 6500], [100000, 2000, 12000], [125000, 2500, 15000],
  ]) {
    expect(pricing.voicePack(quantity, human.tiers).monthly).toBe(humanMonthly);
    expect(pricing.voicePack(quantity, ai.tiers).monthly).toBe(aiMonthly);
  }
  expect(pricing.voicePack(7500, human.tiers)).toMatchObject({ baseTier: 5000, rate: .028, monthly: 210, overage: .0322 });
  expect(pricing.voicePack(12350, ai.tiers)).toMatchObject({ baseTier: 10000, rate: .16, monthly: 1976, overage: .184 });
});

test('each selected call mode requires the corresponding pack in addition to Meta', () => {
  const { state, pricing } = calculator();
  expect(pricing.selectedVoicePools()).toHaveLength(0);
  state.engage = true;
  state.out.wacall = true;
  state.callAttention = 'human';
  expect(pricing.selectedVoicePools().map(({ kind }: { kind: string }) => kind)).toEqual(['human']);
  expect(pricing.outboundMonthly()).toBe(210);
  expect(pricing.waCalls()).toBe(true);
  state.callAttention = 'ai';
  expect(pricing.selectedVoicePools().map(({ kind }: { kind: string }) => kind)).toEqual(['ai']);
  expect(pricing.outboundMonthly()).toBe(1976);
  state.callAttention = 'both';
  expect(pricing.selectedVoicePools().map(({ kind }: { kind: string }) => kind)).toEqual(['human','ai']);
  expect(pricing.outboundMonthly()).toBe(2186);
  state.humanVoiceMinutes = 1000;
  expect(pricing.selectedVoicePools()[0].pack.monthly).toBe(30);
  expect(pricing.outboundMonthly()).toBe(2006);
  state.humanVoiceMinutes = 0;
  expect(pricing.selectedVoicePools()[0].pack).toBeNull();
  state.engage = false;
  expect(pricing.selectedVoicePools()).toHaveLength(0);
  expect(pricing.outboundMonthly()).toBe(0);
  expect(pricing.waCalls()).toBe(false);
});

test('mass email is priced only when explicitly selected under Engage', () => {
  const { state, pricing } = calculator();
  state.engage = true;
  expect(pricing.selectedEmailPack()).toBeNull();
  state.out.correo = true;
  expect(pricing.selectedEmailPack()).toMatchObject({ quantity: 1000, monthly: 0 });
  state.emailPlan = 'paid';
  expect(pricing.outboundMonthly()).toBe(85.75);
  state.engage = false;
  expect(pricing.outboundMonthly()).toBe(0);
});

test('a new quote starts with every available inbound channel unselected', () => {
  const { pricing, channels } = calculator();
  pricing.renderOpts();
  const inbound = [...channels.innerHTML.matchAll(/data-chan="([^"]+)" aria-pressed="([^"]+)"/g)];
  expect(inbound.map(match => match[1])).toEqual([
    'whatsapp', 'x', 'webchat', 'correo', 'instagram', 'facebook', 'linkedin', 'tiktok', 'app_store', 'google_play',
  ]);
  expect(inbound.every(match => match[2] === 'false')).toBe(true);
});

test('the whole outbound section appears only while Engage is active', () => {
  const { state, pricing, channels } = calculator();
  pricing.renderOpts();
  expect(channels.innerHTML).toContain('data-chan="correo"');
  expect(channels.innerHTML).not.toContain('Canales de salida');
  state.engage = true;
  pricing.renderOpts();
  expect(channels.innerHTML).toContain('Canales de salida');
  expect(channels.innerHTML).toContain('data-out="correo"');
  expect(channels.innerHTML).toContain('data-out="wacall"');
  state.engage = false;
  pricing.renderOpts();
  expect(channels.innerHTML).not.toContain('Canales de salida');
  expect(channels.innerHTML).not.toContain('data-out=');
});

test('WhatsApp calls put an independent attention selector inside the selected card', () => {
  const { state, pricing, channels } = calculator();
  state.engage = true;
  pricing.renderOpts();
  expect(channels.innerHTML).not.toContain('data-call-attention');
  state.out.wacall = true;
  state.callAttention = 'both';
  pricing.renderOpts();
  const card = channels.innerHTML.match(/<div class="chan on paid call-channel">([\s\S]+?)<\/div>/)?.[1] ?? '';
  expect(card).toMatch(/data-out="wacall"[\s\S]+?<\/button>[\s\S]+?<select data-call-attention>/);
  expect(card).toContain('<option value="both" selected');
  state.studio = false;
  pricing.renderOpts();
  expect(channels.innerHTML).toMatch(/<option value="ai"\s+disabled>/);
  expect(channels.innerHTML).toContain('<option value="human" selected');
});

test('existing customers can add outbound packs using contracted Desk and Studio', () => {
  const { state, pricing, channels } = calculator();
  Object.assign(state, { existing: true, desk: false, studio: false, engage: true });
  pricing.renderOpts();
  expect(channels.innerHTML).toContain('Bolsa de llamadas por WhatsApp');
  expect(channels.innerHTML).toContain('Bolsa de correo masivo');
  expect(channels.innerHTML).toContain('1.000 gratis/mes');
  expect(channels.innerHTML).not.toContain('Canales de entrada');

  state.out.correo = true;
  expect(pricing.selectedEmailPack()).toMatchObject({ quantity: 1000, monthly: 0 });
  state.emailPlan = 'paid';
  expect(pricing.outboundMonthly()).toBe(85.75);

  state.out.wacall = true;
  state.callAttention = 'both';
  expect(pricing.waCalls()).toBe(true);
  pricing.renderOpts();
  expect(channels.innerHTML).toMatch(/<option value="ai"\s+disabled>/);
  expect(pricing.selectedVoicePools()).toHaveLength(1);
  state.hasStudioContracted = true;
  pricing.renderOpts();
  expect(channels.innerHTML).toContain('<option value="both" selected');
  expect(pricing.selectedVoicePools()).toHaveLength(2);
  expect(pricing.outboundMonthly()).toBe(2271.75);

  state.engage = false;
  pricing.renderOpts();
  expect(channels.innerHTML).toBe('');
  expect(pricing.outboundMonthly()).toBe(0);
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
