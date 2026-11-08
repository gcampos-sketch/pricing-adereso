import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';

test('notice ledger reserves atomically and never reclaims attempted or accepted sends', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261108230045_hub_entry_notice_receipts.sql', import.meta.url), 'utf8');
  expect(sql).toContain('primary key (event_id, destination_key, notice_kind)');
  expect(sql).toContain('on conflict (event_id, destination_key, notice_kind) do update');
  expect(sql).toContain("where receipt.state = 'claimed' and receipt.lease_expires_at <= clock_timestamp()");
  expect(sql).toContain("receipt.claim_id = p_claim_id and receipt.state = 'claimed' and receipt.lease_expires_at > clock_timestamp()");
  expect(sql).toContain("set state = 'uncertain', lease_expires_at = null");
  expect(sql).toContain("receipt.claim_id = p_claim_id and receipt.state = 'uncertain'");
  expect(sql).toContain("initial.state = 'accepted' and not initial.includes_country_alert");
  expect(sql).toContain('length(btrim(p_delivery_message_id)) between 1 and 512');
});

test('notice ledger and functions preserve private, invoker-only access with minimal metadata', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261108230045_hub_entry_notice_receipts.sql', import.meta.url), 'utf8');
  expect(sql).toContain('alter table public.hub_entry_notice_receipts enable row level security');
  expect(sql).toContain('revoke all on public.hub_entry_notice_receipts from public, anon, authenticated, service_role');
  expect(sql).toContain('grant select, insert, update on public.hub_entry_notice_receipts to service_role');
  expect(sql.match(/security invoker set search_path = ''/g)).toHaveLength(3);
  expect(sql).not.toContain('security definer');
  for (const signature of ['hub_claim_entry_notice(uuid,uuid,text)', 'hub_begin_entry_notice(uuid,uuid,text,uuid,boolean)', 'hub_accept_entry_notice(uuid,uuid,text,uuid,text)']) {
    expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated, service_role`);
    expect(sql).toContain(`grant execute on function public.${signature} to service_role`);
  }
  expect(sql).not.toMatch(/\b(?:ip_address|message_body|access_token|email|phone_number)\s+(?:text|inet)/);
});
