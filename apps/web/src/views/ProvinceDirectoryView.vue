<script setup lang="ts">
import QueryPanel from '../components/QueryPanel.vue';
import QueryField from '../components/QueryField.vue';
import ListPanel from '../components/ListPanel.vue';
import {computed,onMounted,ref} from 'vue';import { Search } from 'lucide-vue-next';import {api} from '../api';import {errorText} from '../saas';import ProvincePageState from '../components/ProvincePageState.vue';import './ProvincePages.css';
const rows=ref<any[]>([]),loading=ref(false),error=ref(''),q=ref(''),level=ref(''),detail=ref<any>(null);const levels=computed(()=>[...new Set(rows.value.map(r=>r.level))]);const filtered=computed(()=>rows.value.filter(r=>(!level.value||r.level===level.value)&&(!q.value.trim()||[r.key,r.name,r.source,r.scope,...(r.fields??[]).map((f:any)=>typeof f==='string'?f:f.name??f.key)].join(' ').toLowerCase().includes(q.value.trim().toLowerCase()))));
async function load(){loading.value=true;error.value='';try{rows.value=(await api<any>('/oversight/directory')).items}catch(e){error.value=errorText(e)}finally{loading.value=false}}onMounted(load);

function resetQueryFilters() {
  q.value = '';
  level.value = '';
  load();
}
</script>
<template><section class="province-page"><h1 class="sr-only">数据接入与共享</h1><div class="province-state-note">目录展示平台当前可查询的数据、来源及授权范围。跨系统交换须完成相应接口接入和授权后使用。</div><QueryPanel :loading="loading" @search="load" @reset="resetQueryFilters">
<QueryField label="关键词" keyword><el-input aria-label="关键词" v-model="q" :prefix-icon="Search" clearable placeholder="搜索目录名称、字段或来源"/></QueryField>
<QueryField label="分类级别"><el-select aria-label="分类级别" v-model="level" clearable placeholder="全部分类级别"><el-option v-for="l in levels" :key="l" :value="l" :label="l"/></el-select></QueryField>
</QueryPanel>
<ListPanel title="数据目录列表" :total="error ? undefined : ((filtered ?? []).length)">
<ProvincePageState :error="error" :loading="loading" @retry="load"><el-table :data="filtered" empty-text="没有符合条件的数据目录"><el-table-column label="数据目录" min-width="190"><template #default="{row}"><div class="province-cell-title"><strong>{{row.name}}</strong><span>{{row.key}}</span></div></template></el-table-column><el-table-column label="数据来源" prop="source" min-width="220"/><el-table-column label="分类级别" prop="level" width="130"/><el-table-column label="更新要求" prop="updatePolicy" min-width="150"/><el-table-column label="共享范围" prop="scope" min-width="240"/><el-table-column label="操作" width="100"><template #default="{row}"><el-button link type="primary" @click="detail=row">查看字段</el-button></template></el-table-column></el-table></ProvincePageState>
</ListPanel>
<el-drawer class="province-drawer" :model-value="!!detail" :title="detail?.name??'数据目录'" size="570px" @close="detail=null"><template v-if="detail"><el-descriptions :column="1" border><el-descriptions-item label="目录编码">{{detail.key}}</el-descriptions-item><el-descriptions-item label="来源">{{detail.source}}</el-descriptions-item><el-descriptions-item label="分类级别">{{detail.level}}</el-descriptions-item><el-descriptions-item label="更新要求">{{detail.updatePolicy}}</el-descriptions-item><el-descriptions-item label="共享范围">{{detail.scope}}</el-descriptions-item></el-descriptions><div class="province-detail-block" style="margin-top:24px"><h3>可查询字段</h3><div class="province-field-tags"><el-tag v-for="(f,index) in detail.fields" :key="index" type="info">{{typeof f==='string'?f:f.name??f.key}}</el-tag></div></div></template></el-drawer></section></template>
