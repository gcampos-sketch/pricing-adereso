import {test,expect} from 'bun:test';
import {dealAgeDays} from '../src/lib/deal-age';
const now=Date.parse('2026-11-07T12:00:00Z');
test('age uses completed days from real creation, including same-day zero',()=>{
 expect(dealAgeDays('2026-11-07T10:00:00Z',now)).toBe(0);
 expect(dealAgeDays('2026-11-06T12:00:01Z',now)).toBe(0);
 expect(dealAgeDays('2026-11-06T12:00:00Z',now)).toBe(1);
 expect(dealAgeDays('2026-10-31T09:00:00-03:00',now)).toBe(7);
});
test('missing, invalid or future creation cannot invent an age',()=>{
 for(const date of [undefined,'','bad','2026-11-08T12:00:00Z']) expect(dealAgeDays(date,now)).toBeNull();
});
