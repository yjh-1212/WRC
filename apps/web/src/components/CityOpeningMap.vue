<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

const props = defineProps<{ cities: Array<{ code: string; name: string; opened: boolean }> }>();
interface Feature {
  properties: { adcode: number; name: string; center?: number[]; centroid?: number[] };
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
}
const features = ref<Feature[]>([]);
const error = ref(false);
const loading = ref(true);
async function load() {
  loading.value = true; error.value = false;
  try {
    const response = await fetch('/map/threemap/geojson/370000.json');
    if (!response.ok) throw new Error('地图读取失败');
    features.value = (await response.json()).features;
  } catch { error.value = true; }
  finally { loading.value = false; }
}
const project = (point: number[]) => [point[0]!, Math.log(Math.tan(Math.PI / 4 + point[1]! * Math.PI / 360)) * 180 / Math.PI];
const shapes = computed(() => {
  const polygons = (feature: Feature): number[][][][] => feature.geometry.type === 'MultiPolygon'
    ? feature.geometry.coordinates as number[][][][] : [feature.geometry.coordinates as number[][][]];
  const points = features.value.flatMap(feature => polygons(feature).flat(2).map(project));
  if (!points.length) return [];
  const west = Math.min(...points.map(p => p[0]!)), east = Math.max(...points.map(p => p[0]!));
  const south = Math.min(...points.map(p => p[1]!)), north = Math.max(...points.map(p => p[1]!));
  const scale = Math.min(320 / (east - west), 190 / (north - south));
  const offsetX = (360 - (east - west) * scale) / 2, offsetY = (220 - (north - south) * scale) / 2;
  const xy = (point: number[]) => { const p = project(point); return [offsetX + (p[0]! - west) * scale, offsetY + (north - p[1]!) * scale]; };
  return features.value.map(feature => {
    const code = String(feature.properties.adcode);
    const center = feature.properties.center ?? feature.properties.centroid;
    return {
      code, name: feature.properties.name.replace(/市$/, ''),
      opened: props.cities.some(city => city.code === code && city.opened),
      point: center ? xy(center) : null,
      path: polygons(feature).flatMap(polygon => polygon.map(ring => ring.map((point, i) => `${i ? 'L' : 'M'}${xy(point).map(n => n.toFixed(2)).join(',')}`).join(' ') + 'Z')).join(' '),
    };
  });
});
onMounted(load);
</script>

<template>
  <div class="opening-map" :aria-busy="loading">
    <div v-if="error" class="opening-map-state" role="alert">开通分布图加载失败<el-button text type="primary" @click="load">重新加载</el-button></div>
    <div v-else-if="loading" class="opening-map-state">正在加载开通分布…</div>
    <svg v-else viewBox="0 0 360 220" role="img" aria-label="山东省地市开通分布图">
      <path v-for="shape in shapes" :key="shape.code" :d="shape.path" :class="{ opened: shape.opened }" fill-rule="evenodd"><title>{{ shape.name }}市：{{ shape.opened ? '已开通' : '待开通' }}</title></path>
      <g v-for="shape in shapes.filter(shape => shape.opened && shape.point)" :key="`label-${shape.code}`">
        <circle :cx="shape.point![0]" :cy="shape.point![1]" r="5" />
        <text :x="shape.point![0]! + 9" :y="shape.point![1]! + 4">{{ shape.name }}</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.opening-map{min-width:0;width:100%;height:210px;display:grid;place-items:center}
svg{display:block;width:100%;height:100%;min-height:0;min-width:0;max-height:100%;overflow:visible}
path{fill:#e5efff;stroke:#b9d2f6;stroke-width:.7;stroke-linejoin:round}
path.opened{fill:#cee2ff}
circle{fill:#3679f5;stroke:white;stroke-width:2}
text{font-size:11px;fill:#244468;font-weight:600;paint-order:stroke;stroke:white;stroke-width:3px;stroke-linejoin:round}
.opening-map-state{display:flex;flex-direction:column;gap:8px;align-items:center;font-size:12px;color:#74849b}
</style>
