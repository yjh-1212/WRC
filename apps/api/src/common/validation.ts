import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

const FIELD_LABELS: Record<string, string> = {
  username: '登录账号',
  password: '密码',
  oldPassword: '原密码',
  newPassword: '新密码',
  refreshToken: '刷新凭证',
  displayName: '显示姓名',
  email: '邮箱',
  phone: '手机号',
  portal: '所属门户',
  organizationId: '组织机构',
  enterpriseId: '所属企业',
  roleIds: '角色',
  permissionIds: '权限',
  status: '状态',
  q: '搜索关键字',
  page: '页码',
  pageSize: '每页条数',
  sort: '排序字段',
  order: '排序方向',
  code: '编码',
  name: '名称',
  description: '说明',
  parentId: '上级机构',
  businessNo: '业务编号',
  creditCode: '统一社会信用代码',
  type: '类型',
  shortName: '简称',
  contactName: '联系人',
  contactPhone: '联系电话',
  address: '地址',
  modelCode: '型号代码',
  manufacturerId: '所属厂商',
  vehicleType: '车辆类型',
  autonomyLevel: '自动驾驶等级',
  maxSpeed: '最高车速',
  ratedRange: '额定续航',
  loadCapacity: '核定载重',
  dimensions: '外形尺寸',
  vin: 'VIN',
  deviceNo: '设备号',
  modelId: '车型',
  color: '颜色',
  manufactureDate: '出厂日期',
  serviceStartDate: '投入运营日期',
  licenseNo: '牌照号',
  vehicleId: '车辆',
  issuedAt: '签发日期',
  expiresAt: '到期日期',
  remark: '备注',
  legalRepresentative: '法定代表人',
  registeredAddress: '注册地址',
  qualificationType: '资质类型',
  certificateNo: '证书编号',
  issuedBy: '签发单位',
  attachmentUrl: '附件',
  applicationType: '申请类型',
  title: '标题',
  enterpriseNameSnapshot: '企业名称',
  creditCodeSnapshot: '统一社会信用代码',
  operationPlan: '运营方案',
  qualificationSummary: '资质说明',
  roadTestStartAt: '路测开始时间',
  roadTestEndAt: '路测结束时间',
  roadTestRoute: '路测路线',
  testPlan: '测试方案',
  safetyMeasures: '安全保障措施',
  vehicleIds: '关联车辆',
  targetLicenseId: '目标牌照',
  requestedExpiresAt: '申请到期日',
  renewalReason: '换发原因',
  action: '操作',
  comment: '处理意见',
  nodeCode: '节点编码',
  orderNo: '节点顺序',
  approvalRoleCode: '审批角色',
  timeLimitHours: '时限（小时）',
  countersignMode: '会签方式',
  canReturn: '是否可退回',
  version: '版本号',
  nodes: '流程节点',
  regionType: '区域类型',
  approvalResultId: '审批结果',
  polygon: '围栏坐标',
  longitude: '经度',
  latitude: '纬度',
  validFrom: '生效日期',
  validTo: '失效日期',
  approvalStatus: '审批状态',
  speedLimit: '限速值',
  allowedHours: '允许时段',
  ruleDescription: '规则说明',
  operationRecordId: '运行记录',
  speed: '速度',
  battery: '电量',
  heading: '航向',
  drivingState: '行驶状态',
  autonomousState: '自动驾驶状态',
  signalStrength: '信号强度',
  mileageToday: '当日里程',
  recordedAt: '记录时间',
  pointType: '轨迹点类型',
  from: '开始日期',
  to: '结束日期',
  recordId: '记录编号',
  regionId: '运行区域',
  alertType: '告警类型',
  level: '风险等级',
  occurredAt: '发生时间',
  fenceType: '围栏类型',
  active: '启用状态',
  accidentType: '事故类型',
  casualties: '伤亡人数',
  damageDescription: '损失说明',
  violationType: '违规类型',
  alertId: '关联告警',
  accidentId: '关联事故',
  requirement: '处置要求',
  assigneeUserId: '责任人',
  responseMode: '处置方式',
  dueAt: '处置时限',
  score: '评分',
  periodType: '周期类型',
  periodStart: '周期开始日期',
  periodEnd: '周期结束日期',
  weight: '权重',
  minValue: '最低值',
  maxValue: '最高值',
  label: '规则名称',
  windowMinutes: '时间窗口',
  conclusion: '结论',
  recommendation: '建议',
  primaryCause: '主要原因',
  contributingFactor: '促成因素',
  reason: '理由',
  evidence: '证据说明',
  reportType: '报表类型',
  category: '报表分类',
  recipient: '分发对象',
};

