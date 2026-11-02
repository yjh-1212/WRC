<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from 'lucide-vue-next';
import { gsap } from 'gsap';
import { useSessionStore } from '../stores/session';

const session = useSessionStore(); const router = useRouter(); const route = useRoute();
const presetPassword = 'Wrc@2026!';
const username = ref('admin'); const password = ref(presetPassword); const loading = ref(false); const error = ref('');
const accountShortcuts = [
  { label: '市级监测账号', username: 'jinan_admin' },
  { label: '市级企业端账号', username: 'ent_admin' },
];
const passwordVisible = ref(false);
const root = ref<HTMLElement | null>(null);
let motion: ReturnType<typeof gsap.matchMedia> | undefined;

function fillAccount(account: string) {
  if (loading.value) return;
  username.value = account;
  password.value = presetPassword;
  passwordVisible.value = false;
  error.value = '';
}

async function submit() {
  if (loading.value) return;
  error.value = '';
  if (!username.value.trim()) { error.value = '请填写登录账号'; return; }
  if (!password.value) { error.value = '请填写密码'; return; }
  loading.value = true;
  try { await session.login(username.value.trim(), password.value); ElMessage.success('登录成功'); await router.replace(String(route.query.redirect ?? '/')); }
  catch (e) { error.value = e instanceof Error ? e.message : '登录失败，请重试'; }
  finally { loading.value = false; }
}

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
        <form class="login-form" aria-label="登录" @submit.prevent="submit">
          <div class="login-field">
            <label for="username">账号</label>
            <el-input id="username" v-model="username" autocomplete="username" size="large" placeholder="请输入账号">
              <template #prefix><UserRound :size="20" :stroke-width="1.5" aria-hidden="true" /></template>
            </el-input>
          </div>
          <div class="login-field">
            <label for="password">密码</label>
            <el-input id="password" v-model="password" :type="passwordVisible ? 'text' : 'password'" autocomplete="current-password" size="large" placeholder="请输入密码">
              <template #prefix><LockKeyhole :size="20" :stroke-width="1.5" aria-hidden="true" /></template>
              <template #suffix>
                <button class="password-toggle" type="button" :aria-label="passwordVisible ? '隐藏密码' : '显示密码'" :aria-pressed="passwordVisible" aria-controls="password" @click="passwordVisible = !passwordVisible">
                  <component :is="passwordVisible ? Eye : EyeOff" :size="20" :stroke-width="1.5" aria-hidden="true" />
                </button>
              </template>
            </el-input>
          </div>
          <div class="login-account-shortcuts" role="group" aria-label="快捷填入登录账号">
            <el-button v-for="account in accountShortcuts" :key="account.username" native-type="button" :disabled="loading" @click="fillAccount(account.username)">{{ account.label }}</el-button>
          </div>
          <div v-if="error" class="login-error" role="alert">{{ error }}</div>
          <el-button class="login-submit" native-type="submit" type="primary" size="large" :loading="loading">登录 <ArrowRight :size="18" :stroke-width="1.8" aria-hidden="true" /></el-button>
        </form>
        <p class="login-footnote"><ShieldCheck :size="18" :stroke-width="1.5" aria-hidden="true" /><span>登录行为将写入安全日志。请勿共享个人账号。</span></p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.login-shell {
  --login-night: #071018;
  --login-text: #eef4fc;
  --login-label: #d3dce9;
  --login-muted: #a5b3c6;
  --login-ice: #b8d5ee;
  --login-input: rgba(8, 20, 36, .64);
  --login-outline: rgba(185, 209, 235, .24);
  position: relative;
  min-height: 100vh;
  min-height: 100svh;
  overflow: hidden;
  background: var(--login-night);
  color: var(--login-text);
  color-scheme: dark;
}
.login-cover {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 28% 50%;
}
.login-veil {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(90deg, transparent 36%, rgba(7, 16, 24, .12) 58%, rgba(7, 16, 24, .26)), linear-gradient(180deg, rgba(7, 16, 24, .1), transparent 32%, rgba(7, 16, 24, .18));
}
.login-slogan {
  position: absolute;
  z-index: 2;
  left: 6.5vw;
  top: 32%;
  margin: 0;
  color: #fff;
  font-size: clamp(28px, 3.1vw, 44px);
  font-weight: 700;
  letter-spacing: .02em;
  line-height: 1.2;
  white-space: nowrap;
  text-shadow: 0 10px 28px rgba(0, 0, 0, .45);
  pointer-events: none;
}
.login-panel {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  min-height: 100svh;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 48px 4vw;
}
.login-panel-inner {
  width: clamp(400px, 29.2vw, 560px);
  padding: 48px 36px 40px;
  border: 1px solid var(--login-outline);
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(19, 36, 57, .82), rgba(10, 21, 37, .88) 60%, rgba(25, 36, 54, .82));
  box-shadow: inset 0 1px 0 rgba(224, 239, 255, .16), 0 24px 64px rgba(0, 0, 0, .24);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
}
.login-form { width: 100%; }
.login-field + .login-field { margin-top: 24px; }
.login-field label {
  display: block;
  margin: 0 0 8px;
  color: var(--login-label);
  font-size: 14px;
  font-weight: 400;
  line-height: 20px;
}
.login-field :deep(.el-input) {
  --el-input-text-color: var(--login-text);
  --el-input-placeholder-color: var(--login-muted);
  --el-input-icon-color: var(--login-muted);
  --el-input-border-color: var(--login-outline);
  --el-input-hover-border-color: rgba(185, 209, 235, .45);
  --el-input-focus-border-color: var(--login-ice);
  --el-input-bg-color: var(--login-input);
  font-size: 16px;
}
.login-field :deep(.el-input__wrapper) {
  min-height: 52px;
  padding: 0 16px;
  border-radius: 8px;
  background: var(--login-input);
  box-shadow: 0 0 0 1px var(--login-outline) inset;
  transition: box-shadow .18s ease-out, background-color .18s ease-out;
}
.login-field :deep(.el-input__wrapper:hover) { box-shadow: 0 0 0 1px rgba(185, 209, 235, .45) inset; }
.login-field :deep(.el-input__wrapper.is-focus) { box-shadow: 0 0 0 1px var(--login-ice) inset, 0 0 0 3px rgba(184, 213, 238, .12); }
.login-field :deep(.el-input__prefix) { margin-right: 12px; }
.login-field :deep(.el-input__prefix-inner > :last-child) { margin-right: 0; }
.login-field :deep(.el-input__inner) { height: 52px; }
.login-field :deep(.el-input__inner:focus-visible) { outline: none; }
.login-field :deep(.el-input__inner:-webkit-autofill) {
  -webkit-text-fill-color: var(--login-text);
  -webkit-box-shadow: 0 0 0 100px #0f1e31 inset;
  caret-color: var(--login-text);
}
.password-toggle {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-right: -12px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  color: var(--login-muted);
  background: transparent;
  cursor: pointer;
}
.password-toggle:hover { color: var(--login-text); background: rgba(184, 213, 238, .08); }
.password-toggle:active { background: rgba(184, 213, 238, .14); }
.password-toggle:focus-visible, .login-submit:focus-visible { outline: 2px solid var(--login-ice); outline-offset: 4px; }
.login-account-shortcuts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }
.login-account-shortcuts .el-button {
  --el-button-bg-color: rgba(184, 213, 238, .06);
  --el-button-border-color: var(--login-outline);
  --el-button-text-color: var(--login-label);
  --el-button-hover-bg-color: rgba(184, 213, 238, .12);
  --el-button-hover-border-color: rgba(185, 209, 235, .55);
  --el-button-hover-text-color: var(--login-text);
  --el-button-active-bg-color: rgba(184, 213, 238, .18);
  --el-button-active-border-color: var(--login-ice);
  --el-button-active-text-color: var(--login-text);
  width: 100%; height: 40px; margin: 0; padding: 0 8px; border-radius: 7px; font-family: inherit; font-size: 13px; font-weight: 400;
}
.login-account-shortcuts .el-button:focus-visible { outline: 2px solid var(--login-ice); outline-offset: 3px; }
.login-form .login-submit {
  --el-button-bg-color: var(--login-ice);
  --el-button-border-color: var(--login-ice);
  --el-button-text-color: #0b1b2e;
  --el-button-hover-bg-color: #cee5f8;
  --el-button-hover-border-color: #cee5f8;
  --el-button-hover-text-color: #0b1b2e;
  --el-button-active-bg-color: #a4c5e2;
  --el-button-active-border-color: #a4c5e2;
  --el-button-active-text-color: #0b1b2e;
  --el-button-disabled-bg-color: #819bb3;
  --el-button-disabled-border-color: #819bb3;
  --el-button-disabled-text-color: #12253b;
  width: 100%;
  height: 52px;
  margin-top: 24px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  transition: background-color .18s ease-out, border-color .18s ease-out;
}
.login-submit :deep(> span) { display: inline-flex; align-items: center; gap: 12px; }
.login-submit :deep(.el-icon.is-loading) { margin-right: 8px; }
.login-footnote {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 24px 0 0;
  color: var(--login-muted);
  font-size: 12px;
  line-height: 20px;
  text-wrap: pretty;
}
.login-footnote > svg { flex-shrink: 0; margin-top: 1px; color: var(--login-label); }
.login-error {
  margin-top: 20px;
  padding: 10px 12px;
  border: 1px solid rgba(253, 164, 175, .28);
  border-radius: 8px;
  color: #fecdd3;
  background: rgba(127, 29, 50, .24);
  font-size: 13px;
  line-height: 20px;
}
@media (min-width: 1920px) {
  .login-panel-inner { padding: 56px 48px 48px; }
}
@media (max-width: 1120px) {
  .login-cover { object-position: 12% 40%; }
  .login-slogan { left: 24px; right: 24px; top: 12%; font-size: clamp(20px, 3.6vw, 32px); white-space: normal; text-wrap: balance; }
  .login-panel { justify-content: center; align-items: flex-end; padding: 160px 20px 32px; }
  .login-panel-inner { width: min(448px, 100%); padding: 36px 28px 28px; }
  .login-veil { background: linear-gradient(180deg, rgba(7, 16, 24, .1) 12%, rgba(7, 16, 24, .42)); }
}
@media (max-width: 380px) {
  .login-panel { padding-inline: 16px; }
  .login-panel-inner { padding: 32px 24px 24px; }
}
@media (max-height: 560px) {
  .login-slogan { top: 32px; }
  .login-panel { padding-top: 112px; }
}
@media (prefers-reduced-motion: reduce) {
  .login-field :deep(.el-input__wrapper), .login-form .login-submit { transition: none; }
}
</style>
