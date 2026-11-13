#!/usr/bin/env python3
"""Synthetic integration tests ONLY on an isolated PostgreSQL 17 service.
Requires psql on PATH, PG* connection environment, and
ACQUISITION_TEST_ISOLATED=1. Connect as fixture owner able to SET ROLE.
No production use. Fixtures persist until the disposable database is destroyed.
No secrets or connection strings are printed. Runs real simultaneous sessions;
observes A sleeping after its write and B blocked on that uncommitted write.
"""
import json
import os
import subprocess
import time
import uuid

if os.environ.get('ACQUISITION_TEST_ISOLATED') != '1':
    raise SystemExit('Refusing: set ACQUISITION_TEST_ISOLATED=1 for disposable test DB only')

BASE = ['psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']
RUN = uuid.uuid4().hex[:12]
NUM = str(int(uuid.uuid4().hex[:12], 16))

def literal(s):
    return "'" + str(s).replace("'", "''") + "'"

def run(sql):
    r = subprocess.run(BASE, input=sql, text=True, capture_output=True, timeout=20)
    if r.returncode:
        raise AssertionError('fixture/inspection SQL failed: ' + r.stderr)
    return r.stdout.strip()

def event(n, value='Inbound'):
    return {'eventKey': 'a'*64, 'event': {
        'portalId':'1', 'appId':'2', 'eventId':NUM+n, 'subscriptionId':'991',
        'type':'contact.propertyChange', 'occurredAt':1700000000000,
        'contactId':NUM, 'value':value}}

def ingest(e):
    return 'SELECT public.acquisition_ingest_events(' + literal(json.dumps([e])) + '::jsonb);'

def payloads(out):
    return [json.loads(line) for line in out.splitlines() if line.startswith('{')]

ROLE = """SET LOCAL ROLE service_role;
DO $$ BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'wrong test role'; END IF;
END $$;
"""

def pair(sql_a, sql_b, label, error_b=None):
    names = ['acq_'+RUN+'_'+label+'_a', 'acq_'+RUN+'_'+label+'_b']
    def start(sql, idx, sleep):
        env = os.environ.copy()
        env['PGAPPNAME'] = names[idx]
        p = subprocess.Popen(BASE, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True, env=env)
        p.stdin.write('BEGIN ISOLATION LEVEL READ COMMITTED;\n' +
                      "SET LOCAL statement_timeout='12s';\n" + ROLE + sql +
                      ('\nSELECT pg_sleep(5);' if sleep else '') + '\nCOMMIT;\n')
        p.stdin.close()
        p.stdin = None
        return p
    def await_state(name, predicate, seconds=3):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            found = run('SELECT count(*) FROM pg_stat_activity WHERE application_name=' +
                        literal(name) + ' AND (' + predicate + ');')
            if found == '1':
                return
            time.sleep(.04)
        raise AssertionError('Expected concurrent backend state missing: ' + name)
    a = start(sql_a, 0, True)
    b = None
    try:
        # A must already have executed its write and hold the transaction open.
        await_state(names[0], "wait_event='PgSleep'")
        b = start(sql_b, 1, False)
        # This is evidence of real contention, not merely two sequential commands.
        await_state(names[1], "wait_event_type='Lock'")
        out_a, err_a = a.communicate(timeout=15)
        out_b, err_b = b.communicate(timeout=15)
        assert a.returncode == 0, err_a
        if error_b:
            assert b.returncode != 0 and error_b in err_b, (b.returncode, err_b)
        else:
            assert b.returncode == 0, err_b
        return payloads(out_a), payloads(out_b)
    finally:
        for p in (a,b):
            if p is not None and p.poll() is None:
                p.kill()
                p.communicate()

# Same identity/content: one insert, one dedupe, exactly one durable event.
e = event('1')
a,b = pair(ingest(e), ingest(e), 'duplicate')
assert a[-1]['inserted'] == 1 and b[-1]['duplicates'] == 1, (a,b)
assert a[-1]['eventKeys'] == b[-1]['eventKeys'], (a,b)
key = a[-1]['eventKeys'][0]
assert run('SELECT count(*) FROM acquisition_private.webhook_events WHERE event_key='+literal(key)+';') == '1'
print('PASS concurrent identical evidence: one insert + one dedupe + one row', flush=True)

# Same identity/different value: B fails with 23505; winner cannot be overwritten.
e1, e2 = event('2'), event('2', 'Outbound')
a,b = pair(ingest(e1), ingest(e2), 'conflict', error_b='23505')
key2 = a[-1]['eventKeys'][0]
assert run("SELECT count(*) FROM acquisition_private.webhook_events WHERE event_key="+literal(key2)+" AND event->>'value'='Inbound';") == '1'
print('PASS concurrent conflicting evidence: loser 23505 + original value preserved', flush=True)

# Two independently attested proposals for the same deal: exactly one frozen value.
att1,att2 = str(uuid.uuid4()),str(uuid.uuid4())
deal = NUM+'3'
for att,value,k in ((att1,'Inbound',key),(att2,'Outbound',key2)):
    run('''INSERT INTO acquisition_private.snapshot_attestations
    (attestation_id,portal_id,deal_id,contact_id,as_of,pipeline_id,
     coverage_start,coverage_end,coverage_complete,identity_at_creation_proven,
     acquisition_value,result_kind,source_reference,rule_version,evidence_event_keys)
    VALUES ('''+ ','.join([literal(att), '1', literal(deal), literal(NUM),
        "'2023-11-14T22:13:20Z'", "'3'", "'2023-11-14T00:00:00Z'", "'2023-11-15T00:00:00Z'",
        'true','true',literal(value),"'observed'","'synthetic:concurrency'","'test-v1'",
        'ARRAY['+literal(k)+']'])+');')
def freeze(att):
    return 'SELECT public.acquisition_freeze_attested_snapshot('+literal(att)+'::uuid);'
a,b = pair(freeze(att1), freeze(att2), 'freeze')
assert a[-1]['status']=='frozen' and b[-1]['status']=='frozen_conflict', (a,b)
assert run('SELECT count(*) FROM acquisition_private.deal_snapshots WHERE deal_id='+literal(deal)+';') == '1'
assert run('SELECT attestation_id::text FROM acquisition_private.deal_snapshots WHERE deal_id='+literal(deal)+';') == att1
assert run('SELECT acquisition_value FROM acquisition_private.deal_snapshots WHERE deal_id='+literal(deal)+';') == 'Inbound'
print('PASS concurrent competing attestations: one snapshot + loser frozen_conflict', flush=True)
print('PASS all concurrency checks (READ COMMITTED; synthetic isolated DB only)', flush=True)
