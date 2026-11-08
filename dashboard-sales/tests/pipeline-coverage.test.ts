import { expect, test } from 'bun:test';
import { pipelineCoverage } from '../src/lib/pipeline-coverage';
const deal = (id: string, amountValue: number, probabilityValue: number, probability = `${probabilityValue * 100}%`) => ({ id, amountValue, probabilityValue, probability });
test('weights each deal by its fractional probability and uses the displayed gap', () => {
  expect(pipelineCoverage([deal('a', 1000, .8), deal('b', 2000, .25), deal('c', 1000, 0)], 2000, 500)).toEqual({ weighted: 1300, coverage: 2.6 });
});
test('gap includes won MRR and OTF/12', () => {
  expect(pipelineCoverage([deal('a', 2000, .6)], 1000, 1000 - 300 - 1200 / 12).coverage).toBe(2);
});
test('deduplicates IDs and respects zero probability', () => {
  const d = deal('a', 1000, .5);
  expect(pipelineCoverage([d, d, deal('b', 1000, 0)], 1000, 500)).toEqual({ weighted: 500, coverage: 1 });
});
test('incomplete or invalid probabilities do not become complete zero estimates', () => {
  for (const d of [deal('a', 1000, 0, 's/n'), deal('a', 1000, NaN), deal('a', 1000, 80), deal('a', NaN, .5)]) {
    expect(pipelineCoverage([d], 1000, 500)).toEqual({ weighted: null, coverage: null });
  }
});
test('no quota or completed quota does not produce infinity', () => {
  expect(pipelineCoverage([deal('a', 1000, .5)], 0, 0).coverage).toBeNull();
  expect(pipelineCoverage([deal('a', 1000, .5)], 1000, 0).coverage).toBeNull();
  expect(pipelineCoverage([], 1000, 500)).toEqual({ weighted: 0, coverage: 0 });
});
