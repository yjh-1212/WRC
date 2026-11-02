export type CoordinatePair = [number, number];
export function wgs84ToGcj02(lng: number, lat: number): CoordinatePair;
export function gcj02ToWgs84(lng: number, lat: number): CoordinatePair;
export function gcj02ToBd09(lng: number, lat: number): CoordinatePair;
export function bd09ToGcj02(lng: number, lat: number): CoordinatePair;
export function wgs84ToBd09(lng: number, lat: number): CoordinatePair;
export function bd09ToWgs84(lng: number, lat: number): CoordinatePair;
export const CoordinateService: Readonly<{
  wgs84ToGcj02: typeof wgs84ToGcj02;
  gcj02ToWgs84: typeof gcj02ToWgs84;
  gcj02ToBd09: typeof gcj02ToBd09;
  bd09ToGcj02: typeof bd09ToGcj02;
  wgs84ToBd09: typeof wgs84ToBd09;
  bd09ToWgs84: typeof bd09ToWgs84;
}>;
