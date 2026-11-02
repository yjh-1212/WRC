import * as Cesium from 'cesium';

export class SceneNavigator {
  constructor(viewer) {
    this.viewer = viewer;
    this.currentRegion = null;
    this.listeners = new Set();
    this.orbitDisposer = null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(region, state) {
    for (const listener of this.listeners) listener(region, state);
  }

  async navigate(region, { duration = 2.2 } = {}) {
    if (!region?.center) throw new TypeError('Region camera preset is required');
    this.stopOrbit();
    this.currentRegion = region;
    this.emit(region, 'start');
    const [lng, lat] = region.center;
    const destination = Cesium.Cartesian3.fromDegrees(lng, lat, region.height ?? 1_000_000);

    return new Promise((resolve) => {
      this.viewer.camera.flyTo({
        destination,
        orientation: {
          heading: Cesium.Math.toRadians(region.heading ?? 0),
          pitch: Cesium.Math.toRadians(region.pitch ?? -65),
          roll: 0,
        },
        duration,
        easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
        complete: () => {
          this.emit(region, 'complete');
          resolve(region);
        },
        cancel: () => resolve(region),
      });
    });
  }

  overview() {
    if (!this.currentRegion) return;
    return this.navigate(this.currentRegion, { duration: 1.2 });
  }

  topDown() {
    const region = this.currentRegion;
    if (!region) return;
    this.stopOrbit();
    const [lng, lat] = region.center;
    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lng, lat, region.height ?? 1_000_000),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-90),
        roll: 0,
      },
      duration: 1.1,
    });
  }

  resetNorth() {
    this.stopOrbit();
    this.viewer.camera.setView({
      destination: this.viewer.camera.positionWC,
      orientation: {
        heading: 0,
        pitch: this.viewer.camera.pitch,
        roll: 0,
      },
    });
  }

  nudge(action) {
    const camera = this.viewer.camera;
    const scene = this.viewer.scene;
    const height = camera.positionCartographic?.height ?? 100_000;
    const zoomStep = Math.max(80, height * 0.22);

    switch (action) {
      case 'left':
        camera.rotateLeft(Cesium.Math.toRadians(8));
        break;
      case 'right':
        camera.rotateRight(Cesium.Math.toRadians(8));
        break;
      case 'tilt-up':
        if (scene.mode === Cesium.SceneMode.SCENE3D) camera.lookUp(Cesium.Math.toRadians(5));
        break;
      case 'tilt-down':
        if (scene.mode === Cesium.SceneMode.SCENE3D) camera.lookDown(Cesium.Math.toRadians(5));
        break;
      case 'zoom-in':
        camera.zoomIn(zoomStep);
        break;
      case 'zoom-out':
        camera.zoomOut(zoomStep);
        break;
      default:
        break;
    }
  }

  startOrbit() {
    if (this.orbitDisposer || !this.currentRegion) return false;
    const [lng, lat] = this.currentRegion.center;
    const target = Cesium.Cartesian3.fromDegrees(lng, lat, 0);
    const range = Math.max(7_500, (this.currentRegion.height ?? 400_000) * 0.62);
    let heading = this.viewer.camera.heading;
    const pitch = Cesium.Math.toRadians(-38);

    const tick = () => {
      heading += 0.00135;
      this.viewer.camera.lookAt(target, new Cesium.HeadingPitchRange(heading, pitch, range));
    };
    this.viewer.scene.preRender.addEventListener(tick);
    this.orbitDisposer = () => {
      this.viewer.scene.preRender.removeEventListener(tick);
      this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      this.orbitDisposer = null;
    };
    return true;
  }

  stopOrbit() {
    if (!this.orbitDisposer) return false;
    this.orbitDisposer();
    return true;
  }

  toggleOrbit() {
    if (this.orbitDisposer) {
      this.stopOrbit();
      return false;
    }
    return this.startOrbit();
  }

  toggleSceneMode() {
    this.stopOrbit();
    if (this.viewer.scene.mode === Cesium.SceneMode.SCENE2D) {
      this.viewer.scene.morphTo3D(0.9);
      return '3D';
    }
    this.viewer.scene.morphTo2D(0.9);
    return '2D';
  }

  destroy() {
    this.stopOrbit();
    this.listeners.clear();
  }
}
