import * as Cesium from 'cesium';
import { gcj02ToWgs84, wgs84ToGcj02 } from '../CoordinateService.js';

/**
 * Adapts WGS84 Cesium business coordinates to GCJ-02 raster imagery.
 * Use only with a legally authorized GCJ-02 XYZ tile endpoint.
 */
export class GCJ02WebMercatorTilingScheme extends Cesium.WebMercatorTilingScheme {
  constructor(options = {}) {
    super(options);
    const mercator = new Cesium.WebMercatorProjection(this.ellipsoid);
    const projectedScratch = new Cesium.Cartographic();
    const unprojectedScratch = new Cesium.Cartographic();

    this._projection = {
      ellipsoid: this.ellipsoid,
      project(cartographic, result) {
        const lng = Cesium.Math.toDegrees(cartographic.longitude);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);
        const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat);
        projectedScratch.longitude = Cesium.Math.toRadians(gcjLng);
        projectedScratch.latitude = Cesium.Math.toRadians(gcjLat);
        projectedScratch.height = cartographic.height;
        return mercator.project(projectedScratch, result);
      },
      unproject(cartesian, result) {
        const gcj = mercator.unproject(cartesian, unprojectedScratch);
        const [wgsLng, wgsLat] = gcj02ToWgs84(
          Cesium.Math.toDegrees(gcj.longitude),
          Cesium.Math.toDegrees(gcj.latitude),
        );
        const target = result ?? new Cesium.Cartographic();
        target.longitude = Cesium.Math.toRadians(wgsLng);
        target.latitude = Cesium.Math.toRadians(wgsLat);
        target.height = gcj.height;
        return target;
      },
    };
  }
}
