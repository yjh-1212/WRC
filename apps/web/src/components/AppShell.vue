<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, type Component } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  Activity, Archive, BadgeAlert, BadgeCheck, Boxes, BriefcaseMedical, Building, Building2,
  CalendarClock, ChartNoAxesCombined, ChartSpline, Circle, ClipboardCheck, ClipboardList,
  ClipboardPenLine, Factory, FileChartColumn, FileText, Files, Gauge, History, KeyRound,
  ListChecks, ListFilter, ListTree, LogOut, Map, MapPinned, MessageSquareWarning, Network,
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
const iconMap: Record<string, Component> = {
  Activity, Archive, BadgeAlert, BadgeCheck, Boxes, BriefcaseMedical, Building, Building2,
  CalendarClock, ChartNoAxesCombined, ChartSpline, ClipboardCheck, ClipboardList,
  ClipboardPenLine, Factory, FileChartColumn, FileText, Files, Gauge, History, KeyRound,
  ListChecks, ListFilter, ListTree, Map, MapPinned, MessageSquareWarning, Network, Pentagon,
  RadioTower, Route, ScanSearch, ScrollText, Settings, ShieldAlert, ShieldCheck, ShieldX,
  Siren, Spline, Truck, Users, WifiOff, Workflow,
};
const icon = (name?: string) => iconMap[name ?? ''] ?? Circle;
const portalName = computed(() => session.user?.portal === 'ENTERPRISE' ? '企业门户' : '监管门户');
const showCockpit = computed(() => session.user?.portal === 'REGULATORY' && route.path === '/regulatory/overview');
const scopeText = computed(() => session.user?.portal === 'ENTERPRISE' ? '仅本企业数据' : (session.user?.roles.some((r) => r.code === 'SUPER_ADMIN') ? '全市数据' : '所辖组织数据'));
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
const closeNarrowNavigation = (event: KeyboardEvent) => { if (event.key === 'Escape' && narrow.value && !collapsed.value) collapsed.value = true; };
onMounted(() => { resize(); window.addEventListener('resize', resize); window.addEventListener('keydown', closeNarrowNavigation); });
onUnmounted(() => { window.removeEventListener('resize', resize); window.removeEventListener('keydown', closeNarrowNavigation); });
async function logout() { await session.logout(); await router.replace('/login'); }
function open(menu: MenuItem) { if (menu.children?.length) router.push(menu.children[0].path); else router.push(menu.path); }
</script>
<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <aside class="sidebar" :class="{ collapsed }">
      <div class="brand"><div class="brand-mark"><Truck :size="18" /></div><div v-if="!collapsed"><strong>无人车监管</strong><span>WRC Platform</span></div></div>
      <nav aria-label="主导航">
        <el-menu :default-active="route.path" :collapse="collapsed" :collapse-transition="false" @select="(path:string) => router.push(path)">
          <template v-for="menu in session.menus" :key="menu.id">
            <el-sub-menu v-if="menu.children?.length" :index="menu.path">
              <template #title><component :is="icon(menu.icon)" :size="17" /><span>{{ menu.name }}</span></template>
              <el-menu-item v-for="child in menu.children" :key="child.id" :index="child.path"><component :is="icon(child.icon)" :size="16" /><span>{{ child.name }}</span></el-menu-item>
            </el-sub-menu>
            <el-menu-item v-else :index="menu.path" @click="open(menu)"><component :is="icon(menu.icon)" :size="17" /><span>{{ menu.name }}</span></el-menu-item>
          </template>
        </el-menu>
      </nav>
      <div class="sidebar-footer"><div v-if="!collapsed" class="identity"><strong>{{ session.user?.displayName }}</strong><span>{{ session.user?.roles.map(r => r.name).join('、') }}</span></div><el-button text circle aria-label="退出登录" @click="logout"><LogOut :size="17" /></el-button></div>
    </aside>
    <main id="main-content" tabindex="-1">
      <div class="scope-ribbon">
        <el-button text circle aria-label="切换侧边栏" @click="collapsed = !collapsed"><PanelLeftClose v-if="!collapsed" :size="17" /><PanelLeftOpen v-else :size="17" /></el-button>
        <div class="scope-title"><ScanLine :size="15" /><span>监管视域</span><strong>{{ portalName }}</strong><i></i><span>{{ scopeText }}</span></div>
        <div class="scope-actions">
          <button v-if="showCockpit" type="button" class="cockpit-entry" @mouseenter="preloadAMapNow" @click="router.push('/regulatory/cockpit')"><Gauge :size="14" />监管驾驶舱</button>
          <div class="top-user"><UserRound :size="15" /><span>{{ session.user?.username }}</span></div>
        </div>
      </div>
      <nav class="app-breadcrumb" aria-label="面包屑">
        <ol>
          <li v-for="(crumb, index) in crumbs" :key="`${crumb.name}-${index}`">
            <router-link v-if="crumb.path && crumb.path !== route.path && crumb.path.split('/').filter(Boolean).length > 1" :to="crumb.path">{{ crumb.name }}</router-link>
            <span v-else :aria-current="index === crumbs.length - 1 ? 'page' : undefined">{{ crumb.name }}</span>
          </li>
        </ol>
      </nav>
      <section class="page-canvas"><router-view /></section>
    </main>
  </div>
</template>
