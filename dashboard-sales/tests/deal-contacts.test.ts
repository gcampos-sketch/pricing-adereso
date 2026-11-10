import { expect, test } from 'bun:test';
import { loadDealContacts } from '../src/lib/sequences.server';
import type { gateway } from '../src/lib/hubspot.server';

function reader(contacts: Record<string, Record<string, string | null>>, associations = ['a', 'b'], paginated = false) {
  const calls: string[] = [];
  const request = (async (path: string, init?: RequestInit) => {
    calls.push(path);
    if (path.includes('associations/deals/contacts')) return { results: [{ from: { id: 'deal' }, to: (paginated ? associations.slice(0, 1) : associations).map(toObjectId => ({ toObjectId })), ...(paginated ? { paging: { next: { after: 'page2' } } } : {}) }] };
    if (path.includes('/associations/contacts?')) return { results: associations.slice(1).map(toObjectId => ({ toObjectId })) };
    const body = JSON.parse(String(init?.body));
    expect(body.properties).toContain('titular_para_reuniones');
    return { results: body.inputs.filter(({ id }: { id: string }) => contacts[id]).map(({ id }: { id: string }) => ({ id, properties: contacts[id] })) };
  }) as typeof gateway;
  return { request, calls };
}

test('meeting owner is selected ahead of another associated contact enrolled in a sequence', async () => {
  const { request } = reader({ a: { firstname: 'Otro', email: 'other@example.test', hs_sequences_actively_enrolled_count: '1' }, b: { firstname: 'Titular', lastname: 'Reunión', email: 'owner@example.test', jobtitle: 'Directora', titular_para_reuniones: 'true' } });
  const [contact] = await loadDealContacts(['deal'], request);
  expect(contact).toMatchObject({ contactId: 'b', contactCount: 2, contactName: 'Titular Reunión', contactEmail: 'owner@example.test', contactTitle: 'Directora', sequenceActive: true });
});

test('a single associated contact is displayed without requiring meeting-owner status', async () => {
  const { request } = reader({ a: { firstname: 'Isabel', lastname: 'Ejemplo', email: 'isabel@example.test' } }, ['a']);
  expect((await loadDealContacts(['deal'], request))[0]).toMatchObject({ contactId: 'a', contactName: 'Isabel Ejemplo', contactCount: 1 });
});

test('the enrollment action retains its existing sequence-first contact selection', async () => {
  const { request } = reader({ a: { firstname: 'Secuencia', hs_sequences_actively_enrolled_count: '1' }, b: { firstname: 'Titular', titular_para_reuniones: 'true' } });
  expect((await loadDealContacts(['deal'], request, false))[0]?.contactId).toBe('a');
});

test('false and missing meeting-owner flags preserve the previous fallback', async () => {
  const { request } = reader({ a: { firstname: 'Sin correo', titular_para_reuniones: 'false' }, b: { firstname: 'Con correo', email: 'fallback@example.test' } });
  expect((await loadDealContacts(['deal'], request))[0]?.contactId).toBe('b');
});

test('a titular without email is still chosen, with identity fields from the same contact', async () => {
  const { request } = reader({ a: { firstname: 'Otro', email: 'other@example.test', jobtitle: 'Otro cargo' }, b: { firstname: 'Titular', titular_para_reuniones: 'true' } });
  expect((await loadDealContacts(['deal'], request))[0]).toMatchObject({ contactId: 'b', contactName: 'Titular', contactEmail: null, contactTitle: null });
});

test('meeting-owner selection includes all association pages and deduplicates contacts', async () => {
  const { request, calls } = reader({ a: { firstname: 'Otro' }, b: { firstname: 'Titular', titular_para_reuniones: 'true' } }, ['a', 'a', 'b'], true);
  expect((await loadDealContacts(['deal'], request))[0]).toMatchObject({ contactId: 'b', contactCount: 2 });
  expect(calls.some(path => path.includes('after=page2'))).toBe(true);
});

test('failed or incomplete reads cannot claim that the deal has no contacts', async () => {
  await expect(loadDealContacts(['deal'], (async () => { throw new Error('Read failed'); }) as typeof gateway)).rejects.toThrow('Read failed');
  const { request } = reader({ a: { firstname: 'Visible' } });
  await expect(loadDealContacts(['deal'], request)).rejects.toThrow('Faltan contactos');
});

test('a confirmed empty association shows no contact', async () => {
  const { request } = reader({}, []);
  expect((await loadDealContacts(['deal'], request))[0]).toMatchObject({ contactId: null, contactCount: 0, contactName: null });
});

test('HubSpot 207 NO_ASSOCIATIONS_FOUND does not discard the other deals in the batch', async () => {
  const { request } = reader({ a: { firstname: 'Contacto' } }, ['a']);
  const partial = (async (path: string, init?: RequestInit) => {
    const result = await request<any>(path, init);
    return path.includes('associations/deals/contacts') ? { ...result, errors: [{ subCategory: 'crm.associations.NO_ASSOCIATIONS_FOUND', context: { fromObjectId: ['empty'] } }] } : result;
  }) as typeof gateway;
  const rows = await loadDealContacts(['deal', 'empty'], partial);
  expect(rows[0]).toMatchObject({ contactName: 'Contacto', contactCount: 1 });
  expect(rows[1]).toMatchObject({ contactName: null, contactCount: 0 });
});
