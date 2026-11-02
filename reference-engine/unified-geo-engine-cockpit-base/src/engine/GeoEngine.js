import * as Cesium from 'cesium';
import { BaseMapManager } from './BaseMapManager.js';
import { LayerManager } from './LayerManager.js';
import { RegionService } from './RegionService.js';
import { SceneNavigator } from './SceneNavigator.js';
import { addPulseMarker } from './effects/PulseMarker.js';
import { addFlowRoute } from './effects/FlowRoute.js';
import { addGeoJsonBoundary } from './effects/RegionBoundary.js';
import { addHeatSpot, addScanMarker, addValueColumn } from './effects/VisualizationEffects.js';

const CYAN = Cesium.Color.fromCssColorString('#35dfff');
const ORANGE = Cesium.Color.fromCssColorString('#ffab38');

export class GeoEngine {
  constructor({ container, creditContainer, notify = () => {} }) {
    if (!container) throw new TypeError('GeoEngine requires a container');
    this.notify = notify;
    this.cursorListeners = new Set();
    this.cameraListeners = new Set();
    this.selectionListeners = new Set();
    this.selectedObject = null;
    this.boundaryRequestId = 0;

    this.viewer = new Cesium.Viewer(container, {
      timeline: false,
      animation: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      vrButton: false,
      selectionIndicator: false,
      infoBox: false,
      baseLayer: false,
      creditContainer: creditContainer ?? undefined,
      msaaSamples: 4,
      contextOptions: { webgl: { preserveDrawingBuffer: true } },
    });

    this._configureScene();
    this.layers = new LayerManager(this.viewer);
    this.basemaps = new BaseMapManager(this.viewer, { notify });
    this.regions = new RegionService({ notify });
    this.navigator = new SceneNavigator(this.viewer);
    this._installCursorProbe();
    this._installCameraProbe();
  }

  _configureScene() {
    const { scene } = this.viewer;
    this.viewer.targetFrameRate = 60;
    scene.backgroundColor = Cesium.Color.fromCssColorString('#02070c');
    scene.globe.show = true;
    scene.globe.baseColor = Cesium.Color.fromCssColorString('#07141d');
    scene.globe.enableLighting = true;
    scene.globe.dynamicAtmosphereLighting = true;
    scene.globe.depthTestAgainstTerrain = false;
    scene.skyAtmosphere.show = true;
    scene.skyAtmosphere.atmosphereLightIntensity = 14;
    scene.skyAtmosphere.saturationShift = -0.18;
    scene.skyAtmosphere.brightnessShift = -0.14;
    scene.fog.enabled = true;
    scene.fog.density = 0.00016;
    scene.highDynamicRange = true;
    scene.postProcessStages.fxaa.enabled = true;
    scene.screenSpaceCameraController.minimumZoomDistance = 35;
    scene.screenSpaceCameraController.maximumZoomDistance = 35_000_000;
    scene.screenSpaceCameraController.enableCollisionDetection = true;
    this.viewer.imageryLayers.removeAll(true);
  }

