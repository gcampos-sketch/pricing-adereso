import { expect, test } from 'bun:test';
import { planNotificationRestore } from '../scripts/restore-notification-accounts.mjs';
const source = { user_id: 'old-id', email: 'persona@adere.so', payload: { version: 'sales-notifications/v1', account: 'old-id', ownerId: 'crm-owner', history: [{ reason: 'test-only' }] }, revision: 4, updated_at: '2026-11-06T12:00:00Z' };
const oldRow = { user_id: source.user_id, payload: source.payload, revision: source.revision };
const verified = { id: 'new-id', email: 'persona@adere.so', email_confirmed_at: '2026-11-06T12:00:00Z' };
test('missing or unverified accounts remain pending', () => {
  expect(planNotificationRestore([source], [], [oldRow])[0].status).toBe('pending');
  expect(planNotificationRestore([source], [{ ...verified, email_confirmed_at: null }], [oldRow])[0].status).toBe('pending');
});
test('exact verified email rebinds only account identity and preserves owner and history', () => {
  const [item] = planNotificationRestore([source], [verified], [oldRow]);
  expect(item.status).toBe('restore'); expect(item.row.user_id).toBe('new-id');
  expect(item.row.payload).toEqual({ ...source.payload, account: 'new-id' });
  expect(source.payload.account).toBe('old-id');
});
test('another email cannot receive a repository, including deceptive domains', () => {
  expect(planNotificationRestore([source], [{ ...verified, email: 'other@adere.so' }], [oldRow])[0].status).toBe('pending');
  expect(() => planNotificationRestore([{ ...source, email: 'persona@adere.so.evil.test' }], [verified], [oldRow])).toThrow();
});
test('existing destination state is never overwritten', () => {
  expect(planNotificationRestore([source], [verified], [oldRow, { user_id: 'new-id', payload: { active: ['new-state'] } }])[0].status).toBe('conflict');
});
test('ambiguous accounts and changed source snapshots fail closed', () => {
  expect(() => planNotificationRestore([source], [verified, { ...verified, id: 'another-id' }], [oldRow])).toThrow();
  expect(() => planNotificationRestore([source], [verified], [{ ...oldRow, revision: 5 }])).toThrow();
  expect(() => planNotificationRestore([source, source], [verified], [oldRow])).toThrow();
});
