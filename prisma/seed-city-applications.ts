import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Local business records requested for the provincial application review screen.
// Names, contacts, application contents and process states are constructed data;
// provenance is retained in docs/shandong-data-provenance.md, not in UI labels.
const prisma = new PrismaClient();
const root = fileURLToPath(new URL('../', import.meta.url));
const coreModules = ['ARCHIVES', 'ADMISSION', 'OPERATIONS', 'SAFETY'];
const fixtures = [
  { code: '370300', city: '淄博市', prefix: '0533', username: 'zibo_city_admin', vehicles: 180, modules: [...coreModules, 'ANALYTICS'], status: 'SUBMITTED', submittedAt: '2026-10-28T15:40:00+08:00', scope: '张店区城市配送站点及周边寄递服务线路' },
  { code: '370700', city: '潍坊市', prefix: '0536', username: 'weifang_city_admin', vehicles: 260, modules: [...coreModules, 'ANALYTICS', 'GOVERNANCE'], status: 'SUBMITTED', submittedAt: '2026-10-28T14:50:00+08:00', scope: '奎文区、潍城区寄递集配站点和城市配送运行区域' },
  { code: '370600', city: '烟台市', prefix: '0535', username: 'yantai_city_admin', vehicles: 220, modules: [...coreModules, 'ANALYTICS'], status: 'SUBMITTED', submittedAt: '2026-10-28T13:35:00+08:00', scope: '芝罘区、莱山区快递集散节点及末端配送线路' },
  { code: '370800', city: '济宁市', prefix: '0537', username: 'jining_city_admin', vehicles: 160, modules: [...coreModules], status: 'SUBMITTED', submittedAt: '2026-10-28T11:20:00+08:00', scope: '任城区城市配送网点与寄递运营企业接入范围' },
  { code: '371000', city: '威海市', prefix: '0631', username: 'weihai_city_admin', vehicles: 90, modules: [...coreModules, 'GOVERNANCE'], status: 'RETURNED', submittedAt: '2026-10-28T09:15:00+08:00', processedAt: '2026-10-28T10:30:00+08:00', comment: '请补充拟任管理员授权说明，并明确车辆数据接入联系人和异常处置值守安排。', scope: '环翠区寄递网点和社区配送服务区域' },
  { code: '371400', city: '德州市', prefix: '0534', username: 'dezhou_city_admin', vehicles: 120, modules: [...coreModules], status: 'WITHDRAWN', submittedAt: '2026-10-27T16:10:00+08:00', processedAt: '2026-10-28T10:10:00+08:00', comment: '申请单位调整首批接入企业与车辆范围，撤回后重新报送。', scope: '德城区、陵城区寄递集配节点及配送服务区域' },
] as const;

async function main() {
  const existing = await prisma.cityApplication.findMany({ select: { businessNo: true, cityCode: true, kind: true, status: true } });
  const workspaces = await prisma.cityWorkspace.findMany({ select: { cityCode: true } });
  const users = await prisma.user.findMany({ select: { username: true } });
  const pending = fixtures.filter(item => !existing.some(row => row.businessNo === `CITY-20261028-${item.code}-001`)
    && !workspaces.some(row => row.cityCode === item.code)
    && !users.some(row => row.username === item.username)
    && !existing.some(row => row.cityCode === item.code && row.kind === 'NEW' && ['SUBMITTED', 'RETURNED', 'APPROVED'].includes(row.status)));
  if (!pending.length) {
    console.log(JSON.stringify({ created: 0, preserved: fixtures.length, message: 'Existing applications and their current workflow states are preserved.' }));
    return;
  }
  const backupRoot = resolve(root, 'tmp/backups');
  await mkdir(backupRoot, { recursive: true });
  const backup = join(backupRoot, `regulatory-before-city-applications-20261028-${randomBytes(3).toString('hex')}.db`);
  if (dirname(backup) !== backupRoot) throw new Error('Backup path is outside the intended directory');
  await prisma.$executeRawUnsafe(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);

  const created = await prisma.$transaction(async tx => {
    const rows: Array<{ businessNo: string; cityName: string; status: string }> = [];
    for (const item of pending) {
      // Recheck under the write transaction so reruns cannot replace reviewed data.
      const businessNo = `CITY-20261028-${item.code}-001`;
      if (await tx.cityApplication.findUnique({ where: { businessNo } })) continue;
      if (await tx.cityWorkspace.findUnique({ where: { cityCode: item.code } })) continue;
      if (await tx.cityApplication.findFirst({ where: { cityCode: item.code, kind: 'NEW', status: { in: ['SUBMITTED', 'RETURNED', 'APPROVED'] } } })) continue;
      const submittedAt = new Date(item.submittedAt);
      const processedAt = 'processedAt' in item ? new Date(item.processedAt) : submittedAt;
      const contactName = `${item.city.replace(/市$/, '')}平台联络岗`;
      const materialNote = `申请接入范围：${item.scope}。预计纳管无人配送车辆${item.vehicles}辆，覆盖企业与车辆建档、通行许可、运行监测及安全事件处置。拟任管理员和联系电话随申请登记，附件按实际接入材料补充。`;
      const history: Array<Record<string, unknown>> = [{ revision: 1, action: 'SUBMIT', actor: contactName, at: submittedAt.toISOString(), source: 'LOCAL_BUSINESS_INITIALIZATION_20261028', snapshot: { modules: [...item.modules], materialNote, unitName: `${item.city}交通运输局`, adminUsername: item.username } }];
      if (item.status !== 'SUBMITTED') history.push({ revision: 1, action: item.status === 'RETURNED' ? 'RETURN' : 'WITHDRAW', actor: item.status === 'RETURNED' ? '省级平台受理岗' : contactName, at: processedAt.toISOString(), comment: 'comment' in item ? item.comment : undefined });
      const record = await tx.cityApplication.create({ data: {
        id: `sd-city-application-${item.code}-20261028`, businessNo, kind: 'NEW', cityCode: item.code, cityName: item.city,
        unitName: `${item.city}交通运输局`, contactName, contactPhone: `${item.prefix}-00001801`, adminName: `${item.city}平台管理员`, adminUsername: item.username,
        modulesJson: JSON.stringify(item.modules), expectedVehicles: item.vehicles, materialNote, status: item.status,
        trackingHash: createHash('sha256').update(randomBytes(32)).digest('hex'), historyJson: JSON.stringify(history),
        reviewComment: item.status === 'RETURNED' && 'comment' in item ? item.comment : null, createdAt: submittedAt, updatedAt: processedAt,
      } });
      if (record.status === 'SUBMITTED') await tx.workspaceNotice.create({ data: { id: `notice-${record.id}`, workspaceId: null, title: '地市开通申请待审核', content: `${record.cityName} ${record.unitName} 提交开通申请 ${record.businessNo}`, createdAt: submittedAt } });
      rows.push({ businessNo, cityName: record.cityName, status: record.status });
    }
    return rows;
  });
  console.log(JSON.stringify({ created: created.length, preserved: fixtures.length - created.length, applications: created, backup }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
