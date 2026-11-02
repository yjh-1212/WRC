import * as Cesium from 'cesium';
import { GCJ02WebMercatorTilingScheme } from './providers/GCJ02WebMercatorTilingScheme.js';

const DARK_BASE = Cesium.Color.fromCssColorString('#06131d');
const AMAP_SUBDOMAINS = ['1', '2', '3', '4'];
const AMAP_ROAD = 'https://webrd0{s}.is.autonavi.com/appmaptile?style=7&lang=zh_cn&size=1&scale=1&x={x}&y={y}&z={z}';
const AMAP_SATELLITE = 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}';
const AMAP_LABEL = 'https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}';

export class BaseMapManager {
  constructor(viewer, { notify = () => {} } = {}) {
    this.viewer = viewer;
    this.notify = notify;
    this.current = 'amap-tech';
  }

  clear() {
    this.viewer.imageryLayers.removeAll(true);
    this.viewer.scene.globe.baseColor = DARK_BASE;
  }

  _addAmap(url, adjustments = {}) {
    const provider = new Cesium.UrlTemplateImageryProvider({
      url,
      subdomains: AMAP_SUBDOMAINS,
      tilingScheme: new GCJ02WebMercatorTilingScheme(),
      minimumLevel: 1,
      maximumLevel: 19,
      credit: '高德地图',
    });
    const layer = this.viewer.imageryLayers.addImageryProvider(provider);
    Object.assign(layer, adjustments);
    return layer;
  }

  async set(type) {
    this.clear();
    this.current = type;

    if (type === 'amap-tech') {
      this._addAmap(AMAP_ROAD, {
        brightness: 0.46,
        contrast: 1.28,
        saturation: 0.2,
        gamma: 0.82,
      });
      this.viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#04121b');
      this.notify('已切换高德科技暗色底图');
      return true;
    }

    if (type === 'amap-road') {
      this._addAmap(AMAP_ROAD, { brightness: 0.93, contrast: 1.04, saturation: 0.86 });
      this.notify('已切换高德道路底图');
      return true;
    }

    if (type === 'amap-satellite') {
      this._addAmap(AMAP_SATELLITE, { brightness: 0.78, contrast: 1.14, saturation: 0.82 });
      this._addAmap(AMAP_LABEL, { brightness: 0.9, contrast: 1.12, saturation: 0.72 });
      this.notify('已切换高德卫星影像 + 注记');
      return true;
    }

    if (type === 'osm') {
      const provider = new Cesium.UrlTemplateImageryProvider({
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        maximumLevel: 19,
        credit: '© OpenStreetMap contributors',
      });
      this.viewer.imageryLayers.addImageryProvider(provider);
      this.notify('已切换 OSM 底图');
      return true;
    }

    if (type === 'custom') {
      const url = import.meta.env.VITE_CUSTOM_XYZ_URL?.trim();
      if (!url) {
        this.current = 'amap-tech';
        await this.set('amap-tech');
        this.notify('未配置 VITE_CUSTOM_XYZ_URL，已回退高德科技底图', 'warn');
        return false;
      }
      const provider = new Cesium.UrlTemplateImageryProvider({
        url,
        maximumLevel: 22,
        credit: 'Configured XYZ provider',
      });
      this.viewer.imageryLayers.addImageryProvider(provider);
      this.notify('已切换自定义 XYZ 底图');
      return true;
    }

    this.current = 'amap-tech';
    await this.set('amap-tech');
    return false;
  }
}
