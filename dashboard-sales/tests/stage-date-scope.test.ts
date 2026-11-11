import {test,expect} from 'bun:test';
import type {StageJourney} from '../src/lib/pulse-types';
import {journeyInPeriods,stageInPeriods,flowStageDate} from '../src/lib/stage-date-scope';
const row = {deal:{id:'1',stageId:'171385869',closeDateValue:'2026-11-11'},createdAt:'2026-11-01',entered:{E1:'2025-02-01',E4:'2026-05-01',E6:'2026-10-01',LOST:'2026-11-01'},days:{}} as StageJourney;
test('entry mode scopes each specific stage, independent of creation and close dates',()=>{
 const periods=new Set(['2026-Q4']);
 expect(journeyInPeriods(row,periods,'entry')).toBe(true);
 expect(stageInPeriods(row,'E1',periods,'entry')).toBe(false);
 expect(stageInPeriods(row,'E4',periods,'entry')).toBe(false);
 expect(stageInPeriods(row,'E6',periods,'entry')).toBe(true);
 expect(stageInPeriods(row,'Perdido',periods,'entry')).toBe(true);
});
test('close mode keeps complete recorded paths only for deals closing in the chosen period',()=>{
 expect(stageInPeriods(row,'E1',new Set(['2026-Q4']),'close')).toBe(true);
 expect(journeyInPeriods(row,new Set(['2025-Q1']),'close')).toBe(false);
 expect(journeyInPeriods(row,new Set(['2025-Q1']),'entry')).toBe(true);
});
test('missing entry and close dates never fall back to creation or each other',()=>{
 const missing={...row,entered:{},deal:{...row.deal,closeDateValue:''}};
 expect(journeyInPeriods(missing,new Set(['2026-Q4']),'entry')).toBe(false);
 expect(journeyInPeriods(missing,new Set(['2026-Q4']),'close')).toBe(false);
 expect(stageInPeriods(row,'E2',new Set(['2026-Q4']),'entry')).toBe(false);
});
test('development loss uses the exact outcome stage date, not sales loss or closure',()=>{
 const lost={...row,deal:{...row.deal,stageId:'1372234925'},outcomeEntered:{'1372234925':'2026-04-01'}};
 expect(flowStageDate(lost,'Perdido desarrollo')).toBe('2026-04-01');
 expect(stageInPeriods(lost,'Perdido desarrollo',new Set(['2026-Q2']),'entry')).toBe(true);
 expect(stageInPeriods({...lost,outcomeEntered:{}},'Perdido desarrollo',new Set(['2026-Q4']),'entry')).toBe(false);
});
