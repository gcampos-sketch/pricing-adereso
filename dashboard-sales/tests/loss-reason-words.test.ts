import { expect, test } from 'bun:test';
import { buildLossReasonWords, lossNarrativeTerms, lossNarrativeText, summarizeLossReasons, type LossNarrative } from '../src/lib/loss-reason-words';
const deal = (id: string, text: string | null): LossNarrative => ({ id, name: `Example ${id}`, url: `https://example.test/${id}`, lostReasonNarrative: text });
test('word size counts distinct deals rather than repetitions or duplicate rows', () => {
  const a = deal('a', 'Integración integración API API');
  const result = buildLossReasonWords([a, a, deal('b', 'Integracion llamadas'), deal('c', null)]);
  expect(result.total).toBe(3);
  expect(result.commented).toBe(2);
  expect(result.words.find(word => word.term === 'integracion')?.count).toBe(2);
  expect(result.words.find(word => word.term === 'api')?.count).toBe(1);
  expect(result.words.find(word => word.term === 'integracion')?.comments.map(row => row.id)).toEqual(['a', 'b']);
});
test('cleans markup, common words, URLs and emails while retaining technical literal tokens', () => {
  expect(lossNarrativeTerms('<p>El cliente necesita IA y API en llamadas.</p> https://private.test/secret mail@private.test <script>dangerous()</script>')).toEqual(['ia', 'api', 'llamadas']);
  expect(lossNarrativeText('<p>Sin API</p>')).toBe('Sin API');
});
test('uses only exact native narratives without category, development or name fallback', () => {
  const result = buildLossReasonWords([{ id: 'a', name: 'ConfidentialName', lostReasonText: 'Categoría ajena', lostReason: 'Producto insuficiente' } as LossNarrative]);
  expect(result).toEqual({ total: 1, commented: 0, words: [] });
});
test('keeps semantic variants literal and evidence inside the supplied population', () => {
  const words = buildLossReasonWords([deal('a', 'voz telefonía llamadas'), deal('b', 'voz')]).words;
  expect(words.find(word => word.term === 'voz')?.comments.map(row => row.id)).toEqual(['a', 'b']);
  expect(words.find(word => word.term === 'telefonia')?.count).toBe(1);
  expect(words.some(word => word.term === 'voicebot')).toBe(false);
});
test('bounds the cloud deterministically, covers empty comments and preserves evidence links', () => {
  const input = [deal('a', 'beta alfa gamma'), deal('b', 'el cliente y la empresa'), deal('c', '')];
  expect(buildLossReasonWords(input, 2).words.map(word => word.term)).toEqual(['alfa', 'beta']);
  expect(buildLossReasonWords(input).commented).toBe(2);
  expect(buildLossReasonWords(input).words[0].comments[0].url).toBe('https://example.test/a');
  expect(buildLossReasonWords([])).toEqual({ total: 0, commented: 0, words: [] });
});

test('removes narrative filler in Spanish and English without discarding commercial causes', () => {
  expect(lossNarrativeTerms('Ahora comenta que hubo cambio de prioridades; por el momento no avanzan. He said by email: presupuesto, precio, integración, seguridad, plazo.')).toEqual(['prioridades', 'email', 'presupuesto', 'precio', 'integracion', 'seguridad', 'plazo']);
  expect(lossNarrativeTerms('ahora cambio momento comenta dando deja he by ano meses actuales ver')).toEqual([]);
});
test('keeps useful short acronyms and technical terms rather than arbitrary short fragments', () => {
  expect(lossNarrativeTerms('IA AI BI TI IT UX CX QA WA API CRM ERP SAP IVR bot voz ab xy')).toEqual(['ia', 'ai', 'bi', 'ti', 'it', 'ux', 'cx', 'qa', 'wa', 'api', 'crm', 'erp', 'sap', 'ivr', 'bot', 'voz']);
});
test('relevance filtering preserves negation and the full native comment as evidence', () => {
  const text = 'Ahora comenta: no falta API, falta presupuesto.';
  const result = buildLossReasonWords([deal('a', text), deal('b', 'Ahora por el momento')]);
  expect(result.commented).toBe(2);
  expect(result.words.map(word => word.term)).toEqual(['api', 'falta', 'presupuesto']);
  expect(result.words.find(word => word.term === 'api')?.comments[0].text).toBe(text);
});

test('retains the full property value when extracting terms from formatted reasons', () => {
  const text = '  WhatsApp  sin respuesta.\nSegunda línea con <b>API</b> y &amp;.  ';
  const word = buildLossReasonWords([deal('a', text)]).words.find(word => word.term === 'whatsapp');
  expect(word?.comments[0].text).toBe(text);
});

test('uses the exact deals in the reason or term, grouping by owner ID and retaining zero MRR', () => {
  const a = { ...deal('a', 'WhatsApp'), ownerId: '1', owner: 'Alex', amountValue: 200 };
  const b = { ...deal('b', null), ownerId: '1', owner: 'Alex', amountValue: 0 };
  const c = { ...deal('c', 'WhatsApp'), ownerId: '2', owner: 'Alex', amountValue: 100 };
  const d = { ...deal('d', 'Presupuesto'), ownerId: '', owner: '', amountValue: 50 };
  const category = [a, b, c, d, a];

  expect(summarizeLossReasons(category)).toEqual({
    count: 4,
    mrr: 350,
    owners: [
      { id: '1', name: 'Alex', count: 2, mrr: 200 },
      { id: '2', name: 'Alex', count: 1, mrr: 100 },
      { id: '', name: 'Sin comercial', count: 1, mrr: 50 },
    ],
  });
  const matching = buildLossReasonWords(category).words.find(word => word.term === 'whatsapp')!.comments;
  expect(summarizeLossReasons(matching)).toMatchObject({ count: 2, mrr: 300 });
});
