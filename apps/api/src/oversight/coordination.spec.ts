import { BadRequestException } from '@nestjs/common';
import { inspectionSummary, readChecklist, readInspectionReport, validateChecklist, validateInspectionReport } from './coordination';
const checklist = [{ id: 'a', label: '核查通信状态' }, { id: 'b', label: '核查整改情况' }];
const report = () => ({ enterprises: 2, vehicles: 10, problemVehicles: 3, rectifiedVehicles: 2, checks: [{ itemId: 'a', status: 'NORMAL', note: '' }, { itemId: 'b', status: 'ISSUE', note: '仍有一辆待整改' }] });
describe('专项排查数据口径', () => {
  it('兼容没有检查清单或报告的历史事项', () => { expect(readChecklist(null)).toEqual([]); expect(readInspectionReport(null)).toBeNull(); expect(inspectionSummary([{ status: 'WAITING' }]).reportedCities).toBe(0); });
  it('拒绝重复的检查项编号', () => { expect(() => validateChecklist([checklist[0], checklist[0]])).toThrow(BadRequestException); });
  it('仅保存定义的检查项结果并保持清单顺序', () => { const value = report(); value.checks.reverse(); expect(validateInspectionReport(value, checklist).checks.map(row => row.itemId)).toEqual(['a', 'b']); });
  it('缺少统计或检查项时不能提交', () => { expect(() => validateInspectionReport(undefined, checklist)).toThrow(BadRequestException); expect(() => validateInspectionReport({ ...report(), checks: [report().checks[0]] }, checklist)).toThrow(BadRequestException); });
  it('拒绝重复或不属于本次排查的检查项', () => { expect(() => validateInspectionReport({ ...report(), checks: [report().checks[0], report().checks[0]] }, checklist)).toThrow(BadRequestException); expect(() => validateInspectionReport({ ...report(), checks: [report().checks[0], { itemId: 'foreign', status: 'NORMAL' }] }, checklist)).toThrow(BadRequestException); });
  it('问题或不适用结论必须给出说明', () => { for (const status of ['ISSUE', 'NOT_APPLICABLE']) expect(() => validateInspectionReport({ ...report(), checks: [{ itemId: 'a', status: 'NORMAL' }, { itemId: 'b', status, note: '' }] }, checklist)).toThrow(BadRequestException); });
  it('统计数不能为负、小数或超过数量范围', () => { for (const vehicles of [-1, .5, 1000001]) expect(() => validateInspectionReport({ ...report(), vehicles }, checklist)).toThrow(BadRequestException); });
  it('已整改不大于问题车辆，问题车辆不大于排查车辆', () => { expect(() => validateInspectionReport({ ...report(), problemVehicles: 11 }, checklist)).toThrow(BadRequestException); expect(() => validateInspectionReport({ ...report(), rectifiedVehicles: 4 }, checklist)).toThrow(BadRequestException); });
  it('汇总排除待响应、办理中和退回补充的数据', () => { const rows = ['WAITING', 'PROCESSING', 'SUBMITTED', 'CLOSED'].map(status => ({ status, reportJson: JSON.stringify(report()) })); expect(inspectionSummary(rows)).toMatchObject({ reportedCities: 2, totalCities: 4, vehicles: 20, problemVehicles: 6, rectifiedVehicles: 4, remainingVehicles: 2, rectificationRate: 66.7 }); });
  it('没有问题车辆时不虚构百分比完成率', () => { const result = inspectionSummary([{ status: 'SUBMITTED', reportJson: JSON.stringify({ ...report(), problemVehicles: 0, rectifiedVehicles: 0 }) }]); expect(result.rectificationRate).toBeNull(); });
});
