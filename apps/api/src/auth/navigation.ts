import { AuthUser } from './auth.types';
import { isCityAdmin } from './workspace-access';

type NavigationItem = { code: string; name: string; path: string; icon: string; permissionCode: string; module?: string; utility?: boolean; administrator?: boolean; children?: NavigationItem[] };
const leaf = (code: string, name: string, path: string, icon: string, permissionCode = '', module?: string): NavigationItem => ({ code, name, path, icon, permissionCode, module });
const group = (code: string, name: string, children: NavigationItem[], utility = false): NavigationItem => ({ code, name, path: `/navigation/${code}`, icon: ({ cities:'Building2', monitoring:'MapPinned', coordination:'BriefcaseMedical', decision:'ChartNoAxesCombined', platform:'Settings', subjects:'Archive', admission:'ClipboardCheck', operations:'RadioTower', safety:'ShieldAlert', analytics:'ChartNoAxesCombined', settings:'Settings', basics:'Archive', enterpriseAdmission:'ClipboardCheck', enterpriseSafety:'ShieldAlert', enterpriseSettings:'Settings' } as Record<string,string>)[code] ?? 'Files', permissionCode:'', children, utility });

export function navigationFor(user: AuthUser) {
  const province = user.accountLevel === 'PROVINCE';
  if (user.accountLevel === 'OPERATIONS') return [];
  if (province && user.portal === 'ENTERPRISE') return [];
  const cityAdmin = isCityAdmin(user);
  let items: NavigationItem[];
  if (province) {
    items = [
      leaf('province-overview','全省工作台','/province/overview','Gauge','dashboard:view'),
      leaf('province-cockpit','驾驶舱','/province/cockpit','Monitor','dashboard:view'),
      group('cities','地市管理',[
        leaf('province-workspaces','城市管理','/province/workspaces','Building2','dashboard:view'),
      ]),
      group('monitoring','全省监测',[
        leaf('province-monitoring','运行监测','/province/monitoring','MapPinned',user.permissions.includes('operation:realtime:read') ? 'operation:realtime:read' : 'safety:alert:read'),
        leaf('province-vehicles','车辆监管档案','/province/vehicles','Truck','archive:vehicle:read'),
        leaf('province-accidents','事故回溯','/province/accidents','History','safety:accident:read'),
      ]),
      leaf('province-coordination','协同督办','/province/coordination','ClipboardList','dashboard:view'),
      group('decision','统计分析',[
        leaf('province-analysis','省域运行分析','/province/analysis','ChartSpline','analytics:operation:read'),
        leaf('province-reports','监管报告','/province/reports','FileChartColumn','analytics:report:read'),
      ]),
      group('platform','平台管理',[
        leaf('province-members','组织与人员','/system/users','Users','system:user:read'),
        leaf('province-roles','角色权限','/system/roles','KeyRound','system:role:read'),
        leaf('province-rules','标准与规则','/system/business-rules','Workflow','admission:workflow:read'),
        leaf('province-directory','数据接入与共享','/province/directory','Network','dashboard:view'),
        leaf('province-audit','安全审计','/system/audit-logs','ScrollText','system:audit:read'),
      ],true),
    ];
  } else if (user.portal === 'ENTERPRISE') {
    items = [
      leaf('enterprise-overview','运营工作台','/enterprise/overview','Gauge','dashboard:view'),
      group('basics','基础资料',[
        leaf('enterprise-profile','企业资料','/enterprise/profile/info','Building2','archive:enterprise-archive:read','ARCHIVES'),
        leaf('enterprise-vehicles','车辆管理','/enterprise/vehicles','Truck','archive:vehicle:read','ARCHIVES'),
        leaf('enterprise-operators','安全员管理','/enterprise/profile/access','UserRound','archive:qualification:read','GOVERNANCE'),
      ]),
      group('enterpriseAdmission','申请与许可',[
        leaf('enterprise-applications','业务申请','/enterprise/applications','FileText','admission:application:read','ADMISSION'),
        leaf('enterprise-licenses','通行许可','/enterprise/licenses','BadgeCheck','admission:license:read','ADMISSION'),
      ]),
      leaf('enterprise-monitoring','运行监测','/enterprise/operations/realtime','MapPinned','operation:realtime:read','OPERATIONS'),
      group('enterpriseSafety','安全管理',[
        leaf('enterprise-events','事件处置','/enterprise/safety/events','Siren','safety:alert:read','SAFETY'),
        leaf('enterprise-actions','应急整改','/enterprise/safety/emergency','BriefcaseMedical','safety:emergency:read','SAFETY'),
      ]),
      leaf('enterprise-evaluations','企业评价','/enterprise/evaluations','ChartNoAxesCombined','analytics:evaluation:read','ANALYTICS'),
      group('enterpriseSettings','企业设置',[
        leaf('enterprise-members','成员管理','/enterprise/accounts','Users','system:user:read'),
        leaf('enterprise-interfaces','接入配置','/enterprise/settings/interfaces','Network','operation:telemetry:write','GOVERNANCE'),
      ],true),
    ];
  } else {
    items = [
      leaf('city-overview','监管工作台','/regulatory/overview','Gauge','dashboard:view'),
      leaf('city-cockpit','驾驶舱','/regulatory/cockpit','Monitor','dashboard:view'),
      group('subjects','主体管理',[
        leaf('city-enterprises','企业管理','/archives/enterprises','Building2','archive:enterprise-archive:read','ARCHIVES'),
        leaf('city-vehicles','车辆管理','/archives/vehicles','Truck','archive:vehicle:read','ARCHIVES'),
        leaf('city-operators','安全员管理','/archives/operators','UserRound','archive:qualification:read','GOVERNANCE'),
      ]),
      group('admission','准入与许可',[
        leaf('city-applications','业务办理','/admission/applications','ClipboardCheck','admission:application:read','ADMISSION'),
        leaf('city-licenses','通行许可','/admission/licenses','BadgeCheck','admission:license:read','ADMISSION'),
        leaf('city-regions','通行区域','/operations/regions','Spline','operation:region:read','OPERATIONS'),
      ]),
      group('operations','运行监管',[
        leaf('city-monitoring','运行监测','/operations/realtime','MapPinned','operation:realtime:read','OPERATIONS'),
        leaf('city-fences','电子围栏','/safety/fences','Pentagon','safety:fence:read','SAFETY'),
      ]),
      group('safety','安全监管',[
        leaf('city-events','事件处置','/safety/events','Siren','safety:alert:read','SAFETY'),
        leaf('city-actions','应急整改','/safety/emergency','BriefcaseMedical','safety:emergency:read','SAFETY'),
        leaf('city-inspections','监督检查','/safety/inspections','ClipboardCheck','safety:violation:read','GOVERNANCE'),
      ]),
      group('analytics','分析评价',[
        leaf('city-operations-analysis','运行分析','/analytics/operations','ChartSpline','analytics:operation:read','ANALYTICS'),
        leaf('city-safety-analysis','安全分析','/analytics/safety','ShieldCheck','analytics:safety:read','ANALYTICS'),
        leaf('city-evaluations','企业评价','/analytics/evaluations','ClipboardList','analytics:evaluation:read','ANALYTICS'),
        leaf('city-credit','信用管理','/analytics/credit','BadgeCheck','analytics:evaluation:read','GOVERNANCE'),
        leaf('city-reports','统计报表','/analytics/reports','FileChartColumn','analytics:report:read','ANALYTICS'),
      ]),
      group('settings','管理设置',[
        leaf('city-organizations','组织机构','/system/organizations','Network','system:organization:read'),
        { ...leaf('city-members','成员管理','/city/members','Users','system:user:read'), administrator:true },
        leaf('city-roles','角色权限','/system/roles','KeyRound','system:role:read'),
        leaf('city-rules','业务规则','/system/business-rules','Workflow','admission:workflow:read','GOVERNANCE'),
        { ...leaf('city-grant','平台授权','/city/workspace','Building2'), administrator:true },
        leaf('city-audit','安全审计','/system/audit-logs','ScrollText','system:audit:read'),
      ],true),
    ];
  }
  const visible = (rows: NavigationItem[]): any[] => rows.flatMap((row,index) => {
    if ((row.permissionCode && !user.permissions.includes(row.permissionCode)) || (row.administrator && !cityAdmin)
      || (!province && row.module && !user.workspace?.modules.includes(row.module))) return [];
    const children = row.children ? visible(row.children) : undefined;
    if (row.children && !children?.length) return [];
    const { module: _module, administrator: _administrator, ...menu } = row;
    return [{ ...menu,id:row.code,portal:user.portal,orderNo:(index+1)*10,children:children??[] }];
  });
  return visible(items);
}
