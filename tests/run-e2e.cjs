const { spawnSync } = require('node:child_process');
const path = require('node:path');

const phases = process.argv.slice(2).length ? process.argv.slice(2) : ['phase1', 'phase2', 'phase3', 'phase4', 'phase5', 'phase6', 'phase7', 'phase8', 'enterprise-accounts', 'system-catalog', 'cockpit'];
for (const phase of phases) {
  const file = path.join(__dirname, 'e2e', `${phase}.cjs`);
  console.log(`\n=== ${phase} ===`);
  const result = spawnSync(process.execPath, [file], { cwd: process.cwd(), stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
