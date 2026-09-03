<script setup lang="ts">
import { useRoute } from 'vue-router'; import { Construction } from 'lucide-vue-next'; import PageHeader from '../components/PageHeader.vue';
const route = useRoute();
</script>
<template><PageHeader :title="String(route.meta.title ?? '业务模块')" description="该模块已纳入权限与动态路由体系，将按需求阶段逐步完成业务闭环。" /><div class="empty-state"><Construction :size="28" /><strong>当前属于后续开发阶段</strong><span>Phase 1 仅交付系统底座，避免用空壳页面冒充业务完成度。</span></div></template>
