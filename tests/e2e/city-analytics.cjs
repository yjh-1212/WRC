// Read-only browser acceptance: form drafts stay in this isolated browser context.
const {chromium,request}=require('playwright');
const {expect}=require('playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const web=process.env.TARGET_URL||'http://127.0.0.1:5173',api=process.env.API_URL||'http://127.0.0.1:8080/api';
const out=path.resolve('test-results/city-analytics'),checks=[],errors=[];
let browser,http,page,passed=false;
const pages=[['operations','运行分析','查看明细'],['safety','安全分析','查看事件'],['evaluations','企业评价','详情'],['credit','信用管理','详情'],['reports','统计报表','预览']];
(async()=>{fs.mkdirSync(out,{recursive:true});http=await request.newContext();
try{
 const response=await http.post(api+'/auth/login',{data:{username:'jinan_admin',password:process.env.TEST_PASSWORD||'Wrc@2026!'}});
 assert.equal(response.status(),200);const tokens=(await response.json()).data;
 browser=await chromium.launch({headless:false});const context=await browser.newContext({viewport:{width:1920,height:1080},acceptDownloads:true});
 await context.addInitScript(v=>{if(!sessionStorage.getItem('ca-test-seeded')){sessionStorage.setItem('wrc-access-token',v.accessToken);localStorage.setItem('wrc-refresh-token',v.refreshToken);sessionStorage.setItem('ca-test-seeded','1');}},tokens);
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',async r=>{if(r.status()===401){let message='';try{message=(await r.json()).message}catch{}errors.push('401 '+new URL(r.url()).pathname+' '+message);}});
 const drawer=()=>page.locator('.ca-drawer:visible').last();
 async function stableDrawer(width){width=await page.evaluate(()=>document.documentElement.clientWidth);await expect(drawer()).toBeVisible();await expect.poll(async()=>drawer().evaluate(el=>Math.round(el.getBoundingClientRect().right))).toBe(width);await expect.poll(async()=>drawer().evaluate(el=>el.getBoundingClientRect().left>=-1)).toBe(true);await expect(drawer().locator('.el-skeleton')).toHaveCount(0);}
 async function noOverflow(){await expect.poll(async()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
 async function openRoute(route,label){await page.goto(web+'/analytics/'+route);await expect(page.getByRole('heading',{name:label,level:1,exact:true})).toBeVisible();await expect(page.locator('.ca-page .el-loading-mask')).toHaveCount(0);await expect(page.locator('.ca-table .el-table__row').first()).toBeVisible();if(route==='operations'||route==='safety')await expect(page.locator('.analytics-chart[data-chart-ready=true]')).toHaveCount(2);}
 for(const [route,label,action]of pages){
  await openRoute(route,label);await noOverflow();await page.screenshot({path:path.join(out,route+'-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:action,exact:true}).first().click();await stableDrawer(1920);
  assert(new URL(page.url()).searchParams.has('id'));await page.screenshot({path:path.join(out,route+'-drawer.png'),fullPage:true});
  await page.reload();await stableDrawer(1920);
  await page.getByRole('button',{name:'打开AI助手',exact:true}).click();await expect(page.locator('.assistant-drawer')).toBeVisible();await expect(page.getByLabel('向通用AI助手提问')).toBeVisible();
  await page.locator('.assistant-drawer').getByRole('button',{name:'关闭此对话框',exact:true}).click();await expect(page.locator('.assistant-drawer')).toBeHidden();
  await drawer().getByRole('button',{name:'关闭',exact:true}).last().click();await expect(page.locator('.ca-drawer:visible')).toHaveCount(0);await noOverflow();
 }
 checks.push('five desktop screens, stable full-height drawers, reloadable detail URLs and generic AI on every page');
 for(const [route,label]of pages.slice(2)){
  await openRoute(route,label);await page.getByRole('textbox',{name:'关键词',exact:true}).fill('不存在的验收查询-'+Date.now());await page.getByRole('button',{name:'查询',exact:true}).click();
  await expect(page.locator('.ca-table .el-table__row')).toHaveCount(0);assert(new URL(page.url()).searchParams.get('q'));
  await page.reload();await expect(page.getByRole('textbox',{name:'关键词',exact:true})).not.toHaveValue('');
  await page.getByRole('button',{name:'重置',exact:true}).click();await expect(page.locator('.ca-table .el-table__row').first()).toBeVisible();
 }
 checks.push('server-side searches, true empty states, URL filter restoration and reset');
 await page.route('**/api/city-analytics/credit?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'验收临时加载失败'})}));
 await page.goto(web+'/analytics/credit');await expect(page.getByRole('alert').filter({hasText:'验收临时加载失败'})).toBeVisible();await expect(page.locator('.ca-table')).toHaveCount(0);
 await page.unroute('**/api/city-analytics/credit?*');await page.getByRole('button',{name:'重试',exact:true}).click();await expect(page.locator('.ca-table .el-table__row').first()).toBeVisible();
 checks.push('failed requests stay distinct from empty and recover through retry');
 await openRoute('evaluations','企业评价');await page.getByRole('button',{name:'评价规则',exact:true}).click();await stableDrawer(1920);
 await expect(drawer().getByLabel('规则名称',{exact:true})).toBeVisible();await expect(drawer().getByRole('button',{name:'发布新版本',exact:true})).toBeVisible();
 await drawer().getByRole('button',{name:'关闭',exact:true}).last().click();
 await page.getByRole('button',{name:'新建评价',exact:true}).click();let dialog=page.getByRole('dialog',{name:'新建企业评价',exact:true});await dialog.getByLabel('评价名称',{exact:true}).fill('浏览器验收未提交评价草稿');await dialog.getByRole('button',{name:'取消',exact:true}).click();
 await page.reload();await page.getByRole('button',{name:'新建评价',exact:true}).click();dialog=page.getByRole('dialog',{name:'新建企业评价',exact:true});await expect(dialog.getByLabel('评价名称',{exact:true})).toHaveValue('浏览器验收未提交评价草稿');await dialog.getByRole('button',{name:'取消',exact:true}).click();
 await openRoute('credit','信用管理');await page.getByRole('button',{name:'记录信用事项',exact:true}).click();dialog=page.getByRole('dialog',{name:'记录信用事项',exact:true});await expect(dialog.getByRole('combobox',{name:'关联来源',exact:true})).toBeDisabled();await dialog.getByLabel('事实与依据',{exact:true}).fill('浏览器验收未提交信用草稿');await dialog.getByRole('button',{name:'取消',exact:true}).click();
 await page.reload();await page.getByRole('button',{name:'记录信用事项',exact:true}).click();dialog=page.getByRole('dialog',{name:'记录信用事项',exact:true});await expect(dialog.getByLabel('事实与依据',{exact:true})).toHaveValue('浏览器验收未提交信用草稿');await dialog.getByRole('button',{name:'取消',exact:true}).click();
 await page.getByRole('button',{name:'信用规则',exact:true}).first().click();await stableDrawer(1920);await expect(drawer().getByLabel('轻微扣分值',{exact:true})).toBeVisible();await drawer().getByRole('button',{name:'关闭',exact:true}).last().click();
 checks.push('rule editors, create forms, source prerequisites and draft recovery without business mutations');
 await openRoute('reports','统计报表');await page.getByRole('button',{name:'生成报表',exact:true}).click();dialog=page.getByRole('dialog',{name:'生成统计报表',exact:true});await dialog.getByLabel('报表名称',{exact:true}).fill('');await dialog.getByRole('button',{name:'生成并预览',exact:true}).click();await expect(page.getByText('请填写报表名称并选择统计周期',{exact:true})).toBeVisible();
 await dialog.getByLabel('报表名称',{exact:true}).fill('浏览器验收未提交报表草稿');await dialog.getByRole('button',{name:'取消',exact:true}).click();
 const single=page.waitForEvent('download');await page.getByRole('button',{name:'导出',exact:true}).first().click();await(await single).saveAs(path.join(out,'report-browser.csv'));
 await page.locator('.ca-table .el-table__row').nth(0).locator('label.el-checkbox').click();await page.locator('.ca-table .el-table__row').nth(1).locator('label.el-checkbox').click();
 const batch=page.waitForEvent('download');await page.getByRole('button',{name:/^导出所选/}).click();await(await batch).saveAs(path.join(out,'reports-browser.zip'));
 assert.equal(fs.readFileSync(path.join(out,'reports-browser.zip')).subarray(0,2).toString(),'PK');
 checks.push('report form validation, real CSV download and selected-report ZIP download');
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
  await page.setViewportSize(viewport);
  for(const [route,label,action]of pages){await openRoute(route,label);await noOverflow();await page.screenshot({path:path.join(out,route+'-'+viewport.width+'.png'),fullPage:true});await page.getByRole('button',{name:action,exact:true}).first().click();await stableDrawer(viewport.width);await noOverflow();if(viewport.width===390)await page.screenshot({path:path.join(out,route+'-mobile-drawer.png'),fullPage:false});await drawer().getByRole('button',{name:'关闭',exact:true}).last().click();}
 }
 checks.push('all five pages and drawers fit 1440 and 390 widths without page overflow');
 assert.deepEqual(errors,[]);passed=true;
}finally{if(!passed&&page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'browser-acceptance.json'),JSON.stringify({passed,checks,errors},null,2));await browser?.close();await http?.dispose();}
console.log(JSON.stringify({passed,checks,errors}));})().catch(e=>{console.error(e);process.exitCode=1;});

