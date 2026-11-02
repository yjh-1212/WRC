<script setup lang="ts">
import SaasPublicFrame from '../components/SaasPublicFrame.vue';
</script>

<template>
  <SaasPublicFrame narrow>
    <h1>地市平台开通</h1>
    <p class="intro">地市通过线下提交开通申请。省级管理员核对后，在城市管理中直接开通平台并分配管理员账号。</p>
    <el-alert title="已获得管理员账号的，请通过统一入口登录。" type="info" :closable="false" />
    <router-link to="/login"><el-button type="primary" class="return-login">前往登录</el-button></router-link>
  </SaasPublicFrame>
</template>

<style scoped>
.return-login { margin-top: 24px; }
</style>
