import { test, expect } from 'bun:test';
import { dealExposure } from '../src/lib/deal-exposure';
test('widget exposure values unique deals, and identifies absent/non-positive amounts',()=>{
  expect(dealExposure([{id:'a',amountValue:100},{id:'a',amountValue:100},{id:'b',amountValue:250},{id:'c',amountValue:0},{id:'d',amountValue:NaN},{id:'e',amountValue:-10}])).toEqual({mrr:350,unvalued:3});
  expect(dealExposure([])).toEqual({mrr:0,unvalued:0});
});
