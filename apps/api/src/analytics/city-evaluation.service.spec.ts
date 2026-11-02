import { BadRequestException, ConflictException } from '@nestjs/common';
import { CityEvaluationService } from './city-evaluation.service';
describe('Evaluation publication invariants',()=>{
 const user:any={id:'u',displayName:'复核员',accountLevel:'CITY',portal:'REGULATORY',organizationId:'city',scopeOrganizationIds:['city']};
 const base:any={id:'ev',enterpriseId:'ent',version:2,status:'DRAFT',qualityJson:'[]',historyJson:'[]',breakdownJson:'[{"name":"事故","score":100}]',evidenceJson:'{"items":[{"id":"source"}]}',totalScore:92,grade:'A',task:{rulesVersion:'V1',rulesSnapshotJson:'[]'}};
 let row:any;const prisma:any={enterpriseEvaluation:{findFirst:jest.fn(),updateMany:jest.fn()}};const auth:any={audit:jest.fn()};let service:CityEvaluationService;
 beforeEach(()=>{jest.clearAllMocks();row={...base,task:{...base.task}};prisma.enterpriseEvaluation.findFirst.mockImplementation(async()=>row);prisma.enterpriseEvaluation.updateMany.mockResolvedValue({count:1});service=new CityEvaluationService(prisma,auth,{} as any);jest.spyOn(service,'detail').mockImplementation(async()=>row);});
 it('blocks direct publication, missing data and stale results',async()=>{
  await expect(service.action(user,'ev',{action:'PUBLISH',version:2,comment:'发布'})).rejects.toThrow(BadRequestException);
  row.status='REVIEWED';row.reviewedAt=new Date();row.qualityJson='[{"name":"联网","reason":"缺失"}]';await expect(service.action(user,'ev',{action:'PUBLISH',version:2,comment:'发布'})).rejects.toThrow(BadRequestException);
  await expect(service.action(user,'ev',{action:'REVIEW',version:1,comment:'复核'})).rejects.toThrow(ConflictException);expect(prisma.enterpriseEvaluation.updateMany).not.toHaveBeenCalled();
 });
 it('stores the reviewed score, sources and rules in the publication history',async()=>{
  row.status='REVIEWED';row.reviewedAt=new Date();await service.action(user,'ev',{action:'PUBLISH',version:2,comment:'核对通过'});
  const input=prisma.enterpriseEvaluation.updateMany.mock.calls[0][0];expect(input.where.version).toBe(2);expect(input.data.status).toBe('PUBLISHED');const h=JSON.parse(input.data.historyJson)[0];expect(h.publishedSnapshot.totalScore).toBe(92);expect(h.publishedSnapshot.rulesVersion).toBe('V1');expect(h.publishedSnapshot.evidence.items[0].id).toBe('source');
 });
 it('does not silently recompute a published result',async()=>{row.status='PUBLISHED';await expect(service.action(user,'ev',{action:'RECALCULATE',version:2,comment:'重算'})).rejects.toThrow(BadRequestException);expect(prisma.enterpriseEvaluation.updateMany).not.toHaveBeenCalled();});
 it('detects a concurrent publication rather than returning a false success',async()=>{row.status='REVIEWED';row.reviewedAt=new Date();prisma.enterpriseEvaluation.updateMany.mockResolvedValue({count:0});await expect(service.action(user,'ev',{action:'PUBLISH',version:2,comment:'发布'})).rejects.toThrow(ConflictException);expect(auth.audit).not.toHaveBeenCalled();});
});
