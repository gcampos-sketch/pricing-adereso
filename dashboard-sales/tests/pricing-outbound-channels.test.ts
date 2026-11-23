import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { walletSources } from '../src/lib/wallet-public';

const hub = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const source = hub.slice(hub.indexOf('const EMAIL_FREE_QUANTITY='), hub.indexOf('function waService()'));

const channelCatalog = hub.slice(hub.indexOf('const CHANNELS='), hub.indexOf('const SECTIONS='));
const channelRenderer = hub.slice(hub.indexOf('function renderOpts()'), hub.indexOf("document.addEventListener('click',e=>{const b=e.target.closest('[data-soon-tg]')"));

function calculator() {
  const state = {
    existing: false,
    desk: true,
    studio: true,
    scope: 'bolsa',
    engage: false,
    chan: {},
    out: { correo: false, wacall: false },
    callAttention: '',
    emailPlan: 'free',
    emailQuantity: 35000,
    voiceMinutes: 12350,
  };
  const channels = { innerHTML: '' };
  const pricing = runInNewContext(source + walletSources(hub).formulas + channelCatalog + channelRenderer
    + ';({ emailOutboundPack, studioVoicePack, selectedEmailPack, selectedVoicePack, outboundMonthly, waCalls, renderOpts })', {
    state,
    document: { getElementById: () => channels },
    paintIcons: () => {},
    hasExistingDesk: () => false,
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

test('voice IA uses the Studio volume tier and publishes the separate overage rate', () => {
  const { pricing } = calculator();
  expect(pricing.studioVoicePack(1999)).toBeNull();
  for (const [quantity, monthly] of [[2000, 360], [5000, 850], [10000, 1600], [20000, 3000], [35000, 4900], [50000, 6500], [100000, 12000]]) {
    expect(pricing.studioVoicePack(quantity).monthly).toBe(monthly);
  }
  expect(pricing.studioVoicePack(12350)).toMatchObject({ baseTier: 10000, rate: .16, monthly: 1976, overage: .184 });
});

test('only selected compatible channels contribute to the monthly outbound price', () => {
  const { state, pricing } = calculator();
  expect(pricing.outboundMonthly()).toBe(0);
  state.engage = true;
  expect(pricing.selectedEmailPack()).toBeNull();
  state.out.correo = true;
  expect(pricing.selectedEmailPack()).toMatchObject({ quantity: 1000, monthly: 0 });
  state.emailPlan = 'paid';
  state.out.wacall = true;
  state.callAttention = 'human';
  expect(pricing.selectedVoicePack()).toBeNull();
  expect(pricing.outboundMonthly()).toBe(85.75);
  state.callAttention = 'both';
  expect(pricing.outboundMonthly()).toBe(2061.75);
  expect(pricing.waCalls()).toBe(true);
  state.engage = false;
  expect(pricing.waCalls()).toBe(false);
  expect(pricing.outboundMonthly()).toBe(0);
  state.engage = true;
  expect(pricing.outboundMonthly()).toBe(2061.75);
  state.studio = false;
  expect(pricing.outboundMonthly()).toBe(85.75);
  state.engage = false;
  expect(pricing.outboundMonthly()).toBe(0);
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

test('private email and Studio price tables stay outside the public Meta wallet', () => {
  const { formulas, calculator } = walletSources(hub);
  expect(formulas + calculator).not.toMatch(/EMAIL_PACKS|VOICE_PACKS|function studioVoicePack/);
});
