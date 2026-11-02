import type { CockpitLevel, SceneSelection, VehicleType } from './types';

export type CockpitMode = 'overview' | 'ranking' | 'risks' | 'vehicles' | 'quality';
export type DashboardMapState = {
  level: CockpitLevel;
  sceneMode: CockpitMode;
  vehicleType: VehicleType;
  metric: string;
  selected: SceneSelection | null;
  hoveredAdcode: string;
};
export type SceneMemory = { regionCode: string; vehicleType: VehicleType; tab: CockpitMode; selectedCode: string; metric: string; camera?: Record<string, number> };

const defaults: Record<CockpitLevel, SceneMemory> = {
  national: { regionCode: '100000', vehicleType: 'ALL', tab: 'overview', selectedCode: '', metric: 'registeredVehicles' },
  province: { regionCode: '370000', vehicleType: 'ALL', tab: 'overview', selectedCode: '', metric: 'registeredVehicles' },
  city: { regionCode: '370100', vehicleType: 'ALL', tab: 'overview', selectedCode: '', metric: 'registeredVehicles' },
};

export class CockpitSceneState {
  private memory = structuredClone(defaults);
  get(level: CockpitLevel) { return this.memory[level]; }
  remember(level: CockpitLevel, patch: Partial<SceneMemory>) { Object.assign(this.memory[level], patch); }
  reset() { this.memory = structuredClone(defaults); }
}
