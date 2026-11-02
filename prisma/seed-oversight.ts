import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { OversightService } from '../apps/api/src/oversight/oversight.service';

// This initializer adds linked provincial records without resetting city data.
// Record-generation provenance is documented in docs/province-oversight-data-sources.md.
const prisma = new PrismaClient();
async function main() {
  const administrator = await prisma.user.findFirst({ where: { accountLevel: 'PROVINCE', status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
  if (!administrator) throw new Error('请先建立有效省级监管账号');
  const workspaces = await prisma.cityWorkspace.findMany({ where: { cityCode: { in: ['370100', '370200', '371300'] } }, orderBy: { cityCode: 'asc' } });
  if (workspaces.length !== 3) throw new Error('请先完成济南、青岛、临沂城市工作空间初始化');
  const now = new Date(); const responded = new Date(now.getTime() - 40 * 60000); const submitted = new Date(now.getTime() - 15 * 60000); const dueAt = new Date(now.getTime() + 48 * 3600000);
  const resourceIds: Record<string, string[]> = {};
  for (const workspace of workspaces) {
    const city = workspace.cityName;
    const prefix = workspace.cityCode === '370100' ? '0531' : workspace.cityCode === '370200' ? '0532' : '0539';
    const resources = [
      { key: 'vehicle', kind: 'VEHICLE', name: `${city}应急配送运力组`, capacity: 8, conditions: '具备有效通行许可，按属地批准道路运行，单车载荷按车型核验' },
      { key: 'staff', kind: 'STAFF', name: `${city}运行保障值守组`, capacity: 6, conditions: '按有效班次和人车分配提供值守保障，具体调用需属地确认' },
      { key: 'energy', kind: 'ENERGY', name: `${city}配送场站补能保障点`, capacity: 12, conditions: '支持场站内补能和待命停放，需提前确认接口与开放时段' },
    ];
    resourceIds[workspace.cityCode] = [];
    for (const resource of resources) {
      const id = `sd-resource-${workspace.cityCode}-${resource.key}`;
      const { key: _key, ...data } = resource;
      await prisma.provinceResource.upsert({ where: { id }, create: { id, workspaceId: workspace.id, ...data, status: 'AVAILABLE', contactName: `${city}运行值班组`, contactPhone: `${prefix}88001107` }, update: {} });
      resourceIds[workspace.cityCode].push(id);
    }
  }
  const jinan = workspaces.find((row) => row.cityCode === '370100')!;
  const qingdao = workspaces.find((row) => row.cityCode === '370200')!;
  const linyi = workspaces.find((row) => row.cityCode === '371300')!;
  const matters = [
    { businessNo: 'SD-RISK-202610-001', kind: 'RISK_NOTICE', title: '秋季配送车辆路口通行风险核查', description: '请属地核查配送车辆路口通行、异常停车和远程值守保障情况，汇总风险点及处置记录。', level: 'HIGH', status: 'DISPATCHED', targets: [jinan, qingdao, linyi], assignmentStatus: 'WAITING', resourceIds: [] as string[] },
    { businessNo: 'SD-SUP-202610-001', kind: 'SUPERVISION', title: '长期离线车辆排查与整改督办', description: '对运行台账中持续离线车辆核对停运原因、设备状态及企业联系人，形成恢复接入或停运备案的闭环。', level: 'MEDIUM', status: 'RESPONDING', targets: [linyi], assignmentStatus: 'PROCESSING', resourceIds: [] as string[] },
    { businessNo: 'SD-CROSS-202610-001', kind: 'CROSS_CITY', title: '济青跨市运营档案协同核验', description: '围绕拟跨市运营主体与车辆，分别核对登记档案、许可条件及材料有效期，各市反馈属地核验结果。', level: 'MEDIUM', status: 'PENDING_REVIEW', targets: [jinan, qingdao], assignmentStatus: 'SUBMITTED', resourceIds: [] as string[] },
    { businessNo: 'SD-EMG-202610-001', kind: 'EMERGENCY', title: '鲁南应急保供运力协同准备', description: '汇总济南与临沂可调用配送运力、值守人员及补能保障，核验适用道路、载荷和保障时段后组织任务。', level: 'HIGH', status: 'DRAFT', targets: [jinan, linyi], assignmentStatus: 'WAITING', resourceIds: [resourceIds['370100'][0], resourceIds['371300'][0]] },
  ];
  for (const matter of matters) {
    const { targets, assignmentStatus, resourceIds: selectedResources, ...data } = matter;
    const logs = [{ action: 'CREATE', actorName: '省级运行监管组', at: new Date(now.getTime() - 60 * 60000).toISOString(), comment: '建立省级协同工作事项' }];
    if (data.status !== 'DRAFT') logs.push({ action: 'DISPATCH', actorName: '省级运行监管组', at: new Date(now.getTime() - 50 * 60000).toISOString(), comment: '下达属地核查与反馈要求' });
    const item = await prisma.provinceMatter.upsert({ where: { businessNo: data.businessNo }, create: { ...data, dueAt, basis: '省域运行安全协同工作安排', resourceIdsJson: JSON.stringify(selectedResources), logsJson: JSON.stringify(logs), createdById: administrator.id, createdByName: administrator.displayName, assignments: { create: targets.map((workspace) => ({ workspaceId: workspace.id, status: assignmentStatus, respondedAt: assignmentStatus !== 'WAITING' ? responded : null, submittedAt: assignmentStatus === 'SUBMITTED' ? submitted : null, feedback: assignmentStatus === 'SUBMITTED' ? `${workspace.cityName}已核对本市主体、车辆和许可档案，材料有效状态已确认，后续变更按属地规则维护。` : assignmentStatus === 'PROCESSING' ? '已组织属地企业核对设备状态和离线原因，正在汇总整改安排。' : null, evidenceNote: assignmentStatus === 'SUBMITTED' ? '核验依据为本市车辆档案、许可台账和企业提交材料。' : null })) } }, update: {} });
    if (item.status !== 'DRAFT') for (const workspace of targets) {
      const noticeId = `notice-${data.businessNo}-${workspace.cityCode}`;
      await prisma.workspaceNotice.upsert({ where: { id: noticeId }, create: { id: noticeId, workspaceId: workspace.id, title: '省级事项待办理', content: `${data.businessNo} ${data.title}` }, update: {} });
    }
  }
  const actor = { id: administrator.id, username: administrator.username, displayName: administrator.displayName, portal: 'REGULATORY', accountLevel: 'PROVINCE', organizationId: administrator.organizationId, enterpriseId: null, roles: [], permissions: ['system:organization:update', 'system:organization:read', 'dashboard:view'] };
  const audit = { audit: async (user: any, module: string, objectType: string, objectId: string, action: string, detail: unknown) => prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId, module, objectType, objectId, action, result: 'SUCCESS', detail: JSON.stringify(detail) } }) };
  const service = new OversightService(prisma as any, audit as any);
  const period = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 7);
  const result = await service.generateEvaluations(actor, { period });
  console.log(JSON.stringify({ workspaces: workspaces.length, resources: await prisma.provinceResource.count(), matters: await prisma.provinceMatter.count(), evaluations: result.generated, preservedPublished: result.skipped }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
