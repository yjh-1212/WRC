<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, RefreshCw } from 'lucide-vue-next';
import { gsap } from 'gsap';
import { api } from '../api';
import CockpitMap from '../components/CockpitMap.vue';

type CockpitData = {
  updatedAt: string; hasTrend: boolean;
  mapModes: Array<{ id: string; label: string }>;
  scope: { level: string; canCity: boolean; city: { name: string }; district: { id: string; name: string } | null; enterprise: { id: string; name: string } | null; vehicle: { id: string; name: string; businessNo: string } | null };
  summary: { registered: number; online: number; running: number; offline: number; onlineRate: number; enterprises: number; mileageToday: number; regions: number; districts?: number };
  trend: Array<{ date: string; onlineRate: number | null; samples: number }>;
  enterpriseRank: Array<{ id: string; name: string; online: number; total: number; onlineRate: number }>;
  statusDistribution: Array<{ key: string; label: string; count: number }>;
  distribution: { kind: string; title: string; items: Array<{ id: string; name: string; count: number; online: number }> };
  focusItems: Array<{ id: string; businessNo: string; name: string; enterprise: string; reason: string }>;
  riskSnapshot: { alertToday: number; alertHigh: number; alertUnhandled: number; accidents: number; violations: number; offlineAbnormal: number };
  focusTargets: {
    enterprises: Array<{ id: string; name: string; alerts: number; violations: number; risk: string }>;
    vehicles: Array<{ id: string; businessNo: string; name: string; enterprise: string; alerts: number; battery: number | null; risk: string }>;
  };
  map: { kind: 'districts' | 'enterprises' | 'vehicles' | 'regions'; items: any[]; track: Array<{ longitude: number; latitude: number; recordedAt: string; speed: number; heading?: number }> };
  context: Record<string, any>;
};

const router = useRouter();
const loading = ref(true);
const error = ref('');
const data = ref<CockpitData | null>(null);
const level = ref('city');
const organizationId = ref('');
const enterpriseId = ref('');
const vehicleId = ref('');
const mapMode = ref('situation');
const focusTab = ref<'enterprises' | 'vehicles'>('enterprises');
const root = ref<HTMLElement | null>(null);
let timer: number | undefined;
let motion: ReturnType<typeof gsap.matchMedia> | undefined;

const COCKPIT_TITLE = '无人运输车综合监管驾驶舱';

const crumbs = computed(() => {
  const scope = data.value?.scope;
  const items: Array<{ label: string; run: () => void }> = [
    { label: COCKPIT_TITLE, run: () => drill('city') },
  ];
  if (!scope) return items;
  const cityLabel = (scope.city.name || '全市').replace(/交通运输局$/, '') || '杭州市';
  items.push({ label: cityLabel, run: () => drill('city') });
  if (scope.district) {
    items.push({ label: scope.district.name, run: () => drill('district', { organizationId: scope.district!.id }) });
  }
  const enterprise = scope.enterprise;
  if (enterprise) items.push({ label: enterprise.name, run: () => drill('enterprise', { organizationId: organizationId.value, enterpriseId: enterprise.id }) });
  if (scope.vehicle) items.push({ label: scope.vehicle.businessNo, run: () => {} });
  return items;
});
const drillCrumbs = computed(() => crumbs.value.slice(1));
const rankMax = computed(() => Math.max(1, ...(data.value?.distribution.items.map((item) => item.count) ?? [1])));
const metrics = computed(() => {
  if (!data.value) return [];
  const s = data.value.summary;
  return [
    { label: '在册车辆', value: s.registered.toLocaleString() },
    { label: '当前在线', value: s.online.toLocaleString() },
    { label: '当前运行', value: s.running.toLocaleString() },
    { label: '在线率', value: `${s.onlineRate}%` },
    { label: '运营企业', value: String(s.enterprises) },
    { label: '今日里程', value: `${s.mileageToday} km` },
  ];
});
const drivingLabel = (value?: string | null) => ({ RUNNING: '运行中', IDLE: '临停', PARKED: '停驶', OFFLINE: '离线' } as Record<string, string>)[value ?? ''] ?? '未知';

