<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router';
import { ArrowLeft, Download, FilePlus2, Info, RefreshCw } from 'lucide-vue-next';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { useSessionStore } from '../stores/session';
import { api } from '../api';
import type { PageData, RegulatoryReport } from '../types';
import QueryPanel from '../components/QueryPanel.vue';
import QueryField from '../components/QueryField.vue';
import ReportDocument from '../components/ReportDocument.vue';
import { reportCategories, reportPeriods, reportLabel, reportDay, reportTime, reportError } from '../reports';
import '../reports.css';

const session = useSessionStore(), route = useRoute(), router = useRouter();
const narrow = ref(window.innerWidth < 720);
const resize = () => { narrow.value = window.innerWidth < 720; };
const province = computed(() => session.user?.accountLevel === 'PROVINCE');
const canGenerate = computed(() => session.user?.permissions.includes('analytics:report:generate'));
const canExport = computed(() => session.user?.permissions.includes('analytics:report:export'));
const pageTitle = computed(() => province.value ? '监管报告' : '统计报表');
const categories = computed(() => reportCategories.filter(item => !province.value || item.value !== 'ENTERPRISE'));
const options = reactive<{ organizations: { id: string; name: string }[]; enterprises: { id: string; name: string }[] }>({ organizations: [], enterprises: [] });
const optionsError = ref('');
const filters = reactive({ q: '', type: '', reportType: '', organizationId: '', dates: [] as string[] });
const page = ref(1), pageSize = ref(10), total = ref(0), items = ref<RegulatoryReport[]>([]);
const loading = ref(false), error = ref(''), listLoaded = ref(false);
const detail = ref<RegulatoryReport | null>(null), detailLoading = ref(false), detailError = ref('');
const previewId = computed(() => typeof route.query.reportId === 'string' ? route.query.reportId : '');
const downloads = reactive(new Set<string>());
let listRequest = 0, detailRequest = 0;
const hasFilters = computed(() => ['q', 'type', 'reportType', 'organizationId', 'generatedFrom', 'generatedTo'].some(key => Boolean(route.query[key])));
function readQuery() {
  for (const key of ['q', 'type', 'reportType', 'organizationId'] as const) filters[key] = typeof route.query[key] === 'string' ? route.query[key] as string : '';
  filters.dates = typeof route.query.generatedFrom === 'string' && typeof route.query.generatedTo === 'string' ? [route.query.generatedFrom, route.query.generatedTo] : [];
  page.value = Math.max(1, Math.floor(Number(route.query.page) || 1));
  pageSize.value = [10, 20, 50].includes(Number(route.query.pageSize)) ? Number(route.query.pageSize) : 10;
}
async function updateQuery(changes: LocationQueryRaw) { await router.replace({ path: route.path, query: { ...route.query, ...changes } }); }
async function load() {
  const request = ++listRequest; loading.value = true; error.value = '';
  const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize.value) });
  for (const key of ['q', 'type', 'reportType', 'organizationId', 'generatedFrom', 'generatedTo']) {
    const value = route.query[key]; if (typeof value === 'string' && value) params.set(key, value);
  }
  try {
    const result = await api<PageData<RegulatoryReport>>(`/analytics/reports?${params}`);
    if (request !== listRequest) return;
    items.value = result.items; total.value = result.total; listLoaded.value = true;
    if (!result.items.length && result.total && page.value > 1) await updateQuery({ page: 1 });
  } catch (reason) { if (request === listRequest) error.value = reportError(reason); }
  finally { if (request === listRequest) loading.value = false; }
}
async function loadOptions() {
  optionsError.value = '';
  try { Object.assign(options, await api('/analytics/reports/options')); }
  catch (reason) { optionsError.value = reportError(reason); }
}
async function search() {
  const query: LocationQueryRaw = { page: 1, pageSize: pageSize.value };
  for (const key of ['q', 'type', 'reportType', 'organizationId'] as const) if (filters[key].trim()) query[key] = filters[key].trim();
  if (filters.dates?.length === 2) { query.generatedFrom = filters.dates[0]; query.generatedTo = filters.dates[1]; }
  const before = route.fullPath; await router.replace({ path: route.path, query });
  if (route.fullPath === before) await load();
}
async function reset() { Object.assign(filters, { q: '', type: '', reportType: '', organizationId: '', dates: [] }); await search(); }
async function openReport(id: string) { await router.push({ path: route.path, query: { ...route.query, reportId: id } }); }
async function closePreview() { await updateQuery({ reportId: undefined }); }
async function loadDetail() {
  const id = previewId.value, request = ++detailRequest; detail.value = null; detailError.value = '';
  if (!id) { detailLoading.value = false; return; }
  detailLoading.value = true;
  try { const result = await api<RegulatoryReport>(`/analytics/reports/${encodeURIComponent(id)}`); if (request === detailRequest) detail.value = result; }
  catch (reason) { if (request === detailRequest) detailError.value = reportError(reason); }
  finally { if (request === detailRequest) detailLoading.value = false; }
}
async function download(row: RegulatoryReport) {
  if (downloads.has(row.id)) return; downloads.add(row.id);
  try {
    const file = await api<{ filename: string; mimeType: string; content: string }>(`/analytics/reports/${row.id}/export`);
    const url = URL.createObjectURL(new Blob([file.content], { type: file.mimeType }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.filename; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (reason) { ElMessage.error(`导出失败：${reportError(reason)}`); }
  finally { downloads.delete(row.id); }
}
const draftKey = `wrc-report-draft-${session.user?.id}`;
const createVisible = ref(false), saving = ref(false), createError = ref(''), formRef = ref<FormInstance>();
const form = reactive({ title: '', reportType: 'MONTHLY', category: 'COMPREHENSIVE', dates: [] as string[], enterpriseId: '' });
let suggestedTitle = '';
function calendarDay(date: Date) { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
function defaultPeriod() {
  const today = calendarDay(new Date()), end = new Date(`${today.slice(0, 7)}-01T00:00:00+08:00`);
  end.setTime(end.getTime() - 86400000); const lastDay = calendarDay(end); return [`${lastDay.slice(0, 7)}-01`, lastDay];
}
function showCreate() {
  if (!form.dates?.length) {
    const { from, to } = route.query;
    form.dates = typeof from === 'string' && typeof to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) ? [from, to] : defaultPeriod();
  }
  if (!form.title.trim()) suggestTitle();
  createError.value = ''; createVisible.value = true;
}
function suggestTitle() {
  if (form.title.trim() && form.title !== suggestedTitle) return;
  suggestedTitle = `${form.dates?.[0]?.slice(0, 7) ?? ''}${province.value ? '全省' : session.user?.workspace?.cityName ?? ''}无人快递车${reportLabel(form.category)}${reportLabel(form.reportType)}`;
  form.title = suggestedTitle;
}
const formRules: FormRules = {
  title: [{ required: true, whitespace: true, message: '请填写报告名称', trigger: 'blur' }],
  dates: [{ validator: (_rule, value: string[] | null, callback) => {
    if (!value || value.length !== 2) return callback(new Error('请选择统计周期'));
    if (value[0]! > value[1]!) return callback(new Error('开始日期不能晚于结束日期'));
    if (value[1]! > calendarDay(new Date())) return callback(new Error('统计结束日期不能晚于今天'));
    callback();
  }, trigger: 'change' }],
};
const includesToday = computed(() => form.dates?.[1] === calendarDay(new Date()));
async function create() {
  if (saving.value || !await formRef.value?.validate().catch(() => false)) return;
  saving.value = true; createError.value = '';
  try {
    const created = await api<RegulatoryReport>('/analytics/reports', { method: 'POST', body: JSON.stringify({
      title: form.title.trim(), reportType: form.reportType, category: form.category, periodStart: form.dates[0], periodEnd: form.dates[1],
      enterpriseId: !province.value ? form.enterpriseId || undefined : undefined,
    }) });
    createVisible.value = false; Object.assign(form, { title: '', reportType: 'MONTHLY', category: 'COMPREHENSIVE', dates: [], enterpriseId: '' });
    try { localStorage.removeItem(draftKey); } catch { /* The in-memory draft remains usable if storage is unavailable. */ }
    ElMessage.success('报告已生成，可核对内容后导出'); await openReport(created.id); void loadOptions();
  } catch (reason) { createError.value = reportError(reason); }
  finally { saving.value = false; }
}
watch(form, () => { try { if (form.title || form.dates?.length) localStorage.setItem(draftKey, JSON.stringify({ ...form, dates: form.dates ?? [] })); } catch { /* Storage is optional; keep current edits in memory. */ } }, { deep: true });
watch(() => [form.reportType, form.category, form.dates?.join(',')], () => { if (createVisible.value) suggestTitle(); });
watch(() => route.fullPath, () => { readQuery(); void loadDetail(); if (!previewId.value) void load(); });
onMounted(() => {
  window.addEventListener('resize', resize);
  readQuery(); void loadOptions();
  try { const draft = JSON.parse(localStorage.getItem(draftKey) ?? 'null'); if (draft && typeof draft.title === 'string' && Array.isArray(draft.dates) && draft.dates.every((value: unknown) => typeof value === 'string')) { Object.assign(form, draft); if (province.value && form.category === 'ENTERPRISE') form.category = 'COMPREHENSIVE'; } } catch { /* Ignore malformed drafts. */ }
  if (previewId.value) void loadDetail(); else void load();
});
onUnmounted(() => window.removeEventListener('resize', resize));
</script>

<template>
  <section class="report-page" :aria-label="pageTitle">
    <template v-if="!previewId">
      <h1 class="sr-only">{{ pageTitle }}</h1>
      <QueryPanel :loading="loading" @search="search" @reset="reset">
        <QueryField label="关键词" keyword><el-input v-model="filters.q" aria-label="关键词" placeholder="报告名称 / 编号" clearable /></QueryField>
        <QueryField label="报告分类"><el-select v-model="filters.type" aria-label="报告分类" placeholder="全部分类" clearable><el-option v-for="item in categories" :key="item.value" :label="item.label" :value="item.value" /></el-select></QueryField>
        <QueryField label="周期类型"><el-select v-model="filters.reportType" aria-label="周期类型" placeholder="全部周期" clearable><el-option v-for="item in reportPeriods" :key="item.value" :label="item.label" :value="item.value" /></el-select></QueryField>
        <QueryField label="生成单位"><el-select v-model="filters.organizationId" aria-label="生成单位" placeholder="全部单位" clearable filterable :disabled="!!optionsError"><el-option v-for="item in options.organizations" :key="item.id" :label="item.name" :value="item.id" /></el-select></QueryField>
        <QueryField label="生成日期" wide><el-date-picker v-model="filters.dates" aria-label="生成日期" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" /></QueryField>
      </QueryPanel>
      <div v-if="optionsError" class="report-inline-error" role="alert">生成单位选项加载失败：{{ optionsError }} <el-button link type="primary" @click="loadOptions">重试</el-button></div>
      <section class="report-library" aria-label="监管报告列表">
        <header class="report-list-header"><div><h2>{{ pageTitle }}列表</h2><span v-if="listLoaded && !error">共{{ total }}份报告</span></div><div class="report-list-actions"><el-button v-if="canGenerate" type="primary" :icon="FilePlus2" @click="showCreate">生成报告</el-button></div></header>
        <div v-if="error" class="report-state" role="alert"><strong>报告列表暂时无法加载</strong><p>{{ error }}</p><el-button :icon="RefreshCw" @click="load">重试</el-button></div>
        <div v-else-if="loading && !listLoaded" class="report-initial-loading" aria-live="polite"><el-skeleton :rows="7" animated /><span>正在加载报告列表…</span></div>
        <template v-else>
          <el-table v-loading="loading" :data="items" row-key="id" class="report-list-table" :aria-busy="loading">
            <el-table-column label="报告名称 / 编号" min-width="260"><template #default="{ row }"><div class="report-identity"><el-button link type="primary" @click="openReport(row.id)">{{ row.title }}</el-button><span>{{ row.businessNo }}</span></div></template></el-table-column>
            <el-table-column label="分类 / 周期" min-width="132"><template #default="{ row }">{{ reportLabel(row.category) }} · {{ reportLabel(row.reportType) }}</template></el-table-column>
            <el-table-column label="统计周期" width="150"><template #default="{ row }"><div class="report-two-lines"><span>{{ reportDay(row.periodStart) }}</span><span v-if="reportDay(row.periodStart) !== reportDay(row.periodEnd)">至 {{ reportDay(row.periodEnd) }}</span></div></template></el-table-column>
            <el-table-column label="生成单位" min-width="150" prop="organization.name" />
            <el-table-column label="生成时间" width="132"><template #default="{ row }"><div class="report-two-lines"><span>{{ reportTime(row.generatedAt).slice(0, 10) }}</span><span>{{ reportTime(row.generatedAt).slice(11) }}</span></div></template></el-table-column>
            <el-table-column label="操作" width="140" :fixed="narrow ? false : 'right'"><template #default="{ row }"><div class="report-row-actions"><el-button link type="primary" @click="openReport(row.id)">查看</el-button><el-button v-if="canExport" link type="primary" :loading="downloads.has(row.id)" @click="download(row)">导出 CSV</el-button></div></template></el-table-column>
            <template #empty><el-empty :description="hasFilters ? '没有符合条件的报告' : '还没有生成报告'" :image-size="60"><el-button v-if="hasFilters" @click="reset">清除筛选</el-button><span v-else>{{ canGenerate ? '选择“生成报告”创建首份统计快照' : '当前授权范围内暂无报告' }}</span></el-empty></template>
          </el-table>
          <div class="report-pagination"><span>共 {{ total }} 条</span><el-pagination :current-page="page" :page-size="pageSize" :total="total" :page-sizes="[10, 20, 50]" layout="sizes, prev, pager, next" @current-change="updateQuery({ page: $event })" @size-change="updateQuery({ page: 1, pageSize: $event })" /></div>
        </template>
        <p class="report-information"><Info :size="15" />报告保留生成时的数据快照，后续数据变化不覆盖已生成报告。</p>
      </section>
    </template>
    <template v-else>
      <div class="report-preview-toolbar"><div><el-button :icon="ArrowLeft" @click="closePreview">返回报告列表</el-button><h2>报告预览</h2></div><div v-if="detail"><el-button v-if="canExport" :icon="Download" :loading="downloads.has(detail.id)" @click="download(detail)">导出 CSV</el-button></div></div>
      <div v-if="detailError" class="report-state" role="alert"><h1>报告暂时无法加载</h1><p>{{ detailError }}</p><el-button @click="loadDetail">重试</el-button></div>
      <div v-else-if="detailLoading" class="report-initial-loading" aria-live="polite"><el-skeleton :rows="12" animated /><span>正在读取报告快照…</span></div>
      <ReportDocument v-else-if="detail" :key="detail.id" :report="detail" />
    </template>
    <el-dialog v-model="createVisible" title="生成监管报告" class="report-form-dialog" width="min(620px, calc(100vw - 24px))" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving">
      <el-form ref="formRef" :model="form" :rules="formRules" label-position="top" :disabled="saving" @submit.prevent="create">
        <el-form-item label="报告名称" prop="title"><el-input v-model="form.title" aria-label="报告名称" maxlength="200" placeholder="请输入报告名称" /></el-form-item>
        <div class="report-form-grid"><el-form-item label="周期类型"><el-select v-model="form.reportType" aria-label="生成周期类型"><el-option v-for="item in reportPeriods" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item><el-form-item label="报告分类"><el-select v-model="form.category" aria-label="生成报告分类"><el-option v-for="item in categories" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item></div>
        <el-form-item label="统计周期" prop="dates"><el-date-picker v-model="form.dates" aria-label="统计周期" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" :disabled-date="(date: Date) => calendarDay(date) > calendarDay(new Date())" /></el-form-item>
        <el-form-item v-if="!province" label="指定企业（可选）"><el-select v-model="form.enterpriseId" aria-label="指定企业" placeholder="全部授权企业" clearable filterable><el-option v-for="item in options.enterprises" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
        <p class="report-form-note">统计范围：{{ province ? '全省授权监管范围' : '当前授权监管范围' }}。生成后进入预览，核对内容后可导出。</p>
        <p v-if="includesToday" class="report-form-note">统计周期包含今天，报告仅汇总生成时已经入库的数据。</p>
        <p v-if="createError" class="report-inline-error" role="alert">{{ createError }}</p>
      </el-form>
      <template #footer><span class="report-draft-hint">填写内容自动保留</span><el-button :disabled="saving" @click="createVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="create">生成并预览</el-button></template>
    </el-dialog>
  </section>
</template>
