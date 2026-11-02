export const VEHICLE_STATES = [
  { key: 'running', label: '运行中', color: '#34d399' },
  { key: 'idle', label: '待机', color: '#60a5fa' },
  { key: 'parked', label: '已停驶', color: '#fbbf24' },
  { key: 'offline', label: '已离线', color: '#a8b4c7' },
  { key: 'unknown', label: '状态未知', color: '#c4a5f5' },
];
export function vehicleState(row = {}) {
  if (row.onlineStatus === 'OFFLINE' || row.drivingState === 'OFFLINE') return VEHICLE_STATES[3];
  if (row.onlineStatus !== 'ONLINE') return VEHICLE_STATES[4];
  if (row.drivingState === 'RUNNING') return VEHICLE_STATES[0];
  if (row.drivingState === 'IDLE') return VEHICLE_STATES[1];
  if (row.drivingState === 'PARKED') return VEHICLE_STATES[2];
  return VEHICLE_STATES[4];
}
