import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';
import './styles.css';
import './phase4.css';
import './phase5.css';
import './phase6.css';
import './dashboard.css';
import './cockpit.css';
import './query-layout.css';
import './dropdown-typography.css';
import App from './App.vue';
import router from './router';
import { preloadAMap } from './amap';

preloadAMap();
createApp(App).use(createPinia()).use(router).use(ElementPlus, { locale: zhCn }).mount('#app');
