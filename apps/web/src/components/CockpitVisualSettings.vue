<script setup lang="ts">
import { visualSettings, persistVisualSettings, reducedMotion } from '../cockpit/visual-settings';
</script>
<template>
  <fieldset class="cockpit-visual-settings" @change="persistVisualSettings">
    <legend>显示设置</legend>
    <label>性能档位<select aria-label="性能档位" v-model="visualSettings.performance"><option value="low">低配</option><option value="standard">标准</option><option value="high">高配</option></select></label>
    <label><input type="checkbox" v-model="visualSettings.presentation" />汇报展示模式</label>
    <label><input type="checkbox" v-model="visualSettings.stars" />背景微光</label>
    <label><input type="checkbox" v-model="visualSettings.atmosphere" />周边地理背景</label>
    <label><input type="checkbox" v-model="visualSettings.halos" />节点光晕</label>
    <label><input type="checkbox" v-model="visualSettings.trackGlow" />轨迹辉光</label>
    <small v-if="reducedMotion">已遵循系统减少动态效果设置</small>
  </fieldset>
</template>
