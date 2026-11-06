import { test, expect } from 'bun:test';
import type { DealDTO } from '../src/lib/pulse-types';
import { adoboPeriodDeals, adoboSortCompare } from '../src/lib/adobo-period';

const deal = (id: string, closeDateValue: string) => ({ id, closeDateValue }) as DealDTO;
const NOW = Date.parse('2026-10-19T12:00:00Z');
const sortable = (id: string, opts: { score?: number; mrr?: number; close?: string }) =>
  ({ id, closeDateValue: opts.close ?? '', amountValue: opts.mrr ?? 0, adoboScoreValue: opts.score }) as DealDTO;
test('Adobo includes only the selected Q, with exact UTC boundaries', () => {
  const rows = [deal('q3', '2026-09-30T23:59:59Z'), deal('q4', '2026-10-01T00:00:00Z'),
    deal('last', '2026-12-31T23:59:59Z'), deal('next', '2027-01-01T00:00:00Z')];
  expect(adoboPeriodDeals(rows, ['2026-Q4']).map(d => d.id)).toEqual(['q4', 'last']);
});
test('Adobo year selection never includes another year or undated deals', () => {
  const rows = [deal('a', '2026-01-01'), deal('b', '2026-07-01'), deal('old', '2025-10-01'), deal('blank', ''), deal('bad', 'invalid')];
  expect(adoboPeriodDeals(rows, ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4']).map(d => d.id)).toEqual(['a', 'b']);
});
test('Adobo summary and evidence scope contain each selected deal only once', () => {
  const a = deal('a', '2026-10-15');
  expect(adoboPeriodDeals([a, a, deal('b', '2026-07-15')], ['2026-Q4']).map(d => d.id)).toEqual(['a']);
  expect(adoboPeriodDeals([a], ['2026-Q3'])).toEqual([]);
});
test('Adobo list sorting: score desc default, MRR and close date desc, missing key last', () => {
  const rows = [sortable('a', { score: 42 }), sortable('b', { score: 80 }), sortable('c', { score: 42 }), sortable('none', {})];
  expect([...rows].sort(adoboSortCompare('score', NOW)).map(d => d.id)).toEqual(['b', 'a', 'c', 'none']);
  const mrrRows = [sortable('m1', { mrr: 100 }), sortable('m2', { mrr: 500 }), sortable('m3', { mrr: 100 })];
  expect([...mrrRows].sort(adoboSortCompare('mrr', NOW)).map(d => d.id)).toEqual(['m2', 'm1', 'm3']);
  const dateRows = [sortable('d1', { close: '2026-08-02' }), sortable('d2', { close: '2026-10-15' }), sortable('d3', { close: '' })];
  expect([...dateRows].sort(adoboSortCompare('closeDate', NOW)).map(d => d.id)).toEqual(['d2', 'd1', 'd3']);
});