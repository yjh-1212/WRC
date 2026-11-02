<script setup lang="ts">
import { computed, ref } from 'vue';
import ProvinceCockpitPanel from './ProvinceCockpitPanel.vue';
import { Activity, Building2, CarFront, ChartNoAxesCombined, Gauge, MapPinned, Route, ShieldAlert } from 'lucide-vue-next';

const props = defineProps<{ city: any }>();
const emit = defineEmits<{ drill: [item: { kind: string; id: string }] }>();
const focusTab = ref<'enterprises' | 'vehicles'>('enterprises');
const summary = computed(() => props.city?.summary);
const scope = computed(() => props.city?.scope);
const context = computed(() => props.city?.context ?? {});
const trackMeta = computed(() => context.value.currentTrip ?? context.value.historyTrack ?? {});
const trackPoints = computed<any[]>(() => props.city?.map?.currentTrack?.length ? props.city.map.currentTrack : props.city?.map?.track ?? []);
const vehicle = computed(() => scope.value?.level === 'vehicle');
const scopeName = computed(() => scope.value?.vehicle?.businessNo ?? scope.value?.enterprise?.name ?? scope.value?.district?.name ?? scope.value?.city?.name ?? '市级范围');
const enterpriseRank = computed<any[]>(() => props.city?.enterpriseRank ?? []);
const distribution = computed<any[]>(() => props.city?.distribution?.items ?? []);
const rankMax = computed(() => Math.max(1, ...distribution.value.map(item => item.count ?? 0)));
const status = computed<any[]>(() => props.city?.statusDistribution ?? []);
const focus = computed<any[]>(() => props.city?.focusTargets?.[focusTab.value] ?? []);
const fmt = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
const fmtTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '暂无记录';
const reportedAt = computed(() => context.value.heartbeatAt ? new Date(context.value.heartbeatAt).toLocaleString('zh-CN', { hour12: false }) : '暂无上报');
const drivingState = computed(() => ({ RUNNING: '运行中', IDLE: '临停', PARKED: '停驶', OFFLINE: '离线' } as Record<string, string>)[context.value.drivingState] ?? '暂无上报');
function drill(kind: string, id: string) { emit('drill', { kind, id }); }
</script>

