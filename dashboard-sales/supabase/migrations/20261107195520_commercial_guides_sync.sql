-- Reuse the durable worker/leases without granting browser access to source snapshots.
alter table public.academy_source_state drop constraint academy_source_state_source_check;
alter table public.academy_source_state add constraint academy_source_state_source_check
  check (source in ('notion','help','playbook','operativa'));
insert into public.academy_source_state(source) values ('playbook'),('operativa') on conflict do nothing;
