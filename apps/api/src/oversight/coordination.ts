import { BadRequestException } from '@nestjs/common';
import { InspectionCheckDto, InspectionReportDto } from './dto';

export function readChecklist(value?: string | null): InspectionCheckDto[] {
  try { const rows = JSON.parse(value || '[]'); return Array.isArray(rows) ? rows.filter(row => row && typeof row.id === 'string' && typeof row.label === 'string') : []; } catch { return []; }
}
export function validateChecklist(rows: InspectionCheckDto[] = []) {
  if (!rows.length || rows.length > 30 || new Set(rows.map(row => row.id)).size !== rows.length) throw new BadRequestException('专项排查需设置1至30项不重复的检查内容');
  return rows.map(row => { if (!/^[a-zA-Z0-9_-]{1,40}$/.test(row.id) || row.label.trim().length < 2 || row.label.length > 200) throw new BadRequestException('检查项编号或内容不完整'); return { id: row.id, label: row.label.trim() }; });
}
export function validateInspectionReport(value: InspectionReportDto | undefined, checklist: InspectionCheckDto[]) {
  if (!value) throw new BadRequestException('请填写专项排查统计数据和检查结果');
  const fields = ['enterprises', 'vehicles', 'problemVehicles', 'rectifiedVehicles'] as const;
  if (fields.some(key => !Number.isInteger(value[key]) || value[key] < 0 || value[key] > 1000000)) throw new BadRequestException('排查统计数量应为0至1000000的整数');
  if (value.problemVehicles > value.vehicles || value.rectifiedVehicles > value.problemVehicles) throw new BadRequestException('已整改车辆数不能超过问题车辆数，问题车辆数不能超过排查车辆数');
  if (!Array.isArray(value.checks) || value.checks.length !== checklist.length || new Set(value.checks.map(item => item.itemId)).size !== checklist.length) throw new BadRequestException('请逐项填写全部检查结果，检查项不能重复');
  const checks = checklist.map(item => {
    const result = value.checks.find(row => row.itemId === item.id);
    if (!result || !['NORMAL', 'ISSUE', 'NOT_APPLICABLE'].includes(result.status)) throw new BadRequestException(`请填写“${item.label}”的检查结果`);
    const note = result.note?.trim() || '';
    if (note.length > 1000 || result.status !== 'NORMAL' && note.length < 2) throw new BadRequestException(`“${item.label}”发现问题或不适用时，请补充说明`);
    return { itemId: item.id, status: result.status, note };
  });
  return { enterprises: value.enterprises, vehicles: value.vehicles, problemVehicles: value.problemVehicles, rectifiedVehicles: value.rectifiedVehicles, checks };
}
export function readInspectionReport(value?: string | null) {
  if (!value) return null;
  try { const report = JSON.parse(value); if (['enterprises', 'vehicles', 'problemVehicles', 'rectifiedVehicles'].some(key => !Number.isInteger(report?.[key]) || report[key] < 0)) return null; return report as InspectionReportDto; } catch { return null; }
}
export function inspectionSummary(assignments: Array<{ status: string; reportJson?: string | null }>) {
  const reports = assignments.filter(row => ['SUBMITTED', 'CLOSED'].includes(row.status)).map(row => readInspectionReport(row.reportJson)).filter((row): row is InspectionReportDto => !!row);
  const totals = reports.reduce((sum, row) => ({ enterprises: sum.enterprises + row.enterprises, vehicles: sum.vehicles + row.vehicles, problemVehicles: sum.problemVehicles + row.problemVehicles, rectifiedVehicles: sum.rectifiedVehicles + row.rectifiedVehicles }), { enterprises: 0, vehicles: 0, problemVehicles: 0, rectifiedVehicles: 0 });
  return { ...totals, reportedCities: reports.length, totalCities: assignments.length, remainingVehicles: totals.problemVehicles - totals.rectifiedVehicles, rectificationRate: totals.problemVehicles ? Math.round(totals.rectifiedVehicles / totals.problemVehicles * 1000) / 10 : null };
}
