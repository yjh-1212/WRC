export interface ShandongCityGeometry { code: string; name: string; polygons: number[][][][] }
export interface ShandongGeometry { cities: ShandongCityGeometry[]; mask: number[][][][]; bounds: [[number, number], [number, number]] }
let pending: Promise<ShandongGeometry> | undefined;
/** Public reference geometry is shared by every scope; failed reads remain retryable. */
export function loadShandongGeometry() {
  pending ??= fetch('/map/threemap/geojson/370000.json').then(async response => {
    if (!response.ok) throw new Error('山东省行政区边界读取失败，请重试');
    const geo = await response.json();
    const cities = geo.features.map((feature: any) => ({ code: String(feature.properties.adcode), name: feature.properties.name, polygons: feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [feature.geometry.coordinates] })) as ShandongCityGeometry[];
    const mask = cities.flatMap(city => city.polygons), points = mask.flat(2);
    const bounds: ShandongGeometry['bounds'] = [[Math.min(...points.map(point => point[0]!)), Math.min(...points.map(point => point[1]!))], [Math.max(...points.map(point => point[0]!)), Math.max(...points.map(point => point[1]!))]];
    return { cities, mask, bounds };
  }).catch(reason => { pending = undefined; throw reason; });
  return pending;
}

/** Mask off neighboring provinces without forcing a zoom that hides Shandong. */
export function restrictToShandong(map: any, geometry: ShandongGeometry) {
  map.setMask(geometry.mask); map.setLabelRejectMask(false);
  const [[west, south], [east, north]] = geometry.bounds;
  let correcting = false;
  const constrain = () => {
    if (correcting) return;
    const center = map.getCenter(), lng = center.getLng(), lat = center.getLat();
    const bounded = [Math.max(west, Math.min(east, lng)), Math.max(south, Math.min(north, lat))];
    if (Math.abs(bounded[0]! - lng) > .00001 || Math.abs(bounded[1]! - lat) > .00001) { correcting = true; map.setCenter(bounded, true); correcting = false; }
  };
  map.on('moveend', constrain);
  return () => map.off('moveend', constrain);
}

/** Fit the projected outline, including pitch/rotation and panel gutters. */
export function fitShandongView(map: any, geometry: ShandongGeometry, panel: number, zoomOffset = 0) {
  const host = map.getContainer(), small = host.clientWidth < 1100;
  const left = small ? 35 : panel + 45, right = small ? 35 : panel + 45, top = 150, bottom = 100;
  const available = [Math.max(300, host.clientWidth - left - right), Math.max(250, host.clientHeight - top - bottom)];
  const target = [left + available[0]! / 2, top + available[1]! / 2];
  const points = geometry.mask.flat(2).filter((_, index) => index % 4 === 0);
  const [[west, south], [east, north]] = geometry.bounds;
  map.setZoomAndCenter(7, [(west + east) / 2, (south + north) / 2], true);
  const screenBounds = () => { const pixels = points.map(point => map.lngLatToContainer(point)); return [Math.min(...pixels.map(p => p.x)), Math.min(...pixels.map(p => p.y)), Math.max(...pixels.map(p => p.x)), Math.max(...pixels.map(p => p.y))]; };
  for (let step = 0; step < 4; step++) {
    let [x1, y1, x2, y2] = screenBounds();
    const factor = Math.min(available[0]! / (x2! - x1!), available[1]! / (y2! - y1!));
    map.setZoom(Math.max(6, Math.min(10, map.getZoom() + Math.log2(factor))), true);
    [x1, y1, x2, y2] = screenBounds();
    const center = map.containerToLngLat([host.clientWidth / 2 + (x1! + x2!) / 2 - target[0]!, host.clientHeight / 2 + (y1! + y2!) / 2 - target[1]!]);
    map.setCenter(center, true);
  }
  if (zoomOffset) map.setZoom(map.getZoom() + zoomOffset, true);
}
