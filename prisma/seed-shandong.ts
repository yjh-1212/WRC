import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/** Safe initialization: existing city applications and business records survive. */
const require=createRequire(import.meta.url);
const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const prisma=new PrismaClient();
function run(script:string){
  const result=spawnSync(process.execPath,[require.resolve('tsx/cli'),fileURLToPath(new URL(script,import.meta.url))],{cwd:projectRoot,env:process.env,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`${script} exited with status ${result.status}`);
}
async function main(){
  const [users,enterprises,applications]=await Promise.all([prisma.user.count(),prisma.enterprise.count(),prisma.cityApplication.count()]);
  await prisma.$disconnect();
  if(users===0&&enterprises===0&&applications===0){
    console.log('Initializing a clean database.');
    run('./seed.ts');
  }else{
    console.log('Existing records detected; preserving city applications, accounts and business data.');
  }
  run('./migrate-shandong.ts');
  run('./enrich-shandong.ts');
  run('./seed-oversight.ts');
  run('./seed-city-applications.ts');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
