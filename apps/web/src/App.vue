<script setup lang="ts">
import { computed } from 'vue';
import { useSessionStore } from './stores/session';
import AgentEntry from './components/AgentEntry.vue';
const session = useSessionStore();
const assistantKey = computed(() => `${session.user?.id}:${session.user?.workspaceId}:${session.user?.enterpriseId}:${session.user?.authVersion}`);
</script>
<template><router-view /><AgentEntry v-if="session.user" :key="assistantKey" /></template>