  _installCursorProbe() {
    this.pointerHandler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
    this.pointerHandler.setInputAction((movement) => {
      const cartesian = this.viewer.camera.pickEllipsoid(
        movement.endPosition,
        this.viewer.scene.globe.ellipsoid,
      );
      if (!cartesian) return;
      const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
      const payload = {
        lng: Cesium.Math.toDegrees(cartographic.longitude),
        lat: Cesium.Math.toDegrees(cartographic.latitude),
      };
      for (const listener of this.cursorListeners) listener(payload);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    this.pointerHandler.setInputAction((click) => {
      const picked = this.viewer.scene.pick(click.position);
      const entity = picked?.id instanceof Cesium.Entity ? picked.id : null;
      const objects = this.layers.getSource('objects').entities;
      this.selectedObject = entity && objects.contains(entity) ? entity : null;
      for (const listener of this.selectionListeners) listener(this.selectedObject);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  _installCameraProbe() {
    let last = 0;
    this.cameraProbe = () => {
      const now = performance.now();
      if (now - last < 240) return;
      last = now;
      const cartographic = this.viewer.camera.positionCartographic;
      const payload = {
        height: cartographic?.height ?? 0,
        heading: this.viewer.camera.heading,
        pitch: this.viewer.camera.pitch,
        mode: this.viewer.scene.mode,
      };
      for (const listener of this.cameraListeners) listener(payload);
    };
    this.viewer.scene.postRender.addEventListener(this.cameraProbe);
  }

  onCursorPosition(listener) {
    this.cursorListeners.add(listener);
    return () => this.cursorListeners.delete(listener);
  }

  onCameraStatus(listener) {
    this.cameraListeners.add(listener);
    return () => this.cameraListeners.delete(listener);
  }

  onSelection(listener) {
    this.selectionListeners.add(listener);
    return () => this.selectionListeners.delete(listener);
  }

  async setBasemap(type) {
    return this.basemaps.set(type);
  }

  flyTo({ center, height = 100000, heading = 0, pitch = -45, roll = 0, duration = 2 } = {}) {
    if (!Array.isArray(center) || center.length < 2) return false;
    this.navigator.stopOrbit();
    this.clearTracking();
    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(center[0], center[1], height),
      orientation: {
        heading: Cesium.Math.toRadians(heading),
        pitch: Cesium.Math.toRadians(pitch),
        roll: Cesium.Math.toRadians(roll),
      },
      duration,
    });
    return true;
  }

  async navigateTo(region, options = {}) {
    await this.navigator.navigate(region, options);
    await this._refreshRegionVisual(region);
    return region;
  }

  async _refreshRegionVisual(region) {
    const requestId = ++this.boundaryRequestId;
    const adminSource = this.layers.getSource('admin');
    adminSource.entities.removeAll();
    if (!region || region.level === 'global') return;

    this._addFocusRing(adminSource, region);
    if (!this.regions.hasBoundaryProvider() || !region.adcode) return;

    try {
      const geojson = await this.regions.loadBoundary(region);
      if (requestId !== this.boundaryRequestId || !geojson) return;
      addGeoJsonBoundary({
        source: adminSource,
        geojson,
        id: `boundary-${region.adcode}`,
        color: CYAN,
      });
    } catch (error) {
      if (requestId !== this.boundaryRequestId) return;
      this.notify(`行政区边界加载失败：${error.message}`, 'warn');
    }
  }

  _addFocusRing(source, region) {
    const [lng, lat] = region.center;
    const radius = region.level === 'country'
      ? 360_000
      : region.level === 'province'
        ? 95_000
        : 18_000;
    const center = Cesium.Cartesian3.fromDegrees(lng, lat, 0);

    // Use Cesium's frame time for both axes. Date.now() can differ by a few
    // milliseconds between the two property evaluations and make the minor axis
    // momentarily larger than the major axis, which stops Cesium rendering.
    const epoch = Cesium.JulianDate.now();
    const getPhase = (time) => {
      const t = time ?? Cesium.JulianDate.now();
      const seconds = Cesium.JulianDate.secondsDifference(t, epoch);
      return ((seconds / 2.2) % 1 + 1) % 1;
    };
    const ringRadius = new Cesium.CallbackProperty((time) => {
      const phase = getPhase(time);
      return radius * (0.8 + phase * 0.75);
    }, false);

    source.entities.add({
      id: 'region-focus-ring-a',
      position: center,
      ellipse: {
        semiMajorAxis: ringRadius,
        semiMinorAxis: ringRadius,
        material: new Cesium.ColorMaterialProperty(
          new Cesium.CallbackProperty((time) => {
            const phase = getPhase(time);
            return CYAN.withAlpha(0.15 * (1 - phase));
          }, false),
        ),
      },
    });

    source.entities.add({
      id: 'region-focus-core',
      position: center,
      point: {
        pixelSize: 12,
        color: ORANGE,
        outlineColor: CYAN,
        outlineWidth: 4,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }

  addMarker({ id, name, position, radius, label = true }) {
    addPulseMarker({
      nodeSource: this.layers.getSource('nodes'),
      labelSource: this.layers.getSource('labels'),
      id,
      name,
      position,
      radius,
      label,
    });
  }

  addRoute({ id, coordinates, color = CYAN, width, speed }) {
    return addFlowRoute({
      source: this.layers.getSource('routes'),
      id,
      coordinates,
      color,
      width,
      speed,
    });
  }


  addHeatSpot(options) {
    return addHeatSpot({ source: this.layers.getSource('heat'), ...options });
  }

  addValueColumn(options) {
    return addValueColumn({ source: this.layers.getSource('columns'), ...options });
  }

  addScanMarker(options) {
    return addScanMarker({ source: this.layers.getSource('scans'), ...options });
  }

  addObject({
    id,
    name = id,
    position,
    heading = 0,
    modelUrl = null,
    scale = 1,
    label = true,
  }) {
    if (!id || !Array.isArray(position)) throw new TypeError('Object id and position are required');
    const [lng, lat, height = 0] = position;
    const cartesian = Cesium.Cartesian3.fromDegrees(lng, lat, height);
    const hpr = new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(heading), 0, 0);
    const orientation = Cesium.Transforms.headingPitchRollQuaternion(cartesian, hpr);
    const source = this.layers.getSource('objects');
    const existing = source.entities.getById(id);
    if (existing) source.entities.remove(existing);

    return source.entities.add({
      id,
      name,
      position: cartesian,
      orientation,
      model: modelUrl
        ? {
            uri: modelUrl,
            scale,
            minimumPixelSize: 28,
            maximumScale: 240,
            runAnimations: true,
          }
        : undefined,
      point: modelUrl
        ? undefined
        : {
            pixelSize: 11,
            color: CYAN,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
      label: label
        ? {
            text: name,
            font: '500 13px Microsoft YaHei, sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 4,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -28),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          }
        : undefined,
    });
  }

  updateObject(id, { position, heading = 0 } = {}) {
    const entity = this.layers.getSource('objects').entities.getById(id);
    if (!entity) return null;
    if (Array.isArray(position)) {
      const [lng, lat, height = 0] = position;
      const cartesian = Cesium.Cartesian3.fromDegrees(lng, lat, height);
      entity.position = cartesian;
      entity.orientation = Cesium.Transforms.headingPitchRollQuaternion(
        cartesian,
        new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(heading), 0, 0),
      );
    }
    return entity;
  }

  trackObject(id) {
    const entity = this.layers.getSource('objects').entities.getById(id);
    if (!entity) return false;
    this.navigator.stopOrbit();
    this.viewer.trackedEntity = entity;
    return true;
  }

  clearTracking() {
    this.viewer.trackedEntity = undefined;
  }

  trackSelected() {
    if (!this.selectedObject) return false;
    this.navigator.stopOrbit();
    this.viewer.trackedEntity = this.selectedObject;
    return true;
  }

  clearSelection() {
    this.selectedObject = null;
    for (const listener of this.selectionListeners) listener(null);
  }

  removeObject(id) {
    const source = this.layers.getSource('objects');
    const entity = source.entities.getById(id);
    if (!entity) return false;
    if (this.viewer.trackedEntity === entity) this.clearTracking();
    return source.entities.remove(entity);
  }

  clearLayer(id) {
    this.layers.clear(id);
  }

  setLayerVisible(id, visible) {
    this.layers.setVisible(id, visible);
  }

  destroy() {
    this.pointerHandler?.destroy();
    if (this.cameraProbe) this.viewer.scene.postRender.removeEventListener(this.cameraProbe);
    this.navigator.destroy();
    this.layers.destroy();
    this.cursorListeners.clear();
    this.cameraListeners.clear();
    this.selectionListeners.clear();
    if (!this.viewer.isDestroyed()) this.viewer.destroy();
  }
}
