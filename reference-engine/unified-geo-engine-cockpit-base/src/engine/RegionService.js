import { fetchDistrictBoundary } from './AMapService.js';

export class RegionService {
  constructor({ notify = () => {} } = {}) {
    this.notify = notify;
    this.cache = new Map();
  }

  hasBoundaryProvider() {
    return Boolean(import.meta.env.VITE_AMAP_KEY?.trim() && import.meta.env.VITE_AMAP_SECURITY_CODE?.trim());
  }

  async loadBoundary(region) {
    if (!region?.adcode) return null;
    const key = `${region.level}:${region.adcode}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const boundary = await fetchDistrictBoundary({ adcode: region.adcode, level: region.level });
    const geojson = {
      type: 'FeatureCollection',
      features: boundary.rings.map((ring, index) => ({
        type: 'Feature',
        properties: { name: boundary.name, adcode: boundary.adcode, part: index },
        geometry: { type: 'Polygon', coordinates: [ring] },
      })),
    };
    this.cache.set(key, geojson);
    return geojson;
  }
}
