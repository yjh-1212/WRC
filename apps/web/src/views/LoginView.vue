<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowRight, Truck } from 'lucide-vue-next';
import { gsap } from 'gsap';
import { useSessionStore } from '../stores/session';

const session = useSessionStore(); const router = useRouter(); const route = useRoute();
const username = ref('admin'); const password = ref('Wrc@2026!'); const loading = ref(false); const error = ref('');
const root = ref<HTMLElement | null>(null);
let motion: ReturnType<typeof gsap.matchMedia> | undefined;

async function submit() {
  error.value = '';
  if (!username.value.trim()) { error.value = '请填写登录账号'; return; }
  if (!password.value) { error.value = '请填写密码'; return; }
  loading.value = true;
  try { await session.login(username.value.trim(), password.value); ElMessage.success('登录成功'); await router.replace(String(route.query.redirect ?? '/')); }
  catch (e) { error.value = e instanceof Error ? e.message : '登录失败，请重试'; }
  finally { loading.value = false; }
}
function fillAccount(name: string) { username.value = name; password.value = 'Wrc@2026!'; }

onMounted(() => {
  const scopeRoot = root.value;
  if (!scopeRoot) return;
  motion = gsap.matchMedia();
  motion.add('(prefers-reduced-motion: no-preference)', () => {
    const ctx = gsap.context(() => {
      gsap.from('.login-cover', { autoAlpha: 0, duration: 0.45, ease: 'power1.out', clearProps: 'all' });
      gsap.from('.login-slogan', { autoAlpha: 0, y: 10, duration: 0.34, delay: 0.06, ease: 'power2.out', clearProps: 'all' });
      gsap.from('.login-panel-inner', { autoAlpha: 0, y: 12, duration: 0.32, delay: 0.1, ease: 'power2.out', clearProps: 'all' });
    }, scopeRoot);
    return () => ctx.revert();
  }, scopeRoot);
});
onUnmounted(() => { motion?.revert(); });
</script>
<template>
  <main ref="root" class="login-shell">
    <img class="login-cover" src="/login/hero-scene.png" alt="" />
    <div class="login-veil" aria-hidden="true"></div>
    <h1 class="login-slogan">让每一次运输，都高效可控</h1>
    <section class="login-panel">
      <div class="login-panel-inner">
        <p class="login-kicker"><span class="login-kicker-mark" aria-hidden="true"><Truck :size="15" /></span>无人运输车监管平台</p>
        <form class="login-form" @submit.prevent="submit">
          <h2>登录</h2>
          <p>使用平台分配的账号进入对应工作门户。</p>
          <label for="username">账号</label>
          <el-input id="username" v-model="username" autocomplete="username" size="large" placeholder="请输入账号" />
          <label for="password">密码</label>
          <el-input id="password" v-model="password" type="password" show-password autocomplete="current-password" size="large" placeholder="请输入密码" @keyup.enter="submit" />
          <div v-if="error" class="form-error" role="alert">{{ error }}</div>
          <el-button native-type="submit" type="primary" size="large" :loading="loading">登录 <ArrowRight :size="16" /></el-button>
          <div class="account-shortcuts">
            <span>快速进入</span>
            <button type="button" @click="fillAccount('admin')">监管端 · admin</button>
            <button type="button" @click="fillAccount('ent_admin')">企业端 · ent_admin</button>
          </div>
        </form>
        <p class="login-footnote">登录行为将写入安全日志。请勿共享个人账号。</p>
      </div>
    </section>
  </main>
</template>
