import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

export interface ProvinceMapVehicle {
  id: string; name: string; businessNo: string; cityCode?: string; organizationId: string; enterpriseId: string;
  enterprise: string; organization: string; onlineStatus: string; drivingState?: string; speed?: number; battery?: number;
  longitude?: number; latitude?: number; heading?: number; heartbeatAt?: string; locationTime?: string; mileageToday?: number; highRisks?: number;
}
export interface ProvinceMapData {
  updatedAt: string; level: string; connected: boolean; cityCode: string | null; cityName: string;
  scope: { level: string; city: { id: string; name: string } | null; district: { id: string; name: string } | null; enterprise: { id: string; name: string } | null; vehicle: { id: string; name: string; businessNo: string } | null };
  map: { kind: string; items: any[]; track: any[]; currentTrack?: any[]; operationRegions?: any[] }; vehicles: ProvinceMapVehicle[]; context: Record<string, any>;
  summary: any; distribution: { kind: string; title: string; items: Array<{ id: string; name: string; count: number; online: number }> } | null;
  vehicleTypes?: Record<string, number>; riskSnapshot?: Record<string, number>; focusItems?: Array<{ id: string; businessNo: string; reason: string }>;
}
export function useProvinceDrill() {
  const route = useRoute(), router = useRouter();
  const data = ref<ProvinceMapData>(), loading = ref(false), error = ref('');
  const cityCode = computed(() => typeof route.query.cityCode === 'string' ? route.query.cityCode : '');
  const vehicleMode = computed(() => !!route.query.vehicleId);
  const level = computed(() => vehicleMode.value ? 'vehicle' : route.query.enterpriseId ? 'enterprise' : route.query.organizationId ? 'district' : cityCode.value ? 'city' : 'province');
  const query = computed(() => {
    const result = new URLSearchParams();
    for (const key of ['cityCode', 'organizationId', 'enterpriseId', 'vehicleId', 'mapMode']) if (typeof route.query[key] === 'string' && route.query[key]) result.set(key, route.query[key] as string);
    if (level.value !== 'province') result.set('level', level.value);
    return result.toString();
  });
  let generation = 0, controller: AbortController | undefined, active = true, lastRead = 0, lastFullRead = 0, loadedQuery = '';
  async function load() {
    if (!active || route.path !== '/province/cockpit') return;
    const current = ++generation; controller?.abort(); controller = new AbortController(); loading.value = true; error.value = ''; lastRead = lastFullRead = Date.now();
    try { const requested = query.value; const result = await api<ProvinceMapData>(`/dashboard/regulator/province-cockpit/map?${requested}`, { signal: controller.signal }); if (current === generation) { data.value = result; loadedQuery = requested; } }
    catch (reason) { if (current === generation && !controller.signal.aborted) error.value = reason instanceof Error ? reason.message : '地图业务数据读取失败'; }
    finally { if (current === generation) loading.value = false; }
  }
  async function telemetry() {
    if (!data.value?.scope.vehicle || loading.value || !active) return;
    const expected = query.value, current = generation;
    lastRead = Date.now();
    try {
      const result = await api<{ updatedAt: string; vehicle: ProvinceMapVehicle; currentTrack: any[]; currentTrip: any }>(`/dashboard/regulator/province-cockpit/map/vehicles/${encodeURIComponent(data.value.scope.vehicle.id)}?cityCode=${cityCode.value}`);
      if (!active || current !== generation || expected !== query.value || !data.value) return;
      data.value = { ...data.value, updatedAt: result.updatedAt, vehicles: [result.vehicle], context: { ...data.value.context, ...result.vehicle, currentTrip: result.currentTrip }, map: { ...data.value.map, items: [result.vehicle], currentTrack: result.currentTrack ?? [] } };
      error.value = '';
    } catch (reason) { if (current === generation && expected === query.value) error.value = reason instanceof Error ? reason.message : '车辆上报暂时读取失败'; }
  }
  function chooseCity(code: string) { void router.replace({ path: '/province/cockpit', query: code ? { cityCode: code } : {} }); }
  function drill(kind: string, id: string, raw?: any) {
    if (kind === 'cities') { chooseCity(id); return; }
    const next: Record<string, string> = { cityCode: raw?.cityCode ?? cityCode.value };
    if (!next.cityCode) return;
    if (kind === 'districts') next.organizationId = id;
    if (kind === 'enterprises') { if (typeof route.query.organizationId === 'string') next.organizationId = route.query.organizationId; next.enterpriseId = id; }
    if (kind === 'vehicles') {
      next.organizationId = raw?.organizationId ?? (typeof route.query.organizationId === 'string' ? route.query.organizationId : '');
      next.enterpriseId = raw?.enterpriseId ?? (typeof route.query.enterpriseId === 'string' ? route.query.enterpriseId : '');
      next.vehicleId = id; next.mapMode = 'vehicles';
    }
    void router.replace({ path: '/province/cockpit', query: Object.fromEntries(Object.entries(next).filter(([, value]) => value)) });
  }
  const crumbs = computed(() => {
    const result: Array<{ name: string; query: Record<string, string> }> = [{ name: '全省', query: {} }];
    if (!cityCode.value) return result;
    const city = { cityCode: cityCode.value };
    result.push({ name: data.value?.cityCode === cityCode.value ? data.value.cityName : '地市', query: city });
    const district = data.value?.scope.district, enterprise = data.value?.scope.enterprise;
    if (district && route.query.organizationId) result.push({ name: district.name, query: { ...city, organizationId: district.id } });
    if (enterprise && route.query.enterpriseId) result.push({ name: enterprise.name, query: { ...city, ...(route.query.organizationId ? { organizationId: String(route.query.organizationId) } : {}), enterpriseId: enterprise.id } });
    if (data.value?.scope.vehicle && vehicleMode.value) result.push({ name: data.value.scope.vehicle.businessNo, query: { ...city, vehicleId: data.value.scope.vehicle.id, mapMode: 'vehicles' } });
    return result;
  });
  function navigate(value: Record<string, string>) { void router.replace({ path: '/province/cockpit', query: value }); }
  function back() { navigate(crumbs.value[Math.max(0, crumbs.value.length - 2)]!.query); }
  watch(query, load, { immediate: true });
  const timer = setInterval(() => { if (active && !document.hidden && !loading.value && Date.now() - lastRead >= (vehicleMode.value ? 5000 : 30000)) { if (vehicleMode.value && data.value?.scope.vehicle && Date.now() - lastFullRead < 30000) void telemetry(); else void load(); } }, 1000);
  onDeactivated(() => { active = false; generation++; controller?.abort(); loading.value = false; });
  onActivated(() => { active = true; if (!loading.value && (loadedQuery !== query.value || Date.now() - lastRead > 2000)) void load(); });
  onBeforeUnmount(() => { active = false; generation++; controller?.abort(); clearInterval(timer); });
  return { data, loading, error, cityCode, level, vehicleMode, crumbs, load, chooseCity, drill, navigate, back };
}
