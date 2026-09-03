const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

(async () => {
  const [users, roles, enterprises, vehicles, approvedApplications, approvalResults, closedEmergencyTasks, auditLogs] = await Promise.all([
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.role.count({ where: { status: 'ACTIVE' } }),
    prisma.enterprise.count({ where: { status: 'ACTIVE' } }),
    prisma.vehicle.findMany({ where: { deletedAt: null }, include: { enterprise: true } }),
    prisma.admissionApplication.count({ where: { status: 'APPROVED' } }),
    prisma.approvalResult.count({ where: { status: 'VALID' } }),
    prisma.emergencyTask.findMany({ where: { status: 'CLOSED' }, include: { logs: true } }),
    prisma.auditLog.count(),
  ]);

  assert.ok(users >= 6 && roles >= 6 && enterprises >= 2 && vehicles.length >= 30, 'seed baseline is incomplete');
  assert.ok(vehicles.every((vehicle) => vehicle.organizationId === vehicle.enterprise.organizationId), 'vehicle and enterprise organization scopes diverge');
  assert.ok(approvedApplications > 0 && approvalResults >= approvedApplications, 'approved applications are missing valid results');
  assert.ok(
    closedEmergencyTasks.length > 0
      && closedEmergencyTasks.every((task) => task.logs.length > 0 && task.respondedAt && task.feedback && task.evaluationScore && task.closedAt),
    'closed emergency tasks are missing lifecycle evidence',
  );
  assert.ok(auditLogs > 0, 'audit trail is empty');

  const indicators = await prisma.evaluationIndicator.findMany({ where: { status: 'ACTIVE' } });
  const weightByOrganization = indicators.reduce((groups, item) => {
    groups[item.organizationId] = (groups[item.organizationId] || 0) + item.weight;
    return groups;
  }, {});
  assert.ok(Object.keys(weightByOrganization).length > 0, 'evaluation indicators are missing');
  for (const [organizationId, weight] of Object.entries(weightByOrganization)) {
    assert.equal(weight, 100, `evaluation weights for ${organizationId} must total 100`);
  }

  const expiredRefreshTokens = await prisma.refreshToken.count({ where: { expiresAt: { lte: new Date() } } });
  assert.equal(expiredRefreshTokens, 0, 'expired refresh tokens should be cleaned up');

  console.log(JSON.stringify({
    ok: true,
    users,
    roles,
    enterprises,
    vehicles: vehicles.length,
    approvedApplications,
    closedEmergencyTasks: closedEmergencyTasks.length,
    auditLogs,
    evaluationWeightGroups: Object.keys(weightByOrganization).length,
  }, null, 2));
})()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error.stack || error);
    process.exit(1);
  });
