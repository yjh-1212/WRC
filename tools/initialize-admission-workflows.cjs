const {PrismaClient}=require('@prisma/client');const {randomUUID}=require('node:crypto');const path=require('node:path');
process.env.DATABASE_URL??='file:'+path.resolve('data/regulatory.db').replace(/\\/g,'/');
const db=new PrismaClient();
(async()=>{try{
  const types={VEHICLE_REGISTRATION:'车辆备案及增补',DEMONSTRATION:'示范应用',LICENSE_CHANGE:'许可变更',LICENSE_EXIT:'许可退出'};
  const template=await db.processDefinition.findFirst({where:{workspaceId:null,applicationType:'ROAD_TEST',status:'ACTIVE'},include:{nodes:{orderBy:{orderNo:'asc'}}}});
  for(const [type,name] of Object.entries(types)){
    if(await db.processDefinition.findFirst({where:{workspaceId:null,applicationType:type,status:'ACTIVE'}}))continue;
    const nodes=template?.nodes.length?template.nodes.map(n=>({nodeCode:n.nodeCode,name:n.name,orderNo:n.orderNo,approvalRoleCode:n.approvalRoleCode,timeLimitHours:n.timeLimitHours,countersignMode:n.countersignMode,canReturn:n.canReturn})):[{nodeCode:'REVIEW',name:'业务审核',orderNo:1,approvalRoleCode:'APPROVER',timeLimitHours:48,canReturn:true}];
    await db.processDefinition.create({data:{workspaceId:null,businessNo:'PROC-'+randomUUID(),code:'ADMISSION_'+type+'_V1',name:name+'默认流程',applicationType:type,status:'ACTIVE',version:1,description:'市级可创建本市流程覆盖共享模板',nodes:{create:nodes}}});console.log('Added '+name+' workflow');
  }
}finally{await db.$disconnect()}})().catch(e=>{console.error(e);process.exitCode=1});
