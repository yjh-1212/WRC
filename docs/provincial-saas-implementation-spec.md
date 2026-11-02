# 省级统一部署与山东业务迁移实施规格

日期：2026-10-28。输入：已确认的 30 项任务清单与本轮实施授权。

## 范围与成功条件

在现有 Vue3/Element Plus/NestJS/Prisma 项目中实现完整省市开通链条、现有业务数据隔离、授权生命周期、管理员保护、站内通知与城市用量；把现有数据库及地图业务迁移到山东。保留现有未提交改动及原业务，先做 SQLite 在线备份。原始来源与合成数据的生成记录留在内部文档，页面不显示“模拟、示例、演示、测试数据”等标签；不将合成记录描述为真实厂商接入。

不实现在线支付、短信邮件外部发送、实际控车、国家平台或交管真实接口。邀请通过授权管理员可复制的一次性激活链接交付，界面明确显示待激活，不伪称消息送达。

## 数据契约

- CityWorkspace: id, cityCode(unique), cityName, organizationId(unique，根机构), status(PENDING_ACTIVATION/ACTIVE/SUSPENDED), modulesJson(string[]), validUntil(DateTime nullable), quotasJson, configJson, createdAt, updatedAt。所有已有机构树中的子机构归属工作空间。
- User 增加 workspaceId(nullable), accountLevel(PROVINCE/CITY/ENTERPRISE/OPERATIONS，默认 CITY), authVersion(default0)。Organization、Role 增加 workspaceId(nullable)。AuthUser 增加这些字段及 workspace 对象、scopeOrganizationIds，角色与权限仅从有效成员/角色计算。
- CityApplication: id, businessNo(unique), kind(NEW/EXTEND/RENEW/ADMIN_CHANGE), workspaceId?, cityCode, cityName, unitName, contactName, contactPhone, adminName, adminUsername, modulesJson, expectedVehicles, materialNote, status(SUBMITTED/RETURNED/REJECTED/APPROVED/WITHDRAWN), trackingHash, revision, historyJson, reviewComment?, createdAt, updatedAt。
- WorkspaceInvitation: id, workspaceId, username, displayName, roleCode(CITY_ADMIN/CITY_USER), tokenHash(unique), expiresAt, acceptedAt?, revokedAt?, createdAt。
- ProvisionJob: id, applicationId(unique), workspaceId?, status(PENDING/RUNNING/SUCCEEDED/FAILED), error?, attempts, createdAt, updatedAt。
- WorkspaceNotice: id, workspaceId?, title, content, readAt?, createdAt。操作审计沿用 AuditLog，记录 workspace/city/action/target 的元数据。
- ApplicationMaterial: id, applicationId（关联 CityApplication）, originalName, mimeType, size, storageName（私有随机名）, sha256, revision, deletedAt?, createdAt。文件保存在 data/saas-materials，不作为静态资源发布，删除采用归档标记保留历史材料。
- 独立业务功能模块键：ARCHIVES, ADMISSION, OPERATIONS, SAFETY, ANALYTICS, GOVERNANCE；系统成员/工作空间管理是基本能力，不能因普通模块关闭而失去管理或恢复入口。

## HTTP 契约

统一沿用 {code,message,data,timestamp,requestId} 封装。以下路径都以 /api 开头；列表 {items,total,page,pageSize}；JSON 编辑字符串在 API 输出时展开为 modules、quotas、config、history。日期均 ISO8601。

公开入口：
- GET /saas/catalog → {cities:[{code,name}],modules:[{code,name}]}。
- POST /saas/applications body {cityCode,unitName,contactName,contactPhone,adminName,adminUsername,modules:string[],expectedVehicles:number,materialNote:string} → {application,trackingSecret}。创建成功后使用该申请凭证提交实际授权材料文件。
- POST /saas/applications/track body {businessNo,trackingSecret} → application。凭证验证，返回内容不包含 trackingHash。
- POST /saas/applications/:id/resubmit body {trackingSecret,...可编辑申请字段} → application；只允许 RETURNED。
- POST /saas/applications/:id/withdraw body {trackingSecret} → application；只允许 SUBMITTED/RETURNED。
- POST /saas/applications/:id/materials multipart {file,trackingSecret} → {materials}；每份申请最多3份有效文件，单文件≤2MB，仅PDF/PNG/JPG，校验实际内容、MIME及扩展名，重传相同摘要不重复占用名额。
- DELETE /saas/applications/:id/materials/:materialId body {trackingSecret} → {materials}；仅 SUBMITTED/RETURNED 可更正，归档原文件及历史版本。
- POST /saas/applications/:id/materials/:materialId/download body {trackingSecret} → 原始文件附件流；申请人仅访问本申请的有效材料，不在URL携带凭证。
- POST /saas/activate body {token,password} → {activated:true,username}。密码至少8位且含大小写、数字、符号；邀请单次有效，重发作废原邀请。

