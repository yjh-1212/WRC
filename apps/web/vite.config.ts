import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: [
    { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
  ] },
  server: { port: 5173, proxy: { '/api': { target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:8080', changeOrigin: true } } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          'vendor-element': ['element-plus', '@element-plus/icons-vue'],
          'vendor-map': ['@amap/amap-jsapi-loader'],
          'vendor-three': ['three'],
          'vendor-charts': ['echarts'],
          'vendor-motion': ['gsap'],
        },
      },
    },
  },
});
