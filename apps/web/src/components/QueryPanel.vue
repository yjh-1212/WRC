<script setup lang="ts">
import { RotateCcw, Search } from 'lucide-vue-next';

defineProps<{ loading?: boolean }>();
defineEmits<{ search: []; reset: [] }>();
</script>

<template>
  <section class="query-panel" aria-label="查询条件">
    <form class="query-panel__form" @submit.prevent="$emit('search')">
      <slot />
      <div class="query-panel__actions">
        <el-button type="primary" native-type="submit" :icon="Search" :loading="loading" class="query-panel__search">查询</el-button>
        <el-button native-type="button" :icon="RotateCcw" @click="$emit('reset')">重置</el-button>
      </div>
    </form>
  </section>
</template>
