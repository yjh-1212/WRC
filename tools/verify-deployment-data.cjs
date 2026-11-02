// Read-only deployment gate: never seed or replace the committed database.
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const integrity = await db.$queryRawUnsafe('PRAGMA integrity_check');
  if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') throw new Error('Database integrity check failed');
  const foreignKeys = await db.$queryRawUnsafe('PRAGMA foreign_key_check');
  if (foreignKeys.length) throw new Error(`Database has ${foreignKeys.length} invalid references`);
  const users = await db.user.count();
  if (!users) throw new Error('Expected the full local database; empty databases must not be seeded during deployment');
  const enterprises = await db.enterprise.count();
  const vehicles = await db.vehicle.count();
  console.log(JSON.stringify({ integrity: 'ok', users, enterprises, vehicles }));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
