import { test, expect } from 'bun:test';
import { closeMonthKey, currentMonthKey, summarizeDealMonths } from '../src/lib/deal-month-summary';
const now=Date.parse('2026-11-07T12:00:00Z');
const deal=(closeDateValue:string,amountValue:number)=>({closeDateValue,amountValue});
const deals=[deal('2026-11-01T00:00:00Z',10),deal('2026-11-30',20),deal('2026-12-31',50),deal('2026-10-31',7),deal('2027-01-01',8),deal('',9),deal('bad',4)];
test('current month through quarter end, with amounts/counts and explicit reconciliation',()=>{
 const s=summarizeDealMonths(deals,now);
 expect(s.months.map(m=>[m.key,m.amount,m.count])).toEqual([['2026-11',30,2],['2026-12',50,1]]);
 expect(s.total).toEqual({amount:80,count:3});expect(s.outside).toEqual({amount:15,count:2});expect(s.undated).toEqual({amount:13,count:2});
 expect(s.total.amount+s.outside.amount+s.undated.amount).toBe(deals.reduce((n,d)=>n+d.amountValue,0));
});
test('only filtered rows contribute, and a local date edit moves the same amount between buckets',()=>{
 expect(summarizeDealMonths(deals.filter(d=>d.amountValue===50),now).total.amount).toBe(50);
 const changed=deals.map((d,i)=>i===0?{...d,closeDateValue:'2026-12-10T00:00:00Z'}:d);
 expect(summarizeDealMonths(changed,now).months.map(m=>m.amount)).toEqual([20,60]);
});
test('December stops at Q4; January and October each show three months',()=>{
 expect(summarizeDealMonths([],Date.parse('2026-12-10T12:00:00Z')).months.map(m=>m.key)).toEqual(['2026-12']);
 expect(summarizeDealMonths([],Date.parse('2027-01-10T12:00:00Z')).months.map(m=>m.key)).toEqual(['2027-01','2027-02','2027-03']);
 expect(summarizeDealMonths([],Date.parse('2026-10-10T12:00:00Z')).months.length).toBe(3);
 expect(currentMonthKey(Date.parse('2026-12-10T12:00:00Z'),1)).toBe('2027-01');
});
test('business month honors local midnight, while HubSpot close dates keep their UTC calendar month',()=>{
 expect(currentMonthKey(Date.parse('2026-11-01T01:00:00Z'))).toBe('2026-10');
 expect(closeMonthKey('2026-11-01T00:00:00Z')).toBe('2026-11');
 expect(closeMonthKey('2026-02-30')).toBeNull();expect(closeMonthKey('not a date')).toBeNull();
});
test('empty filtered month retains zero buckets; zero amounts still count deals',()=>{
 const s=summarizeDealMonths([deal('2026-11-10',0)],now);expect(s.months[0]).toMatchObject({amount:0,count:1});expect(s.months[1]).toMatchObject({amount:0,count:0});
});
