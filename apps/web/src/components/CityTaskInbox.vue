<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { errorText, dateText } from '../saas';
const router=useRouter(),rows=ref<any[]>([]),loading=ref(false),error=ref(''),total=ref(0);
async function load(){loading.value=true;error.value='';try{const r=await api<any>('/oversight/city-tasks?page=1&pageSize=5');rows.value=r.items;total.value=r.total}catch(e){error.value=errorText(e)}finally{loading.value=false}}
onMounted(load);
</script>
<template><section v-loading="loading" class="city-inbox"><header><div><h2>省级交办</h2><span>{{total}} 项事项</span></div><el-button text type="primary" @click="router.push('/oversight/city-tasks')">查看全部</el-button></header><div v-if="error" class="saas-error"><span>{{error}}</span><el-button @click="load">重试</el-button></div><el-empty v-else-if="!rows.length&&!loading" description="暂无省级交办事项" :image-size="46"/><button v-for="row in rows" :key="row.id" class="city-inbox-row" @click="router.push({path:'/oversight/city-tasks',query:{assignmentId:row.id}})"><span><strong>{{row.matter?.title??row.title}}</strong><small>办理期限 {{dateText(row.matter?.dueAt)}}</small></span><el-tag type="info">{{({WAITING:'待响应',PROCESSING:'办理中',SUBMITTED:'待复核',CLOSED:'已办结'} as any)[row.status]??row.status}}</el-tag></button></section></template>
<style scoped>.city-inbox{border:1px solid #e1e7ef;border-radius:8px;background:#fff;padding:16px 18px;margin-bottom:18px}.city-inbox header,.city-inbox header>div{display:flex;align-items:center;gap:12px}.city-inbox header{justify-content:space-between;margin-bottom:8px}.city-inbox h2{font-size:15px;margin:0}.city-inbox header span{font-size:12px;color:#667085}.city-inbox-row{display:flex;justify-content:space-between;gap:16px;align-items:center;width:100%;padding:12px 0;border:0;border-top:1px solid #edf0f4;background:#fff;text-align:left;cursor:pointer}.city-inbox-row strong{display:block;font-size:13px;font-weight:500}.city-inbox-row small{display:block;color:#667085;font-size:12px;margin-top:5px}</style>
