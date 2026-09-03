import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [alertToday, alertHigh, alertUnhandled, accidents, violations, offlineEvents] = await Promise.all([
    prisma.safetyAlert.count({ where: { occurredAt: { gte: today } } }),
    prisma.safetyAlert.count({ where: { level: 'HIGH' } }),
    prisma.safetyAlert.count({ where: { status: { in: ['PENDING_CONFIRMATION', 'PROCESSING'] } } }),
    prisma.accident.count({ where: { occurredAt: { gte: today } } }),
    prisma.violation.count({ where: { status: { in: ['UNHANDLED', 'PROCESSING'] } } }),
    prisma.offlineEvent.count({ where: { endedAt: null } }),
  ]);
  console.log({ alertToday, alertHigh, alertUnhandled, accidents, violations, offlineEvents });
  await prisma.$disconnect();
}
main().catch(console.error);