const UNIQUE_FIELD_LABELS: Record<string, string> = {
  username: '登录账号',
  email: '邮箱',
  code: '编码',
  businessNo: '业务编号',
  creditCode: '统一社会信用代码',
  name: '名称',
  vin: 'VIN',
  deviceNo: '设备号',
  modelCode: '型号代码',
  licenseNo: '牌照号',
  certificateNo: '证书编号',
  archiveNo: '档案号',
  documentNo: '文书号',
  vehicleId: '车辆',
  alertId: '告警',
  accidentId: '事故',
  applicationId: '申请',
};

function fieldLabel(property: string) {
  return FIELD_LABELS[property] ?? property;
}

function labelForConstraint(field: string, labels: Record<string, string>) {
  if (labels[field]) return labels[field];
  const matched = Object.keys(labels)
    .sort((a, b) => b.length - a.length)
    .find((key) => field.endsWith(`_${key}`) || field.endsWith(`.${key}`) || field.includes(`_${key}_`));
  return matched ? labels[matched] : undefined;
}

function isBlank(value: unknown) {
  return value === undefined || value === null || value === '' || (typeof value === 'number' && Number.isNaN(value));
}

function translateConstraint(property: string, key: string, original: string, value: unknown) {
  const label = fieldLabel(property);
  if (isBlank(value) && ['isString', 'isInt', 'isNumber', 'isDateString', 'isIso8601', 'isIn', 'isNotEmpty', 'isDefined', 'isBoolean', 'isArray'].includes(key)) {
    return `${label}不能为空`;
  }
  switch (key) {
    case 'isNotEmpty':
    case 'isDefined':
      return `${label}不能为空`;
    case 'isString':
      return `${label}须为文本`;
    case 'isEmail':
      return `${label}格式不正确`;
    case 'isInt':
      return `${label}须为整数`;
    case 'isNumber':
      return `${label}须为数字`;
    case 'isBoolean':
      return `${label}须为是或否`;
    case 'isArray':
      return `${label}须为列表`;
    case 'isDateString':
    case 'isIso8601':
      return `${label}日期格式不正确`;
    case 'isIn':
      return `${label}取值无效`;
    case 'minLength':
      return `${label}长度不足`;
    case 'maxLength':
      return `${label}超出最大长度`;
    case 'length':
      return `${label}长度不符合要求`;
    case 'min':
      return `${label}数值过小`;
    case 'max':
      return `${label}数值过大`;
    case 'arrayMinSize':
      return `${label}至少选择或填写一项`;
    case 'arrayMaxSize':
      return `${label}数量超出限制`;
    case 'whitelistValidation':
      return `存在不允许提交的字段：${label}`;
    default:
      return original?.includes(property) ? `${label}填写不正确` : (original || `${label}填写不正确`);
  }
}

export function flattenValidationMessages(errors: ValidationError[], parent?: string): string[] {
  return errors.flatMap((error) => {
    const property = parent ? `${parent}.${error.property}` : error.property;
    const leaf = property.split('.').pop() ?? property;
    const current = error.constraints
      ? Object.entries(error.constraints).map(([key, message]) => translateConstraint(leaf, key, message, error.value))
      : [];
    const nested = error.children?.length ? flattenValidationMessages(error.children, property) : [];
    return [...current, ...nested];
  });
}

export function validationExceptionFactory(errors: ValidationError[]) {
  const messages = [...new Set(flattenValidationMessages(errors))];
  return new BadRequestException(messages.join('；') || '请检查并完整填写表单信息');
}

export function uniqueConflictMessage(target: unknown) {
  const fields = Array.isArray(target)
    ? target.filter((item): item is string => typeof item === 'string')
    : typeof target === 'string'
      ? [target]
      : [];
  const labels = [...new Set(fields.map((field) => labelForConstraint(field, UNIQUE_FIELD_LABELS)).filter((item): item is string => Boolean(item)))];
  return labels.length ? `${labels.join('、')}已存在，请更换后重试` : '该记录已存在，请勿重复提交';
}

export function foreignKeyMessage(field: unknown) {
  const raw = typeof field === 'string' ? field : '';
  const label = labelForConstraint(raw, FIELD_LABELS);
  return label ? `所选${label}不存在或已被删除` : '关联数据不存在或已被删除，请检查所选企业、车辆或组织';
}
