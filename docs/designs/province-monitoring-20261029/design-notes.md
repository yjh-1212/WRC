# 全省监测：三个页面设计图

日期：2026-10-29。

范围：功能与视觉设计评审，不修改业务代码，不接入真实业务数据。所有画面、编号、企业、轨迹、视频及处置内容均为示例，不作为实际监管或事故证据。

生成方式：内置 image_gen 图像生成工具。

- 01-monitoring.png：运行监测。查询条件在上，车辆与风险关联列表、地图在下；按车归并告警，保留定位、档案与实时跟踪入口。
- 02-vehicle-dossier.png：车辆监管档案。列表检索加单车详情抽屉；同一车辆下组织身份、许可、运行轨迹、运行记录、事故与视频、告警违规。
- 03-accident-review.png：事故回溯。事故列表加证据详情；视频、轨迹使用共同的事发时间轴，显示录像覆盖范围及缺失状态，并关联属地处置和督办。

交互约定：图片表达拟议行为，不代表功能已经实现。各业务菜单为独立目的地；档案内分段为同一车辆的视图。列表与地图共用筛选；地图联动定位到当前车辆；从车辆档案和事故检索进入同一事故详情。没有视频不能显示成有视频，未接入、未上传、无覆盖和读取失败应分别展示。

界面约定：浅色省级监管工作台，白色表面、浅灰画布、蓝色主操作，紧凑表格；不增加重复的页面标题统计条。驾驶舱保留原有深蓝风格。

下步实施前仍需核实：录像来源、摄像头通道、起止时间及保存期限、播放/下载授权、轨迹与视频时钟一致性。目前图片中的视频为设计示意。

## 完整生成提示词

### 运行监测

```text
Use case: ui-mockup.
Create ONE polished high fidelity desktop web application design image for the Shandong autonomous delivery vehicle provincial regulatory platform. This is a Chinese enterprise administration UI design, not a poster, marketing site, screenshot inside a laptop, wireframe or infographic. Large landscape 16:10 desktop artboard around 1920 by 1200, edge to edge UI, crisp legible Simplified Chinese text with carefully aligned columns and generous but efficient enterprise density. All numbers and data are fictional examples, quietly label bottom right "页面设计稿 · 演示数据".
Visual system shared across the three screens: very light cool gray page background #f4f6f9; white main surfaces; dark slate text #172b46; secondary slate #7b8ba0; restrained medium blue #2f6fed for active controls, links and map vehicles; thin #e5eaf1 borders; 8px corners; no heavy shadows, no glassmorphism, no decorative gradients, no oversized headings or KPI statistic cards. Good Chinese sans serif like Microsoft YaHei UI; tabular numerals; restrained line icons, high readability. White header 72px tall: left small simple blue truck mark and "山东无人车监管" with smaller subtitle "省级监管平台"; top navigation text "全省工作台" "驾驶舱" "地市管理" "全省监测" "协同督办" "分析评价" "AI智能体", active "全省监测" in blue with a fine underline; right a small avatar and "省级监管员".
Below header a compact breadcrumb row, then a slim secondary navigation with exactly three sibling links "运行监测" "车辆监管档案" "事故回溯", appropriate current link blue. These are separate destination pages, not six mixed business tabs. Outer content margins 28px.
Search/list pages MUST show a compact query condition white panel on top and data/list workspace underneath with a 20px gap. No redundant page title/count banners, no top-level stats strip, no generic 综合查询 menu, no extra sidebar. Use real intentional domain-specific compositions with clear hierarchy. All copy in Simplified Chinese, no lorem ipsum.
Page 1: "运行监测", merging live vehicle monitoring and risk monitoring into one coherent page. Breadcrumb "省级平台 / 全省监测 / 运行监测". Secondary nav active 运行监测.
Top query panel, two neat rows maximum: labeled fields "地市" default "全部地市", "运营企业" default "全部企业", "车辆编号" placeholder "编号 / 统一编码 / VIN", "运行状态" default "全部状态", "风险等级" default "全部等级"; right blue "查询" button and outlined "重置".
Below this, one main white workspace with a thin toolbar: compact filter chips "全部车辆" "运行中" "离线异常" "存在未闭环告警"; on right small segmented display controls "列表" and "地图". Main content about 60% wide on LEFT and 40% on RIGHT. Left is a refined dense vehicle data table about 6 rows, white/pale-blue header, columns "车辆 / 企业", "所属地市", "运行状态", "风险情况", "最后上报", "操作". Vehicle IDs VEH-2026-004, VEH-2026-018, VEH-2026-027, VEH-2026-033, VEH-2026-052. Use fictional enterprise names "济南泉城配送运营公司" "青岛海湾物流公司" "临沂城配运营公司". Status green tiny-dot "在线运行", slate "离线", amber "临停". Risk badges softly red "高风险 · 2条", pale amber "一般风险 · 1条", neutral "无未闭环告警", counting vehicles and alerts separately. Selected row VEH-2026-004 lightly blue with a fine left blue edge. Actions blue text "定位" "档案". One selected row expands to show a meaningful compact alert line with amber warning icon "持续低电量告警", "待属地核查", "09:38", link "查看告警".
RIGHT: a clean pale-blue geographic Shandong-only map, recognizable full Shandong peninsula outline, separate city boundaries, no national map, light roads, labeled 济南 青岛 临沂 潍坊 烟台. Blue small delivery vehicle markers, one orange risk marker. At selected 济南 vehicle a small white anchored info popup "VEH-2026-004" "在线运行 · 12 km/h" "济南泉城配送运营公司" with blue text links "实时跟踪" and "车辆档案". Tiny map zoom controls at bottom right and tasteful legend "在线运行  离线  存在告警". Map is light enterprise GIS, not the dark cockpit or 3D earth.
At bottom of the workspace a pale gray fine-line footer with pagination and source timestamp "最后上报 2026-10-29 09:42". Enough visual breathing room; make this feel like a practical vehicle supervision console. Show six vehicle rows, not fabricated massive KPI numbers.
```

