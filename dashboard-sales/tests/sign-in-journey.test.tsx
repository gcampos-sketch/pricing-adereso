import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { knownSignInDevice, rememberSignInDevice } from '../src/lib/sign-in-journey';
import { UnifiedSignIn } from '../src/components/UnifiedSignIn';
import { PasskeySignInOptions } from '../src/components/PasskeySignInOptions';

test('the first screen has one sign-in action without signup or provider decisions', () => {
  const html = renderToStaticMarkup(<UnifiedSignIn knownDevice={() => false}
    continueWithEmail={async () => ({ next: 'email-code' })} verifyEmail={async () => {}}
    onSignIn={() => {}} passkeyBusy={false} passkeyError={null} passkeysAvailable clearPasskeyError={() => {}} />);
  expect((html.match(/<button/g) ?? []).length).toBe(1);
  expect(html).toContain('Iniciar sesión');
  expect(html).not.toContain('Crear mi cuenta');
  expect(html).not.toContain('Entrar con Keeper');
  expect(html).not.toContain('<input');
});

test('passkey choices place the device above Keeper and do not offer a separate registration branch', () => {
  const html = renderToStaticMarkup(<PasskeySignInOptions busy={false} onSignIn={() => {}} />);
  expect(html.indexOf('Touch ID, Face ID o PIN')).toBeLessThan(html.indexOf('Entrar con Keeper'));
  expect(html).not.toContain('Crear mi cuenta');
  expect(html).not.toContain('Usar mi passkey de Keeper');
});

test('the device hint contains no identity, tokens, or credential IDs and expires after 30 days', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  expect(knownSignInDevice(storage, 100)).toBe(false);
  rememberSignInDevice(storage, 100);
  expect(knownSignInDevice(storage, 101)).toBe(true);
  expect(JSON.parse([...values.values()][0]!)).toEqual({ version: 1, lastUsed: 100 });
  expect(knownSignInDevice(storage, 100 + 30 * 86_400_000)).toBe(false);
  expect(knownSignInDevice(storage, 99)).toBe(false);
});

test('missing, corrupt, blocked and older browser storage all return to the email step', () => {
  for (const value of [null, 'bad-json', '{}', '{"version":1,"lastUsed":"100"}', '{"version":0,"lastUsed":100}', 'null']) {
    expect(knownSignInDevice({ getItem: () => value }, 101)).toBe(false);
  }
  expect(knownSignInDevice({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
  expect(() => rememberSignInDevice({ setItem: () => { throw new Error('blocked'); } })).not.toThrow();
});
