<script setup lang="ts">
import { computed } from 'vue';
const props=withDefaults(defineProps<{modelValue:boolean;title:string;width?:string}>(),{width:'640px'});
const emit=defineEmits<{'update:modelValue':[value:boolean]}>();
const visible=computed({get:()=>props.modelValue,set:v=>emit('update:modelValue',v)});
</script>
<template><el-drawer v-model="visible" :title="title" :size="width" :modal="false" :lock-scroll="false" :z-index="1700" append-to-body class="ca-drawer" destroy-on-close><slot/><template v-if="$slots.footer" #footer><slot name="footer"/></template></el-drawer></template>
