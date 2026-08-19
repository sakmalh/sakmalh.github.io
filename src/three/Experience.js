import {
  ACESFilmicToneMapping,
  Clock,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { CameraRig } from './CameraRig.js';
import { Stage } from './Stage.js';
import { World } from './world/World.js';
import { FpsWatchdog, TIERS, TIER_ORDER } from './quality.js';
import { getScrollState, setStationOffsets, refreshScrollLimits } from '../ui/scroll.js';

/** How far ahead of the camera the ambient field sits, in world units. */
const FIELD_DISTANCE = 46;
/** Peak cursor parallax and bank, reached only mid-flight. */
const PARALLAX = 2.2;
const BANK = 0.05;

export class Experience {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{tier: string, settings: object, onFallback?: Function}} options
   */
  constructor(canvas, { tier, settings, onFallback, stageContainer }) {
    this.canvas = canvas;
    this.tier = tier;
    this.settings = settings;
    this.onFallback = onFallback;
    this.running = false;
    this.visible = true;

    this.size = { width: window.innerWidth, height: window.innerHeight };
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, settings.dprCap);

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: settings.antialias,
      alpha: true,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.setSize(this.size.width, this.size.height, false);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setClearColor(0x080b0a, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    // Reset the render stats manually once per frame so they stay meaningful
    // and comparable (the tests assert on them).
    this.renderer.info.autoReset = false;

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(52, this.size.width / this.size.height, 0.1, 200);
    this.scene.add(this.camera);

    this.rig = new CameraRig(this.camera);

    // Dock the page's real DOM into the world, then measure it. The CSS3D
    // renderer only moves elements into its container on first render, so
    // that render has to happen before anything can be measured.
    this.stage = new Stage({ camera: this.camera, container: stageContainer });
    this.stage.attachTo(this.scene);
    this.stage.setSize(this.size.width, this.size.height);
    this.stage.render(this.camera);
    this.stage.layout();
    this.#reframe();

    this.world = new World({
      scene: this.scene,
      settings,
      pixelRatio: this.pixelRatio,
      stations: this.stage.stations,
    });

    this.clock = new Clock();
    this.pointer = new Vector2(0, 0);
    this.pointerTarget = new Vector2(0, 0);
    this.raycaster = new Raycaster();
    this.plane = new Plane(new Vector3(0, 0, 1), 0);
    this.cursorWorld = new Vector3();
    this.hasCursor = false;
    this._forward = new Vector3();
    this._fieldCenter = new Vector3();
    this._right = new Vector3();
    this._up = new Vector3();

    this.watchdog = new FpsWatchdog({ onDowngrade: (fps) => this.#downgrade(fps) });

    this.#bindEvents();
    this.start();
  }

  #bindEvents() {
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);

    this._onPointerMove = (e) => {
      this.pointerTarget.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -((e.clientY / window.innerHeight) * 2 - 1)
      );
      this.hasCursor = true;
    };
    window.addEventListener('pointermove', this._onPointerMove, { passive: true });

    this._onVisibility = () => {
      document.hidden ? this.stop() : this.start();
    };
    document.addEventListener('visibilitychange', this._onVisibility);

    // The canvas is fixed behind the page, so it is effectively always on
    // screen — but if it ever isn't, stop paying for it.
    this._observer = new IntersectionObserver(
      ([entry]) => {
        this.visible = entry.isIntersecting;
        this.visible && !document.hidden ? this.start() : this.stop();
      },
      { threshold: 0 }
    );
    this._observer.observe(this.canvas);

    this._onContextLost = (e) => {
      e.preventDefault();
      this.stop();
      console.warn('[3d] WebGL context lost — switching to fallback backdrop');
      this.onFallback?.();
    };
    this.canvas.addEventListener('webglcontextlost', this._onContextLost);
  }

  /** Step down a quality tier, or bail out to the 2D backdrop entirely. */
  #downgrade(fps) {
    const currentIndex = TIER_ORDER.indexOf(this.tier);
    const next = TIER_ORDER[currentIndex + 1];

    if (!next) {
      console.warn(`[3d] ${fps.toFixed(0)}fps on the lowest tier — falling back to 2D`);
      this.destroy();
      this.onFallback?.();
      return;
    }

    console.info(`[3d] ${fps.toFixed(0)}fps — downgrading ${this.tier} → ${next}`);
    this.tier = next;
    this.settings = TIERS[next];

    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.settings.dprCap);
    this.renderer.setPixelRatio(this.pixelRatio);

    this.world.setPixelRatio(this.pixelRatio);
    this.world.rebuild(this.settings);

    this.watchdog.rearm();
    document.documentElement.dataset.quality = next;
  }

  /**
   * Recompute where the camera stands at each station and re-aim the panels.
   * Panel widths are fixed in pixels so their layout never reflows, but the
   * framing distance depends on the live aspect ratio.
   */
  #reframe() {
    // Dock poses depend on viewport height (via the 1:1 distance) and on the
    // measured panel layout, so this reruns whenever either changes.
    const poses = this.stage.stations.map((station) =>
      this.stage.dockPose(station, this.camera)
    );
    this.rig.build(poses);
    this.stage.orientToDock(poses);
    this.dockPoses = poses;

    // The scroll track length is derived from the journey, not hardcoded: a
    // station that has to pan earns proportionally more scroll.
    const track = document.getElementById('scroll-track');
    if (track) track.style.height = `${(this.rig.total * 100).toFixed(2)}vh`;

    // Anchors and the station rail need to know where each station now sits.
    setStationOffsets(this.stage.stations.map((_, i) => this.rig.stationProgress(i)));

    // The track just changed length; the scroll layer has to re-read its limit
    // on the next frame, once the browser has applied the new height.
    requestAnimationFrame(() => refreshScrollLimits());
  }

  resize() {
    this.size.width = window.innerWidth;
    this.size.height = window.innerHeight;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.settings.dprCap);

    this.camera.aspect = this.size.width / this.size.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.size.width, this.size.height, false);
    this.stage.setSize(this.size.width, this.size.height);
    // At 1:1 a station's fit is purely its pixel size against the viewport, so
    // a resize genuinely re-lays out the panels rather than just re-aiming.
    this.stage.layout();
    this.world.setPixelRatio(this.pixelRatio);
    this.#reframe();
  }

  #frame = () => {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this.#frame);

    const delta = Math.min(this.clock.getDelta(), 0.1); // clamp tab-switch spikes
    const elapsed = this.clock.elapsedTime;

    this.renderer.info.reset();

    this.watchdog.tick(delta);

    // Frame-rate independent smoothing.
    const lerpFactor = 1 - Math.pow(0.001, delta);

    this.pointer.lerp(this.pointerTarget, lerpFactor);

    if (this.hasCursor) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      if (!this.raycaster.ray.intersectPlane(this.plane, this.cursorWorld)) {
        this.hasCursor = false;
      }
    }

    const scroll = getScrollState();
    const journey = this.rig.update(scroll.progress);

    // Cursor parallax and bank, scaled by `transit` — which is exactly 0 at a
    // dock. Nothing moves the camera while you are reading; all of the motion
    // lives in the flight between stations.
    if (journey.transit > 0.001) {
      this._right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
      this._up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
      const amount = journey.transit;
      this.camera.position
        .addScaledVector(this._right, this.pointer.x * PARALLAX * amount)
        .addScaledVector(this._up, this.pointer.y * PARALLAX * amount);
      this.camera.rotateZ(this.pointer.x * BANK * amount);
    }

    // Park the travelling field well past the dock plane, along the direction
    // the camera is actually facing.
    this._forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this._fieldCenter.copy(this.camera.position).addScaledVector(this._forward, FIELD_DISTANCE);

    this.world.update({
      elapsed,
      delta,
      journey,
      velocity: scroll.velocity,
      fieldCenter: this._fieldCenter,
      transit: journey.transit,
      cursorWorld: this.hasCursor ? this.cursorWorld : null,
    });

    this.stage.update(this.camera.position, journey.index);
    this.renderer.render(this.scene, this.camera);
    this.stage.render(this.camera);
  };

  start() {
    if (this.running || !this.visible) return;
    this.running = true;
    this.clock.getDelta(); // discard the gap accumulated while paused
    this._raf = requestAnimationFrame(this.#frame);
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('pointermove', this._onPointerMove);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.canvas.removeEventListener('webglcontextlost', this._onContextLost);
    this._observer?.disconnect();

    this.world.dispose();
    this.renderer.dispose();
    // Hand every panel element back to the document before the caller
    // rebuilds the page as a plain scrolling document.
    this.stage.restore();
  }
}
