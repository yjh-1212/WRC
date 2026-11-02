import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { cityScope, csvFile, dayKey, evaluate, initialIndicators, period, validateIndicators } from './city-analytics.rules';
describe('Municipal analytics business rules',()=>{
 const now=new Date('2026-10-31T04:00:00Z');
 it('uses Shanghai natural days and retains every date across month boundaries',()=>{
  const r=period({from:'2026-08-01',to:'2026-10-31'},now);
  expect(r.start.toISOString()).toBe('2026-07-31T16:00:00.000Z');
  expect(r.end.toISOString()).toBe('2026-10-31T16:00:00.000Z');
  expect(r.cutoff.toISOString()).toBe(now.toISOString());
  expect(r.dates).toHaveLength(92);expect(r.dates[91]).toBe('2026-10-31');
  expect(dayKey(new Date('2026-10-30T16:00:00Z'))).toBe('2026-10-31');
 });
 it.each([{from:'2026-02-30',to:'2026-03-01'},{from:'2026-10-02',to:'2026-10-01'},{from:'2020-01-01',to:'2026-10-31'},{from:'2026-10-01',to:'2026-11-01'}])('rejects invalid, inverted, excessive or future periods (%j)',q=>expect(()=>period(q,now)).toThrow(BadRequestException));
 it('does not coerce missing observations into zero or a final grade',()=>{
  const result=evaluate(initialIndicators,{accidentCount:0,violationCount:0,onlineRate:null},{onlineRate:'没有联网日记录'});
  expect(result.totalScore).toBeNull();expect(result.grade).toBeNull();expect(result.breakdown[2].score).toBeNull();expect(result.quality[0].reason).toBe('没有联网日记录');
 });
 it('applies documented bands and weights to valid zero and positive values',()=>{
  const result=evaluate(initialIndicators,{accidentCount:0,violationCount:1,onlineRate:90});
  expect(result.totalScore).toBe(90);expect(result.grade).toBe('A');expect(result.quality).toEqual([]);
 });
 it('rejects ambiguous overlapping or gapped scoring ranges and unsupported metrics',()=>{
  const clone=()=>JSON.parse(JSON.stringify(initialIndicators));let rows=clone();rows[0].rules[1].minValue=.5;expect(()=>validateIndicators(rows)).toThrow();rows=clone();rows[0].rules[1].minValue=1.5;expect(()=>validateIndicators(rows)).toThrow();rows=clone();rows[0].metricKey='operationEfficiency';expect(()=>validateIndicators(rows)).toThrow();expect(validateIndicators(clone())).toHaveLength(3);
 });
 it('requires a verified municipal regulatory account even when permissions match',()=>{
  expect(()=>cityScope({accountLevel:'PROVINCE',portal:'REGULATORY'} as any)).toThrow(ForbiddenException);
  expect(()=>cityScope({accountLevel:'ENTERPRISE',portal:'ENTERPRISE'} as any)).toThrow(ForbiddenException);
  expect(cityScope({accountLevel:'CITY',portal:'REGULATORY',organizationId:'city',scopeOrganizationIds:['city','district']} as any).organizationId.in).toEqual(['city','district']);
 });
 it('exports spreadsheet-safe values while retaining numeric negative adjustments',()=>{
  const f=csvFile('test',[['=HYPERLINK("x")',-5,null,'中文']]);expect(f.content).toContain("'=HYPERLINK");expect(f.content).toContain('"-5"');expect(f.content).toContain('"—"');expect(f.content.startsWith('\uFEFF')).toBe(true);
 });
});
