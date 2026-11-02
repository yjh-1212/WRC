export interface VehicleState { key: string; label: string; color: string }
export const VEHICLE_STATES: VehicleState[];
export function vehicleState(row?: { onlineStatus?: string; drivingState?: string }): VehicleState;
