<script setup lang="ts">
import { onMounted, ref } from 'vue'; import { useSessionStore } from '../stores/session'; import { api } from '../api'; import PageHeader from '../components/PageHeader.vue'; import { Users, Building2, ShieldAlert, ScrollText, RefreshCw } from 'lucide-vue-next';
const session = useSessionStore(); const loading = ref(true); const error = ref(''); const data = ref<any>(null);
async function load() { loading.value = true; error.value=''; try { data.value = session.user?.portal === 'ENTERPRISE' ? await api('/enterprise/current') : await api('/regulatory/overview'); } catch(e){ error.value=e instanceof Error?e.message:'加载失败'; } finally{loading.value=false;} }
onMounted(load);
</script>
<template>
  <PageHeader :title="session.user?.portal === 'ENTERPRISE' ? '企业首页' : '监管总览'" description="Phase 1 系统底座运行状态与当前账号的数据权限视域。"><el-button :icon="RefreshCw" @click="load">刷新</el-button></PageHeader>
  <el-skeleton v-if="loading" :rows="5" animated />
  <div v-else-if="error" class="error-state"><strong>数据加载失败</strong><span>{{ error }}</span><el-button @click="load">重新加载</el-button></div>
  <template v-else-if="session.user?.portal === 'REGULATORY'">
    <div class="metric-strip"><div><Users/><span>平台用户</span><strong>{{ data.users }}</strong></div><div><Building2/><span>企业主体</span><strong>{{ data.enterprises }}</strong></div><div><ShieldAlert/><span>登录失败</span><strong>{{ data.loginFailures }}</strong></div><div><ScrollText/><span>审计动作</span><strong>{{ data.auditActions }}</strong></div></div>
    <section class="attention-panel"><div><h2>Phase 1 运行状态</h2><p>身份认证、数据库权限、动态菜单与审计链路已接通。</p></div><el-tag type="success" effect="plain">底座已就绪</el-tag></section>
  </template>
  <section v-else class="enterprise-profile"><div><span>当前企业</span><h2>{{ data.enterprise?.name }}</h2><p>{{ data.enterprise?.businessNo }} · {{ data.enterprise?.status === 'ACTIVE' ? '正常运营' : '已停用' }}</p></div><el-tag type="success" effect="plain">数据范围：仅本企业</el-tag></section>
</template>
