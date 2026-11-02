<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Trash2 } from 'lucide-vue-next';
import type { AppearanceField, AppearancePreset, CockpitAppearance } from '../cockpit/province-appearance';
const props = defineProps<{ opened: boolean; draft?: CockpitAppearance; fields: AppearanceField[]; builtins: AppearancePreset[]; presets: AppearancePreset[]; ready: boolean; loading: boolean; busy: boolean; canEdit: boolean; feedback: string; syncError: string }>();
const emit = defineEmits<{ cancel: []; change: [value: CockpitAppearance]; save: []; savePreset: [name: string]; deletePreset: [id: string]; retry: [] }>();
const defaultGroups = ['左右面板', '三维地图', '整体主题与背景'];
const search = ref(''), choice = ref(''), presetName = ref(''), invalid = ref(''), groupsOpen = ref([...defaultGroups]);
const priority: Record<string, number> = { '左右面板': 0, '三维地图': 1 };
const groups = computed(() => [...new Set(props.fields.map(field => field.group))].sort((a, b) => (priority[a] ?? 2) - (priority[b] ?? 2)).map(name => ({ name, fields: props.fields.filter(field => field.group === name && (!search.value.trim() || `${field.group}${field.label}`.includes(search.value.trim()))) })).filter(group => group.fields.length));
const selectedCustom = computed(() => props.presets.find(preset => `custom:${preset.id}` === choice.value));
watch(search, value => { groupsOpen.value = value.trim() ? groups.value.map(group => group.name) : [...defaultGroups]; });
watch(() => props.opened, value => { if (value) { search.value = ''; choice.value = ''; presetName.value = ''; invalid.value = ''; groupsOpen.value = [...defaultGroups]; } });
watch(() => props.presets, () => { if (choice.value.startsWith('custom:') && !selectedCustom.value) choice.value = ''; });
function update(field: AppearanceField, value: unknown) {
  if (!props.draft) return;
  invalid.value = '';
  if (field.kind === 'range') { value = Number(value); if (!Number.isFinite(value)) return; const shown = Math.max(rangeMin(field), Math.min(rangeMax(field), Number(value))) / (field.display?.scale ?? 1); value = Number((field.display?.invert ? field.min! + field.max! - shown : shown).toFixed(6)); }
  if (field.kind === 'color' && !/^#[\da-f]{6}$/i.test(String(value))) { invalid.value = `${field.label}需要六位颜色值，例如 #5281ff`; return; }
  emit('change', { ...props.draft, [field.key]: value as string | number | boolean });
}
function rangeMin(field: AppearanceField) { return field.min! * (field.display?.scale ?? 1); }
function rangeMax(field: AppearanceField) { return field.max! * (field.display?.scale ?? 1); }
function rangeStep(field: AppearanceField) { return Number(((field.step ?? 1) * (field.display?.scale ?? 1)).toFixed(6)); }
function rangeValue(field: AppearanceField) { const value = Number(props.draft?.[field.key] ?? field.default); return Number(((field.display?.invert ? field.min! + field.max! - value : value) * (field.display?.scale ?? 1)).toFixed(6)); }
function colorValueLabel(field: AppearanceField) { return `${field.label.replace(/颜色$/, '')}颜色值`; }
function choose(value: string) { invalid.value = ''; const preset = value.startsWith('custom:') ? props.presets.find(item => `custom:${item.id}` === value) : props.builtins.find(item => item.id === value); if (preset) emit('change', { ...preset.style }); }
function defaults() { invalid.value = ''; choice.value = ''; emit('change', Object.fromEntries(props.fields.map(field => [field.key, field.default]))); }
</script>
<template>
  <el-dialog :model-value="opened" title="大屏风格设置" width="420px" top="5vh" draggable :modal="false" :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy" class="pc-settings" @close="emit('cancel')">
    <p class="pc-settings-intro">修改后点击「保存风格」，其他电脑自动同步，无需逐台设置。</p>
    <div v-if="syncError" class="pc-settings-error" role="alert">{{ syncError }}<el-button text @click="emit('retry')">重新读取</el-button></div>
    <div class="pc-setting-preset"><el-select v-model="choice" placeholder="选择风格预设" aria-label="选择风格预设" popper-class="pc-select-popper" :disabled="!ready || busy" @change="choose"><el-option v-for="preset in builtins" :key="preset.id" :label="preset.name" :value="preset.id"/><el-option v-for="preset in presets" :key="preset.id" :label="preset.name" :value="`custom:${preset.id}`"/></el-select><el-popconfirm v-if="selectedCustom && canEdit" :title="`删除预设‘${selectedCustom.name}’？`" confirm-button-text="删除" cancel-button-text="取消" @confirm="emit('deletePreset', selectedCustom!.id)"><template #reference><el-button :icon="Trash2" :disabled="busy" aria-label="删除所选预设"/></template></el-popconfirm><el-button :disabled="!ready || busy" @click="defaults">恢复默认</el-button></div>
    <el-input v-model="search" clearable aria-label="搜索风格设置项" placeholder="搜索设置项" :disabled="!ready || busy"/>
    <div class="pc-settings-scroll" v-loading="loading && !ready">
      <el-collapse v-if="draft" v-model="groupsOpen"><el-collapse-item v-for="group in groups" :key="group.name" :title="group.name" :name="group.name"><p v-if="group.name === '左右面板'" class="pc-panel-appearance-note">颜色同时应用到左右面板；透明度0%为不透明，100%为完全透明。</p><div v-for="field in group.fields" :key="field.key" class="pc-setting-row" :class="{ range: field.kind === 'range' }"><label :for="`pc-setting-${field.key}`">{{ field.label }}</label><div v-if="field.kind === 'color'" class="pc-color-field"><input :id="`pc-setting-${field.key}`" type="color" :value="String(draft[field.key])" :aria-label="field.label" :disabled="busy" @input="update(field, ($event.target as HTMLInputElement).value)"/><input :value="String(draft[field.key])" maxlength="7" :aria-label="colorValueLabel(field)" :disabled="busy" @change="update(field, ($event.target as HTMLInputElement).value)"/></div><el-switch v-else-if="field.kind === 'toggle'" :id="`pc-setting-${field.key}`" :model-value="Boolean(draft[field.key])" :aria-label="field.label" :disabled="busy" @update:model-value="(value: unknown) => update(field, value)"/><div v-else-if="field.kind === 'range'" class="pc-range-field"><input :id="`pc-setting-${field.key}`" type="range" :min="rangeMin(field)" :max="rangeMax(field)" :step="rangeStep(field)" :value="rangeValue(field)" :aria-label="field.label" :disabled="busy" @input="update(field, ($event.target as HTMLInputElement).value)"/><input type="number" :min="rangeMin(field)" :max="rangeMax(field)" :step="rangeStep(field)" :value="rangeValue(field)" :aria-label="`${field.label}数值`" :disabled="busy" @change="update(field, ($event.target as HTMLInputElement).value)"/></div><el-select v-else :id="`pc-setting-${field.key}`" :model-value="draft[field.key]" :aria-label="field.label" popper-class="pc-select-popper" :disabled="busy" @update:model-value="(value: unknown) => update(field, value)"><el-option v-for="option in field.options" :key="option.value" :label="option.label" :value="option.value"/></el-select></div></el-collapse-item></el-collapse>
      <p v-if="ready && !groups.length" class="pc-settings-empty">没有找到匹配的设置项</p>
    </div>
    <template #footer><div class="pc-preset-save"><el-input v-model="presetName" placeholder="新预设名称" aria-label="新预设名称" maxlength="20" :disabled="!canEdit || busy"/><el-button :disabled="!ready || !presetName.trim() || !canEdit || busy" @click="emit('savePreset', presetName)">另存预设</el-button></div><p class="pc-setting-scope">应用范围：省级驾驶舱 · 所有浏览器共享</p><div class="pc-settings-footer"><small role="status">{{ invalid || feedback || (canEdit ? '设置保存在服务器，取消将放弃本次预览' : '当前账号可预览，共享保存需要省级管理权限') }}</small><el-button :disabled="busy" @click="emit('cancel')">取消</el-button><el-button type="primary" :loading="busy" :disabled="!ready || !draft || !canEdit || !!invalid" @click="emit('save')">保存风格</el-button></div></template>
  </el-dialog>
</template>
