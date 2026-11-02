import { actionState, coverage, evidenceCompleteness, evidenceWindow, eventPermission, scope } from './workspace-rules';
const t=Date.parse('2026-10-30T01:36:20Z'),from=t-90000,to=t+60000;
const clip=(a:number,b:number,channel='FRONT')=>({channel,state:'AVAILABLE',startedAt:new Date(a).toISOString(),endedAt:new Date(b).toISOString()});
const points=Array.from({length:31},(_,i)=>({recordedAt:new Date(from+i*5000).toISOString()}));
describe('Safety evidence and workflow boundaries',()=>{
 test('uses actual occurrence for an asymmetric 150-second window',()=>{const w=evidenceWindow(new Date(t));expect(w.from.getTime()).toBe(from);expect(w.to.getTime()).toBe(to);expect((t-from)/(to-from)).toBe(.6);expect(w.durationSeconds).toBe(150)});
 test('combines contiguous clips, never bridges a real gap',()=>{expect(coverage(from,to,[[from,t],[t,to]])).toBe(true);expect(coverage(from,to,[[from,t-1000],[t,to]])).toBe(false)});
 test('post-event collection must finish before completeness',()=>{expect(evidenceCompleteness(from,to,[clip(from,to)],points,t).state).toBe('COLLECTING')});
 test('complete needs a full video channel and continuous raw positions',()=>{expect(evidenceCompleteness(from,to,[clip(from,t),clip(t,to)],points,to+1).state).toBe('COMPLETE')});
 test('different half-covered cameras cannot be summed into full coverage',()=>{expect(evidenceCompleteness(from,to,[clip(from,t,'FRONT'),clip(t,to,'BACK')],points,to+1).state).toBe('PARTIAL')});
 test('missing and untimed footage stays pending upload',()=>{expect(evidenceCompleteness(from,to,[{state:'NO_TIME'}],points,to+1).state).toBe('PENDING_UPLOAD')});
 test('a gap in telemetry cannot masquerade as continuous evidence',()=>{expect(evidenceCompleteness(from,to,[clip(from,to)],points.filter((_,i)=>i<5||i>12),to+1).state).toBe('PARTIAL')});
 test('sparse endpoint samples alone do not make a complete track',()=>{expect(evidenceCompleteness(from,to,[clip(from,to)],[points[0],points[30]],to+1).state).toBe('PARTIAL')});
 test('a reviewer cannot close a task before enterprise feedback',()=>{expect(()=>actionState('IN_PROGRESS','CLOSE','RECTIFICATION')).toThrow();expect(actionState('PENDING_REVIEW','CLOSE','RECTIFICATION')).toBe('CLOSED')});
 test('closed tasks cannot be replayed through workflow actions',()=>{expect(()=>actionState('CLOSED','RESPOND','RECTIFICATION')).toThrow();expect(()=>actionState('CLOSED','RETURN','EMERGENCY')).toThrow()});
 test('enterprise scope is always anchored to its own company',()=>{expect(scope({portal:'ENTERPRISE',enterpriseId:'self',organizationId:'city'} as any)).toEqual({enterpriseId:'self',organizationId:{in:['city']}})});
 test('a generic alert read permission does not unlock accident evidence',()=>{expect(()=>eventPermission({permissions:['safety:alert:read']} as any,'ACCIDENT')).toThrow()});
});