省级专用：
- GET /saas/applications?q=&status=&page=&pageSize= → 列表。
- POST /saas/applications/:id/review body {action:APPROVE|RETURN|REJECT,comment,modules?:string[],validUntil?:string,quotas?:object} → {application,job?,workspace?,invitation?:{id,username,activationToken,expiresAt}}。批准不等于开通成功，开通任务结果独立显示。
- POST /saas/applications/:id/provision → 同开通结果；支持失败重试，不重复创建。
- GET /saas/workspaces?q=&status=&page=&pageSize= → 城市列表含管理员、用量、modules。
- PATCH /saas/workspaces/:id body {status?,modules?,validUntil?,quotas?,config?,reason} → workspace；收回权限即时生效。
- POST /saas/workspaces/:id/invitations body {username,displayName,roleCode?} → invitation（含本次 activationToken，仅对授权管理者显示）。
- POST /saas/workspaces/:id/recover-admin body {username,displayName,reason} → invitation。记录核验说明及恢复操作。
- GET /saas/applications/:id/materials/:materialId/download → 原始文件附件流；省级按权限查看，保留下载审计，下载前校验文件摘要。application.materials 提供有效材料，materialHistory 提供历次材料元数据。

省市管理：
- GET /saas/current → {workspace|null,modules,usage,checklist,notices,grants/history}；省级 workspace=null。
- GET /saas/members → {items}，含 roles、accountLevel、organization、status。
- POST /saas/members body {username,displayName,password,roleCode:CITY_ADMIN|CITY_USER,organizationId?} → member；只在本市授予本市角色。
- PATCH /saas/members/:id body {status?:ACTIVE|DISABLED,roleCode?,displayName?} → member；保留最后一位有效管理员，所有变更方式都适用。
- POST /saas/transfer-admin body {targetUserId} → {transferred:true}；目标必须已激活且有效，事务内先任命再解除本人管理员。
- POST /saas/change-requests body {kind:EXTEND|RENEW|ADMIN_CHANGE,modules?,materialNote,adminName?,adminUsername?} → application；省级仍通过 review 办理。
- POST /saas/notices/:id/read → {read:true}。
- POST /saas/current/confirm-rules → {confirmed:true,config}；本市管理员确认当前初始化规则，记录确认人和时间。

## 访问与失败规则

AC01：两个城市的数据在列表、详情、选择项、地图、统计、导出及写入关联中隔离，区县范围不超出已授权机构；省级可按授权下钻。所有已有业务服务均经过统一后端范围控制，不能靠前端过滤。
AC02：市级不能创建省级角色、外市用户、外市机构或把记录关联外市对象。用户角色变更也不能绕过最后管理员保护。权限从数据库重新核验，旧登录凭证在撤权后失效。
AC03：业务模块授权同时控制菜单和 API。到期/暂停工作空间保留历史只读与管理恢复入口、安全处置必要接口及遥测接入；禁止新的准入和普通管理写入，返回明确403。省级处理不受市级暂停阻挡。
AC04：审批重复提交、开通失败、重试、邀请过期重发可恢复，不产生重复城市及重复管理员；公开跟踪凭证不能访问其他申请。
AC04a：正常邀请不能重置已激活成员的密码；只有省级显式核验恢复流程可以生成恢复凭证，激活不改变其既有城市/门户/账号层级且保留已有角色关系。企业及省级账号不能通过城市邀请转换身份。
AC05：完整申请、补正、批准、激活、登录、分权、扩展/续期、交接、恢复路径可操作；审核驳回/返回理由必填，所有权限变更有审计。
AC06：城市首页清单、站内通知、用量和状态来自实际数据库；未接入外部通知渠道不显示已发送。
AC07：山东16市行政区划、济南/青岛/临沂等城市业务关联真实地理区域；企业、车辆、许可、轨迹、运行、安全事件、评价、信用和报表关系完整，无杭州/浙江业务残留。全国地图可保留其他省份地理参考，不作为业务数据残留。
AC08：UI沿用现有Vue/Element Plus布局；独立页面路由、省级导航、城市身份显示、搜索状态筛选分页、加载/错误/空态齐全。普通市级无法进入省级开通页面。
AC09：至少两个城市及省级/市级/区县/企业/运维身份的自动化正反例通过；API构建、前端构建和关键浏览器流程通过；保存测试记录。
AC10：材料上传凭证错误、伪装类型、超大文件、超过数量、跨申请材料ID、未授权省级下载均拒绝；文件不公开直链，下载完整性验证通过才返回内容。材料被更正后保留审核历史。

## 实施分工及依赖

规格与合同先行，各任务追溯 docs/provincial-saas-development-backlog.md T01-T30。
- 后端开通任务：新模型/schema迁移及 saas 模块，T02、T07、T11-T16、T18-T20、T22-T27；模块自身显式鉴权，根代理隔离由主代理整合。
- 前端任务：公开申请/跟踪/激活，省级申请/城市页面，市级工作空间/成员/扩展页面，登录与导航；按上述API契约独立实现。
- 山东数据任务：先备份，编写可重复且保留记录关联的区域转换、地理资产、驾驶舱默认城市与区域来源调整，提供数据来源记录。
- 主代理：全局认证/查询/写入隔离、原系统授权加固、测试与最终集成；所有修改均在原工作区进行，不回滚原有改动。

## 评审与验证

Gate1/2：2026-10-28，合同字段、状态、权限、异常与验收明确；沿用既有批准任务范围，允许上述互不覆盖的独立任务并行执行。材料采用实际私有文件上传及摘要验证，授权函编号和内容摘要作为材料说明保留。
Gate3/4：实现后逐项记录结果于实施验收文档，未通过项必须修正或明确列出，不以编译成功替代隔离/流程测试。