<template>
  <aside class="pc-side pc-left city-hud" aria-label="市级运行概览">
    <ProvinceCockpitPanel :icon="Activity" title="运行总体态势" :subtitle="scopeName">
      <div v-if="summary" class="city-summary-grid">
        <div><strong>{{ fmt(summary.registered) }}</strong><span>在册车辆</span></div>
        <div><strong>{{ fmt(summary.onlineRate) }}%</strong><span>上报在线率</span></div>
        <div><strong>{{ fmt(summary.running) }}</strong><span>上报运行</span></div>
        <div><strong>{{ fmt(summary.online) }}</strong><span>上报在线</span></div>
        <div><strong>{{ fmt(summary.enterprises) }}</strong><span>运营公司</span></div>
        <div><strong>{{ fmt(summary.mileageToday) }}<small> km</small></strong><span>上报日里程</span></div>
      </div>
    </ProvinceCockpitPanel>
    <ProvinceCockpitPanel :icon="Building2" title="运营公司态势" :subtitle="`TOP ${enterpriseRank.length}`">
      <div class="city-enterprise-table">
        <div class="city-enterprise-head"><span>运营公司</span><span>在线</span><span>在线率</span></div>
        <button v-for="item in enterpriseRank" :key="item.id" type="button" @click="drill('enterprises', item.id)"><span :title="item.name">{{ item.name }}</span><b>{{ fmt(item.online) }}</b><em>{{ fmt(item.onlineRate) }}%</em></button>
        <p v-if="!enterpriseRank.length">当前范围暂无运营公司数据</p>
      </div>
    </ProvinceCockpitPanel>
    <ProvinceCockpitPanel :icon="ChartNoAxesCombined" :title="city?.distribution?.title ?? '运行分布'" :subtitle="`TOP ${distribution.length}`">
      <div class="cockpit-ranking-list city-ranking-list"><button v-for="(item, index) in distribution" :key="item.id" type="button" @click="drill(city.distribution.kind, item.id)"><em>{{ String(index + 1).padStart(2, '0') }}</em><span :title="item.name">{{ item.name }}</span><i><b :style="{ width: `${Math.max(5, (item.count ?? 0) / rankMax * 100)}%` }"></b></i><strong>{{ fmt(item.count) }}</strong></button><p v-if="!distribution.length">当前范围暂无分布数据</p></div>
    </ProvinceCockpitPanel>
  </aside>

  <aside class="pc-side pc-right city-hud" aria-label="市级重点监管">
    <template v-if="vehicle">
      <ProvinceCockpitPanel :icon="CarFront" title="车辆属性" :subtitle="scope.vehicle.businessNo">
        <dl class="city-facts"><div><dt>所属公司</dt><dd>{{ context.enterprise ?? '—' }}</dd></div><div><dt>监管辖区</dt><dd>{{ context.organization ?? '—' }}</dd></div><div><dt>在线状态</dt><dd>{{ context.onlineStatus === 'ONLINE' ? '在线' : '离线' }}</dd></div><div><dt>运行状态</dt><dd>{{ drivingState }}</dd></div><div><dt>当前速度</dt><dd>{{ fmt(context.speed) }} km/h</dd></div><div><dt>剩余电量</dt><dd>{{ fmt(context.battery) }}%</dd></div><div><dt>最后上报</dt><dd>{{ reportedAt }}</dd></div></dl>
      </ProvinceCockpitPanel>
      <ProvinceCockpitPanel :icon="Gauge" title="运行记录" subtitle="最近已接入记录">
        <dl v-if="context.latestOperation" class="city-facts"><div><dt>运行里程</dt><dd>{{ fmt(context.latestOperation.mileage) }} km</dd></div><div><dt>运行时长</dt><dd>{{ fmt(context.latestOperation.durationMinutes) }} 分钟</dd></div><div><dt>开始时间</dt><dd>{{ fmtTime(context.latestOperation.startedAt) }}</dd></div><div><dt>结束时间</dt><dd>{{ fmtTime(context.latestOperation.endedAt) }}</dd></div></dl>
        <p v-else class="city-empty">暂无已接入的运行记录</p>
      </ProvinceCockpitPanel>
      <ProvinceCockpitPanel :icon="Route" title="行程轨迹" :subtitle="`${city?.map?.currentTrack?.length || city?.map?.track?.length || 0} 点`">
        <dl class="city-facts"><div><dt>起点</dt><dd>{{ trackMeta.startName ?? '暂无记录' }}</dd></div><div><dt>终点</dt><dd>{{ trackMeta.endName ?? '暂无记录' }}</dd></div><div><dt>{{ context.currentTrip ? '当前行程' : '最近记录' }}</dt><dd>{{ trackPoints.length }} 个定位点</dd></div><div><dt>轨迹开始</dt><dd>{{ fmtTime(trackMeta.startedAt) }}</dd></div><div><dt>最新记录</dt><dd>{{ fmtTime(trackMeta.endedAt ?? trackPoints.at(-1)?.recordedAt) }}</dd></div></dl>
        <p class="city-fact-note">运行车辆自动跟随定位；轨迹使用实际记录的时间和坐标</p>
      </ProvinceCockpitPanel>
    </template>
    <template v-else>
      <ProvinceCockpitPanel :icon="MapPinned" title="当前层级概况" :subtitle="scopeName">
        <dl class="city-facts"><div><dt>监管区域</dt><dd>{{ fmt(summary?.districts ?? summary?.regions) }} 个</dd></div><div><dt>运营公司</dt><dd>{{ fmt(summary?.enterprises) }} 家</dd></div><div><dt>在册车辆</dt><dd>{{ fmt(summary?.registered) }} 辆</dd></div><div><dt>在线车辆</dt><dd>{{ fmt(summary?.online) }} 辆</dd></div><div><dt>运行车辆</dt><dd>{{ fmt(summary?.running) }} 辆</dd></div></dl>
      </ProvinceCockpitPanel>
      <ProvinceCockpitPanel :icon="ShieldAlert" title="车辆运行状态" subtitle="数据库统计">
        <div class="city-status-list"><div v-for="item in status" :key="item.key"><span>{{ item.label }}</span><strong>{{ fmt(item.count) }}</strong><i><b :style="{ width: `${(item.count ?? 0) / Math.max(1, summary?.registered ?? 0) * 100}%` }"></b></i></div></div>
      </ProvinceCockpitPanel>
      <ProvinceCockpitPanel :icon="ShieldAlert" title="重点监管对象" :subtitle="`${focus.length} 项`">
        <div class="city-focus-tabs"><button type="button" :class="{ active: focusTab === 'enterprises' }" @click="focusTab = 'enterprises'">重点公司</button><button type="button" :class="{ active: focusTab === 'vehicles' }" @click="focusTab = 'vehicles'">重点车辆</button></div>
        <div class="city-focus-list"><button v-for="item in focus" :key="item.id" type="button" @click="drill(focusTab, item.id)"><strong>{{ item.businessNo ?? item.name }}</strong><small>{{ focusTab === 'vehicles' ? item.enterprise : `告警 ${fmt(item.alerts)} · 违规 ${fmt(item.violations)}` }}</small></button><p v-if="!focus.length">当前无重点监管对象</p></div>
      </ProvinceCockpitPanel>
    </template>
  </aside>
</template>
