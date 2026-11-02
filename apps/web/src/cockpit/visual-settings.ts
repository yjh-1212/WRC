import { computed, ref } from 'vue';

export type PerformanceMode = 'low' | 'standard' | 'high';
const defaults = { performance: 'standard' as PerformanceMode, presentation: false, stars: true, atmosphere: true, halos: true, trackGlow: true };
function readSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem('cockpit-visual-v1') ?? '{}');
    return { ...defaults, performance: ['low', 'standard', 'high'].includes(raw.performance) ? raw.performance : defaults.performance,
      ...Object.fromEntries(['presentation', 'stars', 'atmosphere', 'halos', 'trackGlow'].filter(k => typeof raw[k] === 'boolean').map(k => [k, raw[k]])) } as typeof defaults;
  } catch { return { ...defaults }; }
}
export const visualSettings = ref(readSettings());
export const reducedMotion = ref(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
export const effectiveVisuals = computed(() => ({
  ...visualSettings.value,
  animate: !reducedMotion.value && visualSettings.value.performance !== 'low',
  stars: visualSettings.value.stars && visualSettings.value.performance !== 'low',
  trackGlow: visualSettings.value.trackGlow && visualSettings.value.performance !== 'low',
  labelBudget: visualSettings.value.performance === 'low' ? 24 : 48,
}));
export function persistVisualSettings() { try { localStorage.setItem('cockpit-visual-v1', JSON.stringify(visualSettings.value)); } catch { /* Private browser storage may be disabled. */ } }

// Staleness is independent of operational status; an old ONLINE record is not live telemetry.
export function isStale(time: string | null | undefined, maxAgeMs = 86400000) {
  const timestamp = time ? new Date(time).getTime() : NaN;
  return !Number.isFinite(timestamp) || Date.now() - timestamp > maxAgeMs;
}
export function reportTime(time?: string | null) {
  return time && Number.isFinite(new Date(time).getTime()) ? new Date(time).toLocaleString('zh-CN', { hour12: false }) : '未上报';
}
