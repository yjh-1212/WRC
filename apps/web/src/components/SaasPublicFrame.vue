<script setup lang="ts">
import { Building2 } from 'lucide-vue-next';
import '../saas.css';
defineProps<{ narrow?: boolean }>();
</script>
<template><main class="saas-public"><header class="saas-public-top"><div class="saas-public-brand"><Building2 :size="23"/>山东省无人快递车监管平台</div><router-link to="/login">返回登录</router-link></header><section class="saas-public-card" :class="{narrow}"><slot/></section></main></template>
