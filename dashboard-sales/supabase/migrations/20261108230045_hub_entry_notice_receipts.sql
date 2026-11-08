-- Private delivery ledger. An accepted send is not proof of delivery/read status.
create table public.hub_entry_notice_receipts (
  event_id uuid not null references public.hub_entry_events(id) on delete cascade,
  destination_key uuid not null,
  notice_kind text not null check (notice_kind in ('entry', 'country_alert')),
  state text not null check (state in ('claimed', 'uncertain', 'accepted')),
  claim_id uuid not null default gen_random_uuid(),
  claimed_at timestamptz not null default clock_timestamp(),
  lease_expires_at timestamptz,
  attempted_at timestamptz,
  accepted_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  delivery_message_id text check (length(btrim(delivery_message_id)) between 1 and 512),
  includes_country_alert boolean not null default false,
  primary key (event_id, destination_key, notice_kind),
  check (notice_kind <> 'country_alert' or includes_country_alert),
  check (
    (state = 'claimed' and lease_expires_at is not null and lease_expires_at = claimed_at + interval '15 minutes' and attempted_at is null and accepted_at is null and delivery_message_id is null)
    or (state = 'uncertain' and lease_expires_at is null and attempted_at is not null and accepted_at is null and delivery_message_id is null)
    or (state = 'accepted' and lease_expires_at is null and attempted_at is not null and accepted_at is not null and delivery_message_id is not null)
  )
);
alter table public.hub_entry_notice_receipts enable row level security;
revoke all on public.hub_entry_notice_receipts from public, anon, authenticated, service_role;
grant select, insert, update on public.hub_entry_notice_receipts to service_role;
comment on table public.hub_entry_notice_receipts is 'Opaque destination label and message receipt only. No message bodies, IPs, tokens or personal destination addresses. Uncertain attempts must be reconciled, never automatically retried.';

-- One atomic reservation, including a fenced takeover of an expired, never-attempted claim.
create function public.hub_claim_entry_notice(p_event_id uuid, p_destination_key uuid, p_notice_kind text)
returns setof public.hub_entry_notice_receipts
language sql security invoker set search_path = ''
as $$
  insert into public.hub_entry_notice_receipts as receipt
    (event_id, destination_key, notice_kind, state, claim_id, claimed_at, lease_expires_at, includes_country_alert)
  select p_event_id, p_destination_key, p_notice_kind, 'claimed', gen_random_uuid(), statement_timestamp(), statement_timestamp() + interval '15 minutes', p_notice_kind = 'country_alert'
  where p_notice_kind = 'entry' or (p_notice_kind = 'country_alert' and exists (
    select 1 from public.hub_entry_notice_receipts initial
    where initial.event_id = p_event_id and initial.destination_key = p_destination_key
      and initial.notice_kind = 'entry' and initial.state = 'accepted' and not initial.includes_country_alert
      and exists (select 1 from public.hub_entry_country_assessments evidence
        where evidence.event_id = p_event_id and evidence.assessment = 'unusual_country'
          and cardinality(evidence.source_log_ids) > 0
          and exists (select 1 from unnest(evidence.observed_country_codes) country
            where country <> evidence.expected_country_code))
  ))
  on conflict (event_id, destination_key, notice_kind) do update
    set claim_id = excluded.claim_id, claimed_at = excluded.claimed_at,
        lease_expires_at = excluded.lease_expires_at, updated_at = clock_timestamp()
    where receipt.state = 'claimed' and receipt.lease_expires_at <= clock_timestamp()
  returning receipt.*;
$$;

-- Persist uncertainty BEFORE invoking the messaging tool. A crash cannot authorize a resend.
create function public.hub_begin_entry_notice(p_event_id uuid, p_destination_key uuid, p_notice_kind text, p_claim_id uuid, p_includes_country_alert boolean default false)
returns boolean
language sql security invoker set search_path = ''
as $$
  with changed as (
    update public.hub_entry_notice_receipts receipt
    set state = 'uncertain', lease_expires_at = null, attempted_at = clock_timestamp(), updated_at = clock_timestamp(),
        includes_country_alert = p_notice_kind = 'country_alert' or p_includes_country_alert
    where receipt.event_id = p_event_id and receipt.destination_key = p_destination_key and receipt.notice_kind = p_notice_kind
      and receipt.claim_id = p_claim_id and receipt.state = 'claimed' and receipt.lease_expires_at > clock_timestamp()
      and (not p_includes_country_alert or exists (select 1 from public.hub_entry_country_assessments evidence
        where evidence.event_id = p_event_id and evidence.assessment = 'unusual_country'
          and cardinality(evidence.source_log_ids) > 0
          and exists (select 1 from unnest(evidence.observed_country_codes) country
            where country <> evidence.expected_country_code)))
      and (p_notice_kind = 'entry' or exists (
        select 1 from public.hub_entry_notice_receipts initial
        where initial.event_id = p_event_id and initial.destination_key = p_destination_key
          and initial.notice_kind = 'entry' and initial.state = 'accepted' and not initial.includes_country_alert
          and exists (select 1 from public.hub_entry_country_assessments evidence
            where evidence.event_id = p_event_id and evidence.assessment = 'unusual_country'
              and cardinality(evidence.source_log_ids) > 0
              and exists (select 1 from unnest(evidence.observed_country_codes) country
                where country <> evidence.expected_country_code))
      ))
    returning 1
  ) select exists(select 1 from changed);
$$;

-- Use only an acknowledged message ID, or a matching message found during reconciliation.
create function public.hub_accept_entry_notice(p_event_id uuid, p_destination_key uuid, p_notice_kind text, p_claim_id uuid, p_delivery_message_id text)
returns boolean
language sql security invoker set search_path = ''
as $$
  with changed as (
    update public.hub_entry_notice_receipts receipt
    set state = 'accepted', delivery_message_id = p_delivery_message_id, accepted_at = clock_timestamp(), updated_at = clock_timestamp()
    where receipt.event_id = p_event_id and receipt.destination_key = p_destination_key and receipt.notice_kind = p_notice_kind
      and receipt.claim_id = p_claim_id and receipt.state = 'uncertain'
      and length(btrim(p_delivery_message_id)) between 1 and 512
    returning 1
  ) select exists(select 1 from changed);
$$;

revoke all on function public.hub_claim_entry_notice(uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.hub_begin_entry_notice(uuid,uuid,text,uuid,boolean) from public, anon, authenticated, service_role;
revoke all on function public.hub_accept_entry_notice(uuid,uuid,text,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.hub_claim_entry_notice(uuid,uuid,text) to service_role;
grant execute on function public.hub_begin_entry_notice(uuid,uuid,text,uuid,boolean) to service_role;
grant execute on function public.hub_accept_entry_notice(uuid,uuid,text,uuid,text) to service_role;
