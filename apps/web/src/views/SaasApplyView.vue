<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { newApplication, validateApplication, post, errorText, uploadMaterial, validateMaterials, type SaasCatalog } from '../saas';
import SaasPublicFrame from '../components/SaasPublicFrame.vue';
import SaasApplicationFields from '../components/SaasApplicationFields.vue';
const files=ref<File[]>([]);
function chooseFiles(event:Event){const input=event.target as HTMLInputElement;const chosen=Array.from(input.files??[]);const validation=validateMaterials(chosen);if(validation){error.value=validation;input.value='';files.value=[]}else{files.value=chosen;error.value=''}}
const router=useRouter(); const form=reactive(newApplication()); const catalog=ref<SaasCatalog>({cities:[],modules:[]}); const loading=ref(false);const saving=ref(false);const error=ref('');
async function load(){loading.value=true;error.value='';try{catalog.value=await api('/saas/catalog')}catch(e){error.value=errorText(e)}finally{loading.value=false}}
async function submit(){const validation=validateApplication(form);if(validation){error.value=validation;return}saving.value=true;error.value='';try{const result=await post('/saas/applications',form);sessionStorage.setItem('saas-application-tracking',JSON.stringify({businessNo:result.application.businessNo,trackingSecret:result.trackingSecret}));for(const file of files.value){try{await uploadMaterial(result.application.id,result.trackingSecret,file)}catch(uploadError){sessionStorage.setItem('saas-material-upload-error',errorText(uploadError));break}}await router.push('/application-status')}catch(e){error.value=errorText(e)}finally{saving.value=false}}
onMounted(load);
</script>
<template><SaasPublicFrame><h1>市级平台开通申请</h1><p class="intro">提交单位与管理员信息，经省级核验后开通本市工作空间。</p><div class="saas-steps"><span>提交申请</span><span>省级审核</span><span>平台开通</span><span>管理员激活</span></div><div v-if="error" class="saas-error" role="alert"><span>{{error}}</span><el-button v-if="!catalog.cities.length" @click="load">重新加载</el-button></div><el-form v-loading="loading" label-position="top" @submit.prevent="submit"><SaasApplicationFields :form="form" :catalog="catalog"/><el-form-item label="授权材料附件"><input type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" multiple aria-label="授权材料附件" @change="chooseFiles"/><p class="saas-subtle">支持PDF、PNG、JPG，最多3份，每份不超过2MB。提交申请后上传，进度页可补充材料。</p><p v-if="files.length" class="saas-subtle">已选择：{{files.map(file=>file.name).join('、')}}</p></el-form-item><footer class="saas-public-footer"><router-link to="/application-status">查询已提交的申请</router-link><el-button native-type="submit" type="primary" :loading="saving" :disabled="loading||!catalog.cities.length">提交开通申请</el-button></footer></el-form></SaasPublicFrame></template>
