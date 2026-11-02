<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type Component } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { MenuInstance } from 'element-plus';
import {
  Activity, Archive, BadgeAlert, BadgeCheck, Bot, Boxes, BriefcaseMedical, Building, Building2,
  CalendarClock, ChartNoAxesCombined, ChartSpline, ChevronDown, Circle, ClipboardCheck, ClipboardList,
  ClipboardPenLine, Factory, FileChartColumn, FileText, Files, Gauge, History, KeyRound,
  ListChecks, ListFilter, ListTree, LogOut, Map, MapPinned, MessageSquareWarning, Monitor, Network,
  PanelLeftClose, PanelLeftOpen, Pentagon, RadioTower, Route, ScanLine, ScanSearch, ScrollText,
  Settings, ShieldAlert, ShieldCheck, ShieldX, Siren, Spline, Truck, UserRound, Users, WifiOff,
  Workflow,
} from 'lucide-vue-next';
import { useSessionStore } from '../stores/session';
import { isAmapConfigured, loadAMap } from '../amap';
import type { MenuItem } from '../types';

function preloadAMapNow() {
  if (isAmapConfigured()) loadAMap().catch(() => {});
}

const session = useSessionStore(); const route = useRoute(); const router = useRouter();
const collapsed = ref(false); const narrow = ref(false);
const province = computed(() => session.user?.accountLevel === 'PROVINCE');
const enterprise = computed(() => session.user?.portal === 'ENTERPRISE');
const topNavigation = computed(() => province.value || enterprise.value || session.user?.accountLevel === 'CITY');
const topMenus = computed<MenuItem[]>(() => {
  const menus = session.menus.map(menu => {
    let target = menu;
    while (target.children?.length === 1) target = target.children[0];
    return target === menu ? menu : { ...menu, path: target.path, children: target.children };
  });
  if (session.user?.accountLevel === 'OPERATIONS' || !session.user?.permissions.includes('dashboard:view') || menus.some(menu => menu.path === '/agents')) return menus;
  const settingsIndex = menus.findIndex(menu => menu.utility);
  menus.splice(settingsIndex < 0 ? menus.length : settingsIndex, 0, { id: 'agent-center', code: 'agent-center', name: 'AI智能体', path: '/agents', icon: 'Bot', children: [] });
  return menus;
});
const homePath = computed(() => province.value ? '/province/overview' : enterprise.value ? '/enterprise/overview' : '/regulatory/overview');
const activePath = computed(() => province.value && route.path === '/system/organizations' ? '/system/users' : route.path === '/oversight/city-tasks' ? homePath.value : route.path);
const primaryNavigation = ref<HTMLElement | null>(null);
const topMenu = ref<MenuInstance>();
const iconMap: Record<string, Component> = {
  Activity, Archive, BadgeAlert, BadgeCheck, Bot, Boxes, BriefcaseMedical, Building, Building2,
  CalendarClock, ChartNoAxesCombined, ChartSpline, ClipboardCheck, ClipboardList,
  ClipboardPenLine, Factory, FileChartColumn, FileText, Files, Gauge, History, KeyRound,
  ListChecks, ListFilter, ListTree, Map, MapPinned, MessageSquareWarning, Monitor, Network, Pentagon,
  RadioTower, Route, ScanSearch, ScrollText, Settings, ShieldAlert, ShieldCheck, ShieldX,
  Siren, Spline, Truck, UserRound, Users, WifiOff, Workflow,
};
const icon = (name?: string) => iconMap[name ?? ''] ?? Circle;
const portalName = computed(() => session.user?.accountLevel === 'PROVINCE' ? '山东省级平台' : session.user?.workspace?.cityName ? `${session.user.workspace.cityName}${session.user?.portal === 'ENTERPRISE' ? '企业门户' : '工作空间'}` : session.user?.portal === 'ENTERPRISE' ? '企业门户' : session.user?.accountLevel === 'OPERATIONS' ? '平台运维' : '监管门户');
const showCockpit = computed(() => session.user?.portal === 'REGULATORY' && route.path === '/regulatory/overview');
const scopeText = computed(() => session.user?.accountLevel === 'PROVINCE' ? '全省授权监管范围' : session.user?.portal === 'ENTERPRISE' ? '仅本企业数据' : session.user?.accountLevel === 'OPERATIONS' ? '运行维护范围' : '本市授权辖区');
const crumbs = computed(() => {
  const items: Array<{ name: string; path?: string }> = [{ name: portalName.value }];
  const walk = (menus: MenuItem[], parents: MenuItem[] = []): boolean => {
    for (const menu of menus) {
      const chain = [...parents, menu];
      if (menu.path === route.path) { chain.forEach((item) => items.push({ name: item.name, path: item.path })); return true; }
      if (menu.children?.length && walk(menu.children, chain)) return true;
    }
    return false;
  };
  walk(session.menus);
  return items;
});
const resize = () => { narrow.value = window.innerWidth < 920; collapsed.value = narrow.value; };
const closeNarrowNavigation = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return;
  if (topNavigation.value) { closeTopMenus(true); return; }
  if (narrow.value && !collapsed.value) collapsed.value = true;
};
onMounted(() => { resize(); window.addEventListener('resize', resize); window.addEventListener('keydown', closeNarrowNavigation); });
onUnmounted(() => { window.removeEventListener('resize', resize); window.removeEventListener('keydown', closeNarrowNavigation); });
async function logout() { await session.logout(); await router.replace('/login'); }
function open(menu: MenuItem) { if (menu.children?.length) router.push(menu.children[0].path); else router.push(menu.path); }
function closeTopMenus(restoreFocus = false) {
  const trigger = primaryNavigation.value?.querySelector<HTMLElement>('.el-sub-menu.is-opened');
  topMenus.value.forEach(menu => { if (menu.children?.length > 1) topMenu.value?.close(menu.path); });
  if (restoreFocus) trigger?.focus();
}
function openSection(path: string) {
  closeTopMenus();
  router.push(path === '/agents' ? { path, query: { returnTo: route.fullPath } } : path);
}
function navigateTopMenu(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const items = Array.from(primaryNavigation.value?.querySelectorAll<HTMLElement>('.el-menu--horizontal > li') ?? []);
  const current = event.target instanceof Element ? event.target.closest<HTMLElement>('li') : null;
  const index = current ? items.indexOf(current) : -1;
  if (index < 0) return;
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
  event.preventDefault();
  items[next].focus();
  items[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
watch(() => route.path, async () => {
  if (!topNavigation.value) return;
  closeTopMenus();
  await nextTick();
  primaryNavigation.value?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}, { immediate: true });
</script>
<template>
  <div class="app-shell" :class="{ 'portal-shell': topNavigation }">
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <header v-if="topNavigation" class="portal-header">
      <div class="portal-header-main">
        <router-link :to="homePath" class="portal-brand" :aria-label="`中国数联 · ${portalName}首页`"><img src="/branding/china-unidata.png" alt="中国数联 China Unidata" width="475" height="116" /></router-link>
        <nav ref="primaryNavigation" class="portal-primary" aria-label="主导航" @keydown="navigateTopMenu">
          <el-menu ref="topMenu" mode="horizontal" menu-trigger="click" unique-opened close-on-click-outside :ellipsis="false" :default-active="activePath" @select="openSection">
            <template v-for="menu in topMenus" :key="menu.id">
              <el-sub-menu v-if="menu.children?.length > 1" :index="menu.path" popper-class="portal-navigation-dropdown">
                <template #title><span>{{menu.name}}</span></template>
                <el-menu-item v-for="child in menu.children" :key="child.id" :index="child.path"><component :is="icon(child.icon)" :size="16" /><span>{{child.name}}</span></el-menu-item>
              </el-sub-menu>
              <el-menu-item v-else :index="menu.path"><span>{{menu.name}}</span></el-menu-item>
            </template>
          </el-menu>
        </nav>
        <el-dropdown trigger="click" placement="bottom-end" @command="logout">
          <button type="button" class="portal-account"><span class="portal-avatar"><UserRound :size="17" /></span><span class="portal-account-name">{{session.user?.displayName}}</span><ChevronDown :size="13" /></button>
          <template #dropdown><el-dropdown-menu><el-dropdown-item disabled>{{session.user?.username}} · {{session.user?.roles.map(role=>role.name).join('、')}}</el-dropdown-item><el-dropdown-item command="logout" divided :icon="LogOut">退出登录</el-dropdown-item></el-dropdown-menu></template>
        </el-dropdown>
      </div>
    </header>
    <aside v-else class="sidebar" :class="{ collapsed }">
      <div class="brand"><div class="brand-mark"><Truck :size="18" /></div><div v-if="!collapsed"><strong>山东无人车监管</strong><span>{{session.user?.workspace?.cityName || '省级统一平台'}}</span></div></div>
      <nav aria-label="主导航">
        <el-menu :default-active="route.path" :collapse="collapsed" :collapse-transition="false" @select="(path:string) => router.push(path)">
          <template v-for="(menu, menuIndex) in session.menus" :key="menu.id">
            <el-sub-menu v-if="menu.children?.length" :index="menu.path" :class="{'utility-start':menu.utility&&!session.menus[menuIndex-1]?.utility}">
              <template #title><component :is="icon(menu.icon)" :size="17" /><span>{{ menu.name }}</span></template>
              <el-menu-item v-for="child in menu.children" :key="child.id" :index="child.path"><component :is="icon(child.icon)" :size="16" /><span>{{ child.name }}</span></el-menu-item>
            </el-sub-menu>
            <el-menu-item v-else :index="menu.path" :class="{'utility-start':menu.utility&&!session.menus[menuIndex-1]?.utility}" @click="open(menu)"><component :is="icon(menu.icon)" :size="17" /><span>{{ menu.name }}</span></el-menu-item>
          </template>
        </el-menu>
      </nav>
      <div class="sidebar-footer"><div v-if="!collapsed" class="identity"><strong>{{ session.user?.displayName }}</strong><span>{{ session.user?.roles.map(r => r.name).join('、') }}</span></div><el-button text circle aria-label="退出登录" @click="logout"><LogOut :size="17" /></el-button></div>
    </aside>
    <main id="main-content" tabindex="-1">
      <div v-if="!topNavigation" class="scope-ribbon">
        <el-button text circle aria-label="切换侧边栏" @click="collapsed = !collapsed"><PanelLeftClose v-if="!collapsed" :size="17" /><PanelLeftOpen v-else :size="17" /></el-button>
        <div class="scope-title"><ScanLine :size="15" /><span>监管视域</span><strong>{{ portalName }}</strong><i></i><span>{{ scopeText }}</span></div>
        <div class="scope-actions">
          <button v-if="showCockpit" type="button" class="cockpit-entry" @mouseenter="preloadAMapNow" @click="router.push('/regulatory/cockpit')"><Gauge :size="14" />监管驾驶舱</button>
          <div class="top-user"><UserRound :size="15" /><span>{{ session.user?.username }}</span></div>
        </div>
      </div>
      <nav v-if="route.path !== '/regulatory/overview' && route.path !== '/province/workspaces' && route.path !== '/enterprise/profile/access' && !(session.user?.accountLevel==='CITY' && ['/archives/enterprises','/archives/vehicles','/archives/operators'].includes(route.path) && route.query.view!=='profile')" class="app-breadcrumb" aria-label="面包屑">
        <ol>
          <li v-for="(crumb, index) in crumbs" :key="`${crumb.name}-${index}`">
            <router-link v-if="crumb.path && crumb.path !== route.path && crumb.path.split('/').filter(Boolean).length > 1" :to="crumb.path">{{ crumb.name }}</router-link>
            <span v-else :aria-current="index === crumbs.length - 1 ? 'page' : undefined">{{ crumb.name }}</span>
          </li>
        </ol>
        <button v-if="showCockpit && topNavigation" type="button" class="cockpit-entry portal-cockpit" @mouseenter="preloadAMapNow" @click="router.push('/regulatory/cockpit')"><Gauge :size="14" />监管驾驶舱</button>
      </nav>
      <section class="page-canvas"><router-view v-slot="{ Component }"><keep-alive include="ProvinceCockpitView" :key="session.user?.id"><component :is="Component" /></keep-alive></router-view></section>
    </main>
  </div>
</template>

<style scoped>
.sidebar nav>.el-menu{display:flex;flex-direction:column;min-height:100%}.utility-start{margin-top:auto!important;padding-top:16px;border-top:1px solid #e4e7ed}
.app-shell.portal-shell{display:flex;flex-direction:column;min-width:0}
.portal-shell>main{display:flex;flex-direction:column;width:100%;flex:1;min-height:0}
.portal-header{--portal-nav-height:84px;position:sticky;top:0;z-index:30;background:#fff;border-bottom:1px solid #e8edf5;font-family:'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif;-webkit-font-smoothing:antialiased}
.portal-header-main{display:grid;grid-template-columns:220px minmax(0,1fr) 220px;align-items:center;gap:24px;padding:0 32px;min-height:var(--portal-nav-height)}
.portal-brand{display:flex;align-items:center;width:220px;height:68px;overflow:hidden;text-decoration:none;flex:none}
.portal-brand img{display:block;width:auto;height:68px;max-width:none;flex:none;transform:translateX(-29px)}
.portal-brand:focus-visible{outline:2px solid #347cfa;outline-offset:2px;border-radius:5px}
.portal-header-main>.el-dropdown{justify-self:end}
.portal-primary{min-width:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}
.portal-primary::-webkit-scrollbar{display:none}
.portal-primary :deep(.el-menu--horizontal){height:var(--portal-nav-height);width:max-content;min-width:0;margin-inline:auto;border:0;background:transparent;--el-menu-horizontal-height:var(--portal-nav-height);--el-menu-active-color:#2466cc;--el-menu-hover-bg-color:transparent;font-family:inherit}
.portal-primary :deep(.el-menu--horizontal > .el-menu-item),.portal-primary :deep(.el-menu--horizontal > .el-sub-menu > .el-sub-menu__title){position:relative;height:var(--portal-nav-height);padding:0 19px;font-family:inherit;font-size:16px;font-weight:500;letter-spacing:.015em;color:#424e62;border:0;background:transparent;isolation:isolate}
.portal-primary :deep(.el-menu--horizontal > .el-sub-menu > .el-sub-menu__title){padding-right:35px}
.portal-primary :deep(.el-menu--horizontal > .el-menu-item)::before,.portal-primary :deep(.el-menu--horizontal > .el-sub-menu > .el-sub-menu__title)::before{content:'';position:absolute;inset-inline:6px;top:calc(50% - 20px);height:40px;border-radius:8px;background:transparent;z-index:-1}
.portal-primary :deep(.el-menu--horizontal > .el-menu-item:hover)::before,.portal-primary :deep(.el-menu--horizontal > .el-sub-menu > .el-sub-menu__title:hover)::before{background:#f5f8fd}
.portal-primary :deep(.el-menu--horizontal > .el-menu-item.is-active),.portal-primary :deep(.el-menu--horizontal > .el-sub-menu.is-active > .el-sub-menu__title){font-weight:600;color:#1e62c6;background:transparent;border:0}
.portal-primary :deep(.el-menu--horizontal > .el-menu-item.is-active)::before,.portal-primary :deep(.el-menu--horizontal > .el-sub-menu.is-active > .el-sub-menu__title)::before{background:#edf4ff}
.portal-primary :deep(.el-menu--horizontal > .el-menu-item.is-active)::after,.portal-primary :deep(.el-menu--horizontal > .el-sub-menu.is-active > .el-sub-menu__title)::after{content:'';position:absolute;bottom:0;left:50%;width:38px;height:3px;transform:translateX(-50%);border-radius:3px 3px 0 0;background:#347cfa}
.portal-primary :deep(.el-menu--horizontal > .el-menu-item:focus-visible),.portal-primary :deep(.el-menu--horizontal > .el-sub-menu:focus-visible){outline:2px solid #347cfa;outline-offset:-4px;border-radius:8px}
.portal-primary :deep(.el-sub-menu__icon-arrow){font-size:12px;right:15px;color:inherit}
.portal-primary :deep(.el-menu-item svg),.portal-primary :deep(.el-sub-menu__title svg){flex:none}
.portal-account{display:flex;align-items:center;gap:10px;padding:6px 0 6px 8px;background:transparent;border:0;color:#34445e;cursor:pointer;font-family:inherit;font-size:13px;font-weight:500;border-radius:6px}
.portal-account:hover{background:var(--canvas-hover)}
.portal-account-name{max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.portal-avatar{width:36px;height:36px;display:grid;place-items:center;background:#eaf3ff;color:#2e67ae;border-radius:50%;flex:none}
.portal-shell :deep(.app-breadcrumb){padding-inline:24px}
.portal-shell :deep(.page-canvas){flex:1;min-height:0}
.portal-cockpit{margin-left:auto;min-height:26px;font-size:11px}
.app-shell:has(.cockpit)>.portal-header{display:none}
@media(max-width:1500px){.portal-header-main{grid-template-columns:200px minmax(0,1fr) 200px;gap:16px;padding-inline:24px}.portal-brand{width:200px;height:62px}.portal-brand img{height:62px;transform:translateX(-27px)}.portal-primary :deep(.el-menu--horizontal > .el-menu-item),.portal-primary :deep(.el-menu--horizontal > .el-sub-menu > .el-sub-menu__title){font-size:14px;padding-left:15px}.portal-primary :deep(.el-menu--horizontal > .el-menu-item){padding-right:15px}.portal-account-name{max-width:132px}}
@media(max-width:1280px){.portal-header{--portal-nav-height:50px}.portal-header-main{grid-template-columns:minmax(0,1fr) auto;gap:0 12px;padding-top:5px}.portal-brand{height:56px;width:180px}.portal-brand img{height:56px;transform:translateX(-24px)}.portal-header-main>.el-dropdown{margin:3px 0}.portal-primary{grid-row:2;grid-column:1/-1}.portal-primary :deep(.el-menu--horizontal > .el-menu-item),.portal-primary :deep(.el-menu--horizontal > .el-sub-menu > .el-sub-menu__title){font-size:14px}.portal-primary :deep(.el-menu--horizontal > .el-menu-item)::before,.portal-primary :deep(.el-menu--horizontal > .el-sub-menu > .el-sub-menu__title)::before{top:calc(50% - 18px);height:36px}}
@media(max-width:760px){.portal-header-main{padding-inline:14px}.portal-account-name{display:none}.portal-account{gap:7px}.portal-avatar{width:32px;height:32px}.portal-primary{margin-inline:-14px;padding-inline:8px}.portal-primary :deep(.el-menu--horizontal){margin-inline:auto}.portal-shell :deep(.app-breadcrumb){padding-inline:14px}}
</style>