async function load() {
  error.value = '';
  try {
    const query = new URLSearchParams({ level: level.value, mapMode: mapMode.value });
    if (organizationId.value) query.set('organizationId', organizationId.value);
    if (enterpriseId.value) query.set('enterpriseId', enterpriseId.value);
    if (vehicleId.value) query.set('vehicleId', vehicleId.value);
    data.value = await api<CockpitData>(`/dashboard/regulator/cockpit?${query}`);
    level.value = data.value.scope.level;
    if (data.value.scope.district) organizationId.value = data.value.scope.district.id;
    if (data.value.scope.enterprise) enterpriseId.value = data.value.scope.enterprise.id;
    if (data.value.scope.vehicle) vehicleId.value = data.value.scope.vehicle.id;
    if (!data.value.mapModes.some((item) => item.id === mapMode.value)) mapMode.value = 'situation';
  } catch (reason) {
    data.value = null;
    error.value = reason instanceof Error ? reason.message : '数据加载失败';
  } finally { loading.value = false; }
}
function drill(next: string, ids: { organizationId?: string; enterpriseId?: string; vehicleId?: string } = {}) {
  level.value = next;
  organizationId.value = ids.organizationId ?? '';
  enterpriseId.value = ids.enterpriseId ?? '';
  vehicleId.value = ids.vehicleId ?? '';
  if (next === 'vehicle') mapMode.value = 'vehicles';
  if (next === 'city') mapMode.value = 'situation';
  load();
}
function onMapSelect(payload: { kind: string; id: string }) {
  if (payload.kind === 'districts') drill('district', { organizationId: payload.id });
  else if (payload.kind === 'enterprises') drill('enterprise', { organizationId: organizationId.value, enterpriseId: payload.id });
  else if (payload.kind === 'vehicles') drill('vehicle', { organizationId: organizationId.value, enterpriseId: enterpriseId.value, vehicleId: payload.id });
}
function onDistributionSelect(item: { id: string }) {
  onMapSelect({ kind: data.value?.distribution.kind ?? '', id: item.id });
}
function setMapMode(id: string) { mapMode.value = id; load(); }