### 车辆监管档案

```text
Use case: ui-mockup.
Create ONE polished high fidelity desktop web application design image for the Shandong autonomous delivery vehicle provincial regulatory platform. This is a Chinese enterprise administration UI design, not a poster, marketing site, screenshot inside a laptop, wireframe or infographic. Large landscape 16:10 desktop artboard around 1920 by 1200, edge to edge UI, crisp legible Simplified Chinese text with carefully aligned columns and generous but efficient enterprise density. All numbers and data are fictional examples, quietly label bottom right "页面设计稿 · 演示数据".
Visual system shared across the three screens: very light cool gray page background #f4f6f9; white main surfaces; dark slate text #172b46; secondary slate #7b8ba0; restrained medium blue #2f6fed for active controls, links and map vehicles; thin #e5eaf1 borders; 8px corners; no heavy shadows, no glassmorphism, no decorative gradients, no oversized headings or KPI statistic cards. Good Chinese sans serif like Microsoft YaHei UI; tabular numerals; restrained line icons, high readability. White header 72px tall: left small simple blue truck mark and "山东无人车监管" with smaller subtitle "省级监管平台"; top navigation text "全省工作台" "驾驶舱" "地市管理" "全省监测" "协同督办" "分析评价" "AI智能体", active "全省监测" in blue with a fine underline; right a small avatar and "省级监管员".
Below header a compact breadcrumb row, then a slim secondary navigation with exactly three sibling links "运行监测" "车辆监管档案" "事故回溯", appropriate current link blue. These are separate destination pages, not six mixed business tabs. Outer content margins 28px.
Search/list pages MUST show a compact query condition white panel on top and data/list workspace underneath with a 20px gap. No redundant page title/count banners, no top-level stats strip, no generic 综合查询 menu, no extra sidebar. Use real intentional domain-specific compositions with clear hierarchy. All copy in Simplified Chinese, no lorem ipsum.
Page 2: "车辆监管档案", a one-vehicle dossier lookup with a selected vehicle detail drawer. Breadcrumb "省级平台 / 全省监测 / 车辆监管档案". Active secondary nav 车辆监管档案.
Top full width search panel with fields "所属地市" "运营企业" "车辆编号 / VIN" "车辆用途" "许可状态", blue "查询", outline "重置". A small advanced filters link may appear but avoid busy toolbar.
Below the search, a white full-width vehicle archive data table with headers "车辆档案", "所属地市", "运营企业", "车型 / 用途", "许可状态", "操作". Five readable rows with leading small blue truck silhouette thumbnails and bold vehicle codes. Selected first row VEH-2026-004, subtext "统一编码 370100-FV-2026-00004", city "济南市", enterprise "济南泉城配送运营公司", model "L4无人配送车", green outlined "许可有效", action "查看档案". Other rows belong to 青岛市、临沂市. Use pagination on lower left.
An OPEN large in-context vehicle detail drawer occupies the right 48% of the page below header, subtly elevating with fine shadow and white background; keep the left half of the search/list clearly readable without a dark modal blackout. Drawer header blue small truck emblem, bold "VEH-2026-004", tiny neutral "一车一档", close X; line "济南泉城配送运营公司 · 济南市", green online pill and muted "最后上报 09:42".
Within this SINGLE VEHICLE context, a horizontal compact dossier section selector with six sections, readable and neatly wrapped if needed: "档案总览" active, "运行轨迹", "运行记录", "事故与视频", "告警违规", "通行许可". These are in-entity views.
Drawer content has grouped factual descriptions rather than large numbers: "车辆身份" with "统一编码" "VIN" "设备编号" "厂商车型" "车辆用途"; "监管与许可" with "所属地市 济南市", "监管辖区 历下区", "当前许可 有效", "有效期至 2027-06-30". A tasteful tiny vehicle line illustration may be at identity corner.
Then a divider and "最近运行" section: an elegant small street map with a short blue route and a vehicle marker; beside it short fields "今日最近行程 09:10 — 09:42", "行驶里程 8.6 km", blue text link "查看完整轨迹".
Then "事故与视频" section as two compact clickable rows: "10月28日 低速剐蹭事故" with amber "属地处理中" and small camera icon "视频待接入"; another "09月16日 障碍物碰撞" neutral "已归档". Right links "查看事故". Bottom quiet note "视频缺失状态与车辆档案关联展示". No claim that unavailable videos exist. Bottom drawer sticky actions outlined "进入实时跟踪", main blue "查看运行轨迹".
Make the dossier useful, orderly and readable, clearly connect lookup, vehicle identity, history, permits, incident evidence.
```

