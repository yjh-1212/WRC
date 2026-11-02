/** Human-readable names for current and legacy vehicle safety event codes. */
export const safetyTypeLabels: Record<string, string> = {
  LOW_BATTERY: '电量不足',
  PERMIT_INVALID: '许可状态异常',
  OUT_OF_HOURS: '超许可时段运行',
  OBSTACLE_DETECTED: '检测到障碍物',
  EMERGENCY_STOP: '紧急停车',
  COMMUNICATION_LOSS: '通信中断',
  SPEEDING: '超速',
  OVERSPEED: '超速',
  GEOFENCE_EXIT: '驶出运营区域',
  OUT_OF_BOUNDS: '超出运营区域',
  NO_ENTRY: '进入禁行区域',
  OFFLINE: '车辆离线',
  VEHICLE_FAULT: '车辆故障',
  AUTONOMOUS_ABNORMAL: '自动驾驶异常',
  SYSTEM_ABNORMAL: '车载系统异常',
  DEVICE_ABNORMAL: '车载设备异常',
  SENSOR_ABNORMAL: '传感器异常',
  MANUAL_REPORT: '人工上报',
  ILLEGAL_STOP: '违规停车',
  ROUTE_DEVIATION: '偏离运营路线',
  FATIGUE_DRIVING: '疲劳驾驶',
  OVERLOAD: '超载',
  OVERTIME: '超时运行',
  OTHER: '其他风险',
};
export function safetyTypeText(value?: string | null) {
  if (!value) return '—';
  return safetyTypeLabels[value] ?? (/[\u3400-\u9fff]/.test(value) ? value : '其他异常');
}
const codes = new RegExp(`\\b(?:${Object.keys(safetyTypeLabels).filter(code => code !== 'OTHER').join('|')})\\b`, 'g');
export function safetyDisplayText(value: string) {
  return value.replace(codes, code => safetyTypeLabels[code]!)
    .replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b(?=\s*(?:告警|预警|违规))/g, '其他异常')
    .replace(/([\u3400-\u9fff])[\t ]+(告警|预警|违规)/g, '$1$2');
}
const displayFields = new Set(['title', 'description', 'reason', 'label']);
/** Localize display copy in parsed JSON, preserving IDs, type codes and URLs. */
export function localizeSafetyDisplayFields<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    value.forEach(item => localizeSafetyDisplayFields(item));
  } else {
    const record = value as Record<string, unknown>;
    for (const [key, item] of Object.entries(record)) {
      if (typeof item === 'string' && displayFields.has(key)) record[key] = safetyDisplayText(item);
      else if (item && typeof item === 'object') localizeSafetyDisplayFields(item);
    }
  }
  return value;
}