onMounted(() => {
  load();
  timer = window.setInterval(load, 30_000);
  const scopeRoot = root.value;
  if (!scopeRoot) return;
  motion = gsap.matchMedia();
  motion.add('(prefers-reduced-motion: no-preference)', () => {
    const ctx = gsap.context(() => {
      gsap.from('.cockpit-panel', { autoAlpha: 0, y: 10, duration: 0.32, stagger: 0.06, ease: 'power2.out', clearProps: 'all' });
    }, scopeRoot);
    return () => ctx.revert();
  }, scopeRoot);
});
onUnmounted(() => { if (timer) window.clearInterval(timer); motion?.revert(); });
</script>
<template>
  <div ref="root" class="cockpit">
    <h1 class="sr-only">{{ COCKPIT_TITLE }}</h1>
    <CockpitMap
      :kind="data?.map.kind ?? 'districts'"
      :items="data?.map.items ?? []"
      :track="data?.map.track ?? []"
      :trip="data?.context?.trip ?? null"
      :selected-id="vehicleId"
      @select="onMapSelect"
    />

    <!-- 顶部导航 -->
    <nav class="cockpit-nav">
      <h2 class="cockpit-title">{{ COCKPIT_TITLE }}</h2>
      <ol v-if="drillCrumbs.length > 1" class="cockpit-crumbs" aria-label="当前层级">
        <li v-for="(crumb, index) in drillCrumbs" :key="`${crumb.label}-${index}`">
          <button v-if="index < drillCrumbs.length - 1" type="button" @click="crumb.run">{{ crumb.label }}</button>
          <span v-else>{{ crumb.label }}</span>
        </li>
      </ol>
      <div v-if="data?.mapModes?.length" class="cockpit-modes" role="tablist" aria-label="地图视图">
        <button
          v-for="item in data.mapModes"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="mapMode === item.id"
          :class="{ active: mapMode === item.id }"
          @click="setMapMode(item.id)"
        >{{ item.label }}</button>
      </div>
    </nav>

    <!-- 左侧面板列 -->
    <aside class="cockpit-col left">
      <!-- 面板1：运行总体态势 -->
      <section class="cockpit-panel">
        <header>
          <h2 data-icon="▣">运行总体态势</h2>
          <button type="button" class="ghost" aria-label="刷新" :disabled="loading" @click="load">
            <RefreshCw :size="13" />
          </button>
        </header>
        <div class="cockpit-body">
          <div v-if="error && !data" class="cockpit-empty">{{ error }}</div>
          <template v-else-if="data">
            <!-- 核心指标：在册 + 在线率 -->
            <div class="ck-hero-row" data-cockpit-kpis>
              <div class="ck-hero">
                <strong>{{ data.summary.registered.toLocaleString() }}</strong>
                <span>在册车辆</span>
              </div>
              <div class="ck-hero-divider"></div>
              <div class="ck-hero ck-hero--rate">
                <strong>{{ data.summary.onlineRate }}%</strong>
                <span>当前在线率</span>
                <em :class="data.summary.onlineRate >= 85 ? 'up' : data.summary.onlineRate >= 70 ? 'mid' : 'dn'">
                  {{ data.summary.onlineRate >= 85 ? '优良' : data.summary.onlineRate >= 70 ? '正常' : '偏低' }}
                </em>
              </div>
            </div>
            <!-- 次级指标 2×2 -->
            <div class="ck-sub-grid">
              <div class="ck-sub">
                <i class="ck-dot running"></i>
                <div>
                  <strong>{{ data.summary.running.toLocaleString() }}</strong>
                  <span>当前运行</span>
                </div>
              </div>
              <div class="ck-sub">
                <i class="ck-dot online"></i>
                <div>
                  <strong>{{ data.summary.online.toLocaleString() }}</strong>
                  <span>当前在线</span>
                </div>
              </div>
              <div class="ck-sub">
                <i class="ck-dot ent"></i>
                <div>
                  <strong>{{ data.summary.enterprises }}</strong>
                  <span>运营企业</span>
                </div>
              </div>
              <div class="ck-sub">
                <i class="ck-dot mile"></i>
                <div>
                  <strong>{{ data.summary.mileageToday.toLocaleString() }}<small> km</small></strong>
                  <span>今日里程</span>
                </div>
              </div>
            </div>
          </template>
        </div>
      </section>

      <!-- 面板2：企业运行态势 -->
      <section class="cockpit-panel">
        <header>
          <h2 data-icon="▤">企业运行态势</h2>
          <span class="cockpit-panel-note">TOP5</span>
        </header>
        <div class="cockpit-body">
          <div class="cockpit-ent-table">
            <div class="cockpit-ent-head">
              <span>企业名称</span><span>在线车辆</span><span>在线率</span>
            </div>
            <div v-if="!data?.enterpriseRank?.length" class="cockpit-empty">暂无企业数据</div>
            <div
              v-for="item in (data?.enterpriseRank ?? [])"
              :key="item.id"
              class="cockpit-ent-row"
              @click="drill('enterprise', { organizationId, enterpriseId: item.id })"
            >
              <span class="cockpit-ent-name">{{ item.name }}</span>
              <span class="cockpit-ent-val">{{ item.online }}</span>
              <span class="cockpit-ent-rate" :style="{ color: item.onlineRate >= 85 ? 'var(--ck-green)' : item.onlineRate >= 70 ? 'var(--ck-cyan)' : 'var(--ck-warn)' }">{{ item.onlineRate }}%</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 面板3：运行分布 TOP5 -->
      <section class="cockpit-panel">
        <header>
          <h2 data-icon="◫">{{ data?.distribution.title ?? '运行分布' }}</h2>
          <span class="cockpit-panel-note">TOP5</span>
        </header>
        <div class="cockpit-body">
          <div v-if="!data?.distribution.items.length" class="cockpit-empty">当前层级暂无分布数据</div>
          <div v-else class="cockpit-rank-list">
            <button
              v-for="(item, idx) in (data?.distribution.items ?? [])"
              :key="item.id"
              type="button"
              class="cockpit-rank"
              @click="onDistributionSelect(item)"
            >
              <span class="cockpit-rank-no">{{ idx + 1 }}</span>
              <span class="cockpit-rank-name">{{ item.name }}</span>
              <div class="cockpit-bar-wrap"><span class="cockpit-bar" :style="{ width: `${Math.max(8, item.count / rankMax * 100)}%` }"></span></div>
              <span class="cockpit-rank-count">{{ item.count }}</span>
            </button>
          </div>
        </div>
      </section>
    </aside>

    <!-- 右侧面板列 -->
    <aside class="cockpit-col right">
      <template v-if="data?.scope.level === 'vehicle'">
        <section class="cockpit-panel">
          <header>
            <h2 data-icon="◇">车辆属性</h2>
            <span class="cockpit-panel-note">{{ drivingLabel(data.context.drivingState) }}</span>
          </header>
          <div class="cockpit-body">
            <dl class="cockpit-facts">
              <div><dt>车辆编号</dt><dd>{{ data.context.businessNo }}</dd></div>
              <div><dt>所属企业</dt><dd>{{ data.context.enterprise }}</dd></div>
              <div><dt>监管辖区</dt><dd>{{ data.context.organization }}</dd></div>
              <div><dt>当前速度</dt><dd>{{ data.context.speed ?? 0 }} km/h</dd></div>
              <div><dt>剩余电量</dt><dd>{{ data.context.battery ?? '—' }}%</dd></div>
              <div><dt>今日里程</dt><dd>{{ data.context.mileageToday ?? 0 }} km</dd></div>
            </dl>
          </div>
        </section>
        <section class="cockpit-panel">
          <header>
            <h2 data-icon="◆">订单任务</h2>
            <span class="cockpit-panel-note">{{ data.context.currentOrder ? '在途' : '无任务' }}</span>
          </header>
          <div class="cockpit-body">
            <div v-if="!data.context.currentOrder" class="cockpit-empty">该车当前没有配送订单。</div>
            <dl v-else class="cockpit-facts">
              <div><dt>订单号</dt><dd>{{ data.context.currentOrder.businessNo }}</dd></div>
              <div><dt>货物</dt><dd>{{ data.context.currentOrder.cargoType }} {{ data.context.currentOrder.cargoWeight }}kg</dd></div>
              <div><dt>起点</dt><dd>{{ data.context.currentOrder.startName }}</dd></div>
              <div><dt>终点</dt><dd>{{ data.context.currentOrder.endName }}</dd></div>
              <div><dt>进度</dt><dd>{{ data.context.currentOrder.progressPct }}%</dd></div>
              <div><dt>预计到达</dt><dd>{{ data.context.currentOrder.etaMinutes }} 分钟</dd></div>
            </dl>
          </div>
        </section>
        <section class="cockpit-panel">
          <header>
            <h2 data-icon="⬟">行程轨迹</h2>
            <span class="cockpit-panel-note">起终点</span>
          </header>
          <div class="cockpit-body">
            <div v-if="!data.context.trip" class="cockpit-empty">暂无轨迹数据。</div>
            <dl v-else class="cockpit-facts">
              <div><dt>起点</dt><dd>{{ data.context.trip.startName }}</dd></div>
              <div><dt>终点</dt><dd>{{ data.context.trip.endName }}</dd></div>
              <div><dt>轨迹点</dt><dd>{{ data.map.track?.length ?? 0 }} 个</dd></div>
              <div><dt>最后上报</dt><dd>{{ data.context.heartbeatAt ? new Date(data.context.heartbeatAt).toLocaleTimeString('zh-CN') : '—' }}</dd></div>
            </dl>
          </div>
        </section>
      </template>
      <template v-else>
      <!-- 面板4：当前风险态势 -->
      <section class="cockpit-panel">
        <header>
          <h2 data-icon="◇">当前风险态势</h2>
          <span class="cockpit-panel-note">实时</span>
        </header>
        <div class="cockpit-body">
          <div v-if="!data?.riskSnapshot" class="cockpit-empty">暂无风险数据</div>
          <div v-else class="ck-risk-grid">
            <div class="ck-risk-kpi warn">
              <strong>{{ data.riskSnapshot.alertToday }}</strong>
              <span>今日告警</span>
            </div>
            <div class="ck-risk-kpi danger">
              <strong>{{ data.riskSnapshot.alertHigh }}</strong>
              <span>严重告警</span>
            </div>
            <div class="ck-risk-kpi orange">
              <strong>{{ data.riskSnapshot.alertUnhandled }}</strong>
              <span>未处置</span>
            </div>
            <div class="ck-risk-kpi danger">
              <strong>{{ data.riskSnapshot.accidents }}</strong>
              <span>今日事故</span>
            </div>
            <div class="ck-risk-kpi warn">
              <strong>{{ data.riskSnapshot.violations }}</strong>
              <span>违规</span>
            </div>
            <div class="ck-risk-kpi orange">
              <strong>{{ data.riskSnapshot.offlineAbnormal }}</strong>
              <span>离线异常</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 面板5：重点监管对象 -->
      <section class="cockpit-panel">
        <header>
          <h2 data-icon="◆">重点监管对象</h2>
          <span class="cockpit-panel-note">风险关注</span>
        </header>
        <div class="cockpit-body ck-focus-body">
          <!-- Tab 切换 -->
          <div class="ck-focus-tabs">
            <button :class="{ active: focusTab === 'enterprises' }" @click="focusTab = 'enterprises'">重点企业</button>
            <button :class="{ active: focusTab === 'vehicles' }" @click="focusTab = 'vehicles'">重点车辆</button>
          </div>
          <!-- 重点企业列表 -->
          <div v-if="focusTab === 'enterprises'" class="ck-focus-list">
            <div v-if="!data?.focusTargets?.enterprises?.length" class="cockpit-empty">当前无重点监管企业</div>
            <button
              v-for="(item, idx) in (data?.focusTargets?.enterprises ?? []).slice(0, 3)"
              :key="item.id"
              type="button"
              class="ck-focus-item"
              @click="drill('enterprise', { organizationId, enterpriseId: item.id })"
            >
              <span class="ck-focus-no">{{ idx + 1 }}</span>
              <div class="ck-focus-info">
                <strong>{{ item.name }}</strong>
                <small>告警 {{ item.alerts }} | 违规 {{ item.violations }}</small>
              </div>
              <span class="ck-risk-badge" :class="item.risk.toLowerCase()">
                {{ item.risk === 'HIGH' ? '高风险' : item.risk === 'MEDIUM' ? '较高' : '关注' }}
              </span>
            </button>
          </div>
          <!-- 重点车辆列表 -->
          <div v-if="focusTab === 'vehicles'" class="ck-focus-list">
            <div v-if="!data?.focusTargets?.vehicles?.length" class="cockpit-empty">当前无重点监管车辆</div>
            <button
              v-for="(item, idx) in (data?.focusTargets?.vehicles ?? []).slice(0, 3)"
              :key="item.id"
              type="button"
              class="ck-focus-item"
              @click="drill('vehicle', { organizationId, enterpriseId, vehicleId: item.id })"
            >
              <span class="ck-focus-no">{{ idx + 1 }}</span>
              <div class="ck-focus-info">
                <strong>{{ item.businessNo.replace('VEH-2026-', '#') }}</strong>
                <small>{{ item.enterprise }} · 告警 {{ item.alerts }}{{ item.battery != null ? ` · 电量 ${item.battery}%` : '' }}</small>
              </div>
              <span class="ck-risk-badge" :class="item.risk.toLowerCase()">
                {{ item.risk === 'HIGH' ? '高风险' : item.risk === 'MEDIUM' ? '较高' : '关注' }}
              </span>
            </button>
          </div>
        </div>
      </section>

      <!-- 面板6：重点运行关注 -->
      <section class="cockpit-panel">
        <header>
          <h2 data-icon="⬟">重点运行关注</h2>
          <span class="cockpit-panel-note">需关注</span>
        </header>
        <div class="cockpit-body">
          <div v-if="!data?.focusItems.length" class="cockpit-empty">当前没有超时未上报或低电量车辆，运行正常。</div>
          <div v-else class="cockpit-focus-list">
            <button
              v-for="item in data.focusItems.slice(0, 3)"
              :key="item.id"
              type="button"
              class="cockpit-focus"
              @click="drill('vehicle', { organizationId, enterpriseId, vehicleId: item.id })"
            >
              <strong>{{ item.businessNo }}</strong>
              <small>{{ item.enterprise }} · {{ item.reason }}</small>
            </button>
          </div>
        </div>
      </section>
      </template>
    </aside>

    <div class="cockpit-legend">
      <span><i style="background:#17d6ff"></i>在运（有订单）</span>
      <span><i style="background:#ffb340"></i>未在运</span>
      <span><i style="background:#6b8094"></i>离线</span>
    </div>

    <!-- 返回按钮 -->
    <button type="button" class="cockpit-back" @click="router.push('/regulatory/overview')">
      <ArrowLeft :size="14" />返回总览
    </button>

    <!-- 加载 / 错误遮罩 -->
    <div v-if="loading && !data" class="cockpit-boot">正在加载运行态势…</div>
    <div v-else-if="error && !data" class="cockpit-boot">{{ error }}</div>
  </div>
</template>
