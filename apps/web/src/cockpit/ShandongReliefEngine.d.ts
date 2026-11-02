import type { CockpitAppearance } from './province-appearance';
import type { ProvinceMapData } from './province-drill';
export interface ReliefAnchor { id: string; x: number; y: number; visible: boolean }
export class ShandongReliefEngine {
  constructor(host: HTMLElement, geo: any, atlas: any, callbacks?: { anchors?: (rows: ReliefAnchor[]) => void; hover?: (id: string) => void; select?: (value: { kind: string; id: string; raw: any }) => void; texture?: (state: string) => void; error?: (message: string) => void });
  apply(style?: CockpitAppearance): void;
  setData(data: ProvinceMapData): void;
  setLayer(name: string, visible: boolean): void;
  setPaused(paused: boolean): void;
  setActive(active: boolean): void;
  loadTexture(): Promise<void>;
  enter(): void;
  resize(): void;
  zoom(amount: number): void;
  reset(animated?: boolean): void;
  dispose(): void;
}
