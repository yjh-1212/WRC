import type { BufferGeometry, Group, LineSegments, Vector3 } from 'three';
export interface GeoProjection { project(...coordinate: number[]): Vector3; unproject(x: number, z: number): number[]; uv(x: number, y: number): number[] }
export function loadGeo(code: string): Promise<any>;
export function createProjection(features: any[], size?: number): GeoProjection;
export function polygonParts(feature: any): number[][][][];
export function extrudeRegion(feature: any, projection: GeoProjection, depth: number, tolerance: number, textureProjection?: GeoProjection): BufferGeometry;
export function boundaryLines(features: any[], projection: GeoProjection, height: number, color: string, opacity?: number, tolerance?: number): LineSegments;
export function disposeGroup(group: Group, preserveTextures?: boolean): void;