### 事故回溯

```text
Use case: ui-mockup.
Create ONE polished high fidelity desktop web application design image for the Shandong autonomous delivery vehicle provincial regulatory platform. This is a Chinese enterprise administration UI design, not a poster, marketing site, screenshot inside a laptop, wireframe or infographic. Large landscape 16:10 desktop artboard around 1920 by 1200, edge to edge UI, crisp legible Simplified Chinese text with carefully aligned columns and generous but efficient enterprise density. All numbers and data are fictional examples, quietly label bottom right "页面设计稿 · 演示数据".
Visual system shared across the three screens: very light cool gray page background #f4f6f9; white main surfaces; dark slate text #172b46; secondary slate #7b8ba0; restrained medium blue #2f6fed for active controls, links and map vehicles; thin #e5eaf1 borders; 8px corners; no heavy shadows, no glassmorphism, no decorative gradients, no oversized headings or KPI statistic cards. Good Chinese sans serif like Microsoft YaHei UI; tabular numerals; restrained line icons, high readability. White header 72px tall: left small simple blue truck mark and "山东无人车监管" with smaller subtitle "省级监管平台"; top navigation text "全省工作台" "驾驶舱" "地市管理" "全省监测" "协同督办" "分析评价" "AI智能体", active "全省监测" in blue with a fine underline; right a small avatar and "省级监管员".
Below header a compact breadcrumb row, then a slim secondary navigation with exactly three sibling links "运行监测" "车辆监管档案" "事故回溯", appropriate current link blue. These are separate destination pages, not six mixed business tabs. Outer content margins 28px.
Search/list pages MUST show a compact query condition white panel on top and data/list workspace underneath with a 20px gap. No redundant page title/count banners, no top-level stats strip, no generic 综合查询 menu, no extra sidebar. Use real intentional domain-specific compositions with clear hierarchy. All copy in Simplified Chinese, no lorem ipsum.
Page 3: "事故回溯", incident investigation and evidence viewing for provincial read-only oversight. Breadcrumb "省级平台 / 全省监测 / 事故回溯", secondary nav active 事故回溯.
Top query panel with labels "事故编号 / 车辆" "所属地市" "发生时间" range "2026-10-01 — 2026-10-29" "处置状态" "视频资料"; blue 查询 and outlined 重置.
Below a single white evidence workspace. LEFT 25% width: dense accident results list with a little heading "事故记录" and pagination, 4 selectable records; selected pale blue row "低速剐蹭事故" "ACC-2026-1028-004" "VEH-2026-004 · 济南市" "10-28 09:36" and amber "调查中". Other records "障碍物碰撞" "车辆失控" etc using low severity and no injury. Clearly show individual accidents, not a red crisis dashboard.
RIGHT 75% width: incident evidence detail. Header "低速剐蹭事故" with amber "调查中", subtle blue "车辆档案" link, line "VEH-2026-004 · 济南市历下区 · 2026-10-28 09:36:20". One small business action outlined blue "关联督办" rather than provincial accident determination.
Core upper area is split 58/42: LEFT video evidence viewing stage and RIGHT a route map. Video pane header "事故视频" with compact camera channel chips "前视" active "后视" "侧视"; professional 16:9 player with tasteful fictional still of a small white autonomous delivery vehicle on a quiet urban street; overlay small label "演示画面". Central subtle play icon and bottom timestamps. Under player two clear evidence statuses: "前视录像 · 示例画面", amber "后视录像 · 未接入" (so unavailable camera is honestly shown). No real victims, no disturbing accident imagery.
RIGHT light street map titled "事故窗口轨迹": a blue route, direction arrows, selected vehicle point and a precisely anchored orange pin "事发位置". Labels "事发前" and "事发后". Small legend "轨迹 · 事发点 · 告警". Under map small telemetry cards INLINE, not hero metrics: "速度 6 km/h", "电量 62%", "自动驾驶".
Below video and map spanning whole right width, one SHARED EVIDENCE TIMELINE: title "事发前后时间线"; selector "前后5分钟" "前后15分钟"; blue recorded coverage segments on timeline and hatched gray missing video coverage; a single orange vertical incident playhead exactly at "09:36:20 事发时刻"; times 09:31, 09:33, 09:36, 09:38, 09:41; compact playback controls "播放" "1×" "同步视频与轨迹". This shared playhead is the signature element, crisp and genuinely useful.
Lower detail: compact evidence event rows with times "09:35:48 障碍物告警", "09:36:20 事故上报", "09:37:05 车辆临停"; adjacent "属地处置进展" with "历下区已受理" and latest reply "正在核查现场资料". Keep evidence findings distinct from jurisdictional conclusions; province watches and supervises. Very readable, polished, dense and calm. All fictional data, bottom label 页面设计稿 · 演示数据.
```

