import {expect,test} from 'bun:test';
import {commissionRate,quarterPace} from '../src/lib/quarter-performance';
test('commission boundaries use upper bands and supplied personal target',()=>{
  expect([0,20,40,60,80,100,120,150].map(n=>commissionRate(n,9.09)?.rate.toFixed(2))).toEqual(['2.98','3.72','4.65','5.82','7.27','9.09','10.91','13.64']);
  expect(commissionRate(100,10)?.rate).toBe(10);expect(commissionRate(100,null)).toBeNull();expect(commissionRate(NaN,10)).toBeNull();
});
test('calendar pace clamps dates, counts today, uses rounded tenth and rejects missing quota',()=>{
  const pace=(date:string,actual=0)=>quarterPace('2026-Q4',920,actual,Date.parse(date))!;
  expect(pace('2026-09-30T12:00Z').elapsed).toBe(0);
  expect(pace('2026-10-01T12:00Z',10)).toMatchObject({elapsed:1,days:92,state:'En línea'});
  expect(pace('2026-10-02T12:00Z',10).state).toBe('Bajo');
  expect(pace('2026-10-02T12:00Z',30).state).toBe('Sobre');
  expect(pace('2027-01-10T12:00Z',920)).toMatchObject({elapsed:92,expected:100,state:'En línea'});
  expect(quarterPace('2026-Q4',0,0,Date.now())).toBeNull();
});
