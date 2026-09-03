<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { RefreshCw, Search } from 'lucide-vue-next';
import { api } from '../api';
import PageHeader from '../components/PageHeader.vue';
import { useSessionStore } from '../stores/session';
import type { PageData } from '../types';

const session=useSessionStore(),route=useRoute(),router=useRouter(),rows=ref<any[]>([]),total=ref(0),loading=ref(false),error=ref(''),q=ref(String(route.query.q??'')),status=ref(''),page=ref(1),pageSize=20;let timer:number|undefined;
const isEnterprise=computed(()=>session.user?.portal==='ENTERPRISE');
const date=(value?:string)=>value?value.slice(0,10):'—';
const days=(value:string)=>Math.ceil((new Date(value).getTime()-Date.now())/86400000);
const statusLabel=(value:string)=>({VALID:'有效',EXPIRING:'即将到期',EXPIRED:'已过期',SUSPENDED:'暂停',CANCELLED:'注销'} as any)[value]??value;
async function load(){loading.value=true;error.value='';try{const p=new URLSearchParams({page:String(page.value),pageSize:String(pageSize)});if(q.value)p.set('q',q.value);if(status.value)p.set('status',status.value);const data=await api<PageData<any>>(`/admission/licenses?${p}`);rows.value=data.items;total.value=data.total}catch(reason){error.value=reason instanceof Error?reason.message:'牌照列表加载失败'}finally{loading.value=false}}
watch([q,status],()=>{page.value=1;clearTimeout(timer);timer=window.setTimeout(load,180)});watch(page,load);onMounted(load);
</script>

<template>
  <PageHeader :title="isEnterprise?'牌照信息':'牌照管理'" :description="isEnterprise?'查看本企业车辆牌照、有效期与审批来源。':'统一查询发牌结果、车辆关联和有效期。'" :count="total"><el-button :icon="RefreshCw" @click="load">刷新</el-button><el-button v-if="isEnterprise" type="primary" @click="router.push('/enterprise/applications/renewals')">申请续期</el-button></PageHeader>
  <div class="table-toolbar"><el-input v-model="q" :prefix-icon="Search" clearable placeholder="搜索号牌、业务编号或车辆" aria-label="搜索牌照"/><el-select v-model="status" clearable placeholder="全部状态" aria-label="牌照状态"><el-option label="有效" value="VALID"/><el-option label="即将到期" value="EXPIRING"/><el-option label="已过期" value="EXPIRED"/><el-option label="暂停" value="SUSPENDED"/><el-option label="注销" value="CANCELLED"/></el-select></div>
  <div v-if="error" class="error-state"><strong>牌照信息暂时无法加载</strong><span>{{error}}</span><el-button @click="load">重试</el-button></div>
  <el-table v-else v-loading="loading" :data="rows" row-key="id" empty-text="暂无符合条件的牌照"><el-table-column label="牌照" min-width="210"><template #default="{row}"><div class="identity-cell"><strong>{{row.licenseNo}}</strong><span>{{row.businessNo}}</span></div></template></el-table-column><el-table-column label="关联车辆" min-width="180"><template #default="{row}"><strong>{{row.vehicle.name}}</strong><span class="cell-meta">{{row.vehicle.businessNo}}</span></template></el-table-column><el-table-column v-if="!isEnterprise" label="所属企业" min-width="190"><template #default="{row}">{{row.enterprise.name}}</template></el-table-column><el-table-column label="签发日期" width="112"><template #default="{row}">{{date(row.issuedAt)}}</template></el-table-column><el-table-column label="有效期至" width="145"><template #default="{row}"><span :class="{overdue:days(row.expiresAt)<0}">{{date(row.expiresAt)}}</span><span class="cell-meta" v-if="row.status==='VALID'">剩余 {{Math.max(days(row.expiresAt),0)}} 天</span></template></el-table-column><el-table-column label="审批来源" min-width="190"><template #default="{row}"><span v-if="row.approvalResults?.length">{{row.approvalResults[0].application.businessNo}}</span><span v-else class="cell-meta">历史牌照</span></template></el-table-column><el-table-column label="状态" width="90"><template #default="{row}"><el-tag size="small" effect="plain" :type="row.status==='VALID'?'success':'info'">{{statusLabel(row.status)}}</el-tag></template></el-table-column></el-table>
  <div class="pagination-row"><span>当前显示 {{rows.length}} / {{total}}</span><el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="prev, pager, next"/></div>
</template>
