import { Box3, Group, Matrix4, Quaternion, Vector3 } from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { PANEL_SCALE, STATIONS } from './world/layout.js';

const FADE_NEAR = 40;  // fully opaque within this distance
const FADE_FAR = 82;   // fully faded beyond it — tight enough that the next
                       // station's panels don't ghost over the one you're in

const UP = new Vector3(0, 1, 0);

/** How much of the viewport a station may span, and the cap on huge screens. */
const CONTENT_FRACTION = 0.9;
const MAX_CONTENT_PX = 1560;
const MIN_PANEL_PX = 260;
const MIN_FIT_FACTOR = 0.45;
/** Below this compression the grid collapses to one column instead. */
const STACK_THRESHOLD = 0.62;
/** Leave a little air top and bottom before deciding a station must pan. */
const VIEWPORT_MARGIN = 0.94;

/**
 * Docks the page's real DOM into the 3D world.
 *
 * CSS3DRenderer transforms live elements in 3D space, which keeps the content
 * selectable, linkable, screen-reader navigable and crawlable — the site is a
 * resume first. Elements are moved out of document flow into the CSS3D
 * container and can be put back (see restore) if the 3D layer has to bail.
 */
export class Stage {
  constructor({ camera, container }) {
    this.camera = camera;
    this.group = new Group();
    this.panels = [];
    this.stations = [];

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.renderer = new CSS3DRenderer();
    this.renderer.domElement.className = 'css3d-layer';
    container.appendChild(this.renderer.domElement);

    this.#mount();
  }

  #mount() {
    for (const station of STATIONS) {
      const origin = new Vector3().fromArray(station.position);
      // Orientation depends only on `view`, so it is known before any layout
      // and can be used to build the plane the panels are laid out in.
      const dir = new Vector3().fromArray(station.view).normalize();
      const dockQuaternion = new Quaternion().setFromRotationMatrix(
        new Matrix4().lookAt(dir, new Vector3(0, 0, 0), UP)
      );
      const entry = {
        ...station,
        origin,
        dockQuaternion,
        panels: [],
        center: origin.clone(),
        radius: 12,
      };

      for (const spec of station.panels) {
        const el = document.querySelector(spec.select);
        if (!el) {
          console.warn(`[world] panel element not found: ${spec.select}`);
          continue;
        }

        // Remember exactly where this came from so it can be put back.
        const home = { parent: el.parentNode, next: el.nextSibling, cssText: el.style.cssText };

        el.classList.add('world-panel');

        // CSS3DRenderer transforms each element from the container's origin and
        // assumes it already sits there. Any margin or max-width the element
        // carried in the document silently offsets or shrinks it — and because
        // the offset is then multiplied by the perspective scale, a 3rem top
        // margin becomes thousands of pixels of drift as you approach.
        el.style.margin = '0';
        el.style.top = '0';
        el.style.left = '0';
        el.style.maxWidth = 'none';

        const object = new CSS3DObject(el);
        object.scale.setScalar(PANEL_SCALE);

        const panel = {
          spec, el, object, home,
          stationIndex: this.stations.length,
          localOffset: new Vector3(),
          world: new Vector3(),
        };
        entry.panels.push(panel);
        this.panels.push(panel);
        this.group.add(object);
      }

      this.stations.push(entry);
    }
  }

  /**
   * Measure and place every panel. Re-runnable: called on load and on every
   * resize, because at 1:1 whether a station fits is purely its authored pixel
   * size against the viewport.
   *
   * Panels are authored at a natural pixel width. If a station is wider than
   * the viewport allows, every panel in it is narrowed by the same factor and
   * re-measured — the text re-wraps at its real CSS size rather than being
   * scaled down, which is the whole point of docking at 1:1.
   */
  layout() {
    const available = Math.min(this.width * CONTENT_FRACTION, MAX_CONTENT_PX);

    for (const station of this.stations) {
      this.#applyWidths(station, 1);
      this.#arrange(station, 1);

      const naturalPx = station.extent.width / PANEL_SCALE;
      if (naturalPx > available) {
        const factor = available / naturalPx;
        if (factor < STACK_THRESHOLD) {
          // Past this point narrowing stops being responsive and starts being
          // cramped, so the station collapses to a single centred column —
          // exactly what a CSS grid does. The extra height is absorbed by the
          // camera pan, not by shrinking anything.
          this.#layoutStack(station, available);
        } else {
          // Re-wrapping changes heights, so widths and arrangement both redo.
          this.#applyWidths(station, factor);
          this.#arrange(station, factor);
        }
      }

      this.#place(station);
    }
  }

  /** One centred column, in authored order. The narrow-viewport fallback. */
  #layoutStack(station, available) {
    for (const panel of station.panels) {
      const natural = panel.spec.width / PANEL_SCALE;
      const px = Math.round(Math.min(natural, available));
      panel.el.style.width = `${px}px`;
      panel.px = px;
      panel.width = px * PANEL_SCALE;
    }
    for (const panel of station.panels) {
      panel.height = panel.el.offsetHeight * PANEL_SCALE;
    }

    const gap = station.grid?.gap ?? 1.4;
    const total =
      station.panels.reduce((sum, p) => sum + p.height, 0) + gap * (station.panels.length - 1);

    let cursorY = total / 2;
    for (const panel of station.panels) {
      panel.localOffset.set(0, cursorY - panel.height / 2, 0);
      cursorY -= panel.height + gap;
    }

    this.#measureExtent(station);
  }

  /** Set each panel's pixel width, then read back the height it produced. */
  #applyWidths(station, factor) {
    for (const panel of station.panels) {
      const px = Math.max(Math.round((panel.spec.width / PANEL_SCALE) * factor), MIN_PANEL_PX);
      panel.el.style.width = `${px}px`;
      panel.px = px;
      panel.width = px * PANEL_SCALE;
    }
    // Read heights only after every width is set, so one reflow covers them all.
    for (const panel of station.panels) {
      panel.height = panel.el.offsetHeight * PANEL_SCALE;
    }
  }

  /** Compute plane-local offsets and the station's local extent. */
  #arrange(station, factor) {
    const grid = [];

    for (const panel of station.panels) {
      if (panel.spec.offset) {
        panel.localOffset.set(
          panel.spec.offset[0] * factor,
          panel.spec.offset[1] * factor,
          0
        );
      } else {
        grid.push(panel);
      }
    }

    if (grid.length) this.#layoutGrid(station, grid, factor);
    this.#measureExtent(station);
  }

  /**
   * How many columns a row may have before its panels drop below a readable
   * width. Narrowing columns forever is not responsive — past a point a grid
   * has to shed columns, the same way a CSS grid does.
   */
  #columnsFor(station) {
    const available = Math.min(this.width * CONTENT_FRACTION, MAX_CONTENT_PX);
    const gapPx = (station.grid?.gap ?? 1.4) / PANEL_SCALE;
    const declared = Math.max(
      1,
      ...station.panels.filter((p) => !p.spec.full).map((p) => (p.spec.col ?? 0) + 1)
    );
    const fits = Math.floor((available + gapPx) / (MIN_PANEL_PX + gapPx));
    return Math.max(1, Math.min(declared, fits));
  }

  #measureExtent(station) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const panel of station.panels) {
      minX = Math.min(minX, panel.localOffset.x - panel.width / 2);
      maxX = Math.max(maxX, panel.localOffset.x + panel.width / 2);
      minY = Math.min(minY, panel.localOffset.y - panel.height / 2);
      maxY = Math.max(maxY, panel.localOffset.y + panel.height / 2);
    }
    if (!station.panels.length) minX = maxX = minY = maxY = 0;

    station.local = { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
    station.extent = { width: maxX - minX, height: maxY - minY };
  }

  #layoutGrid(station, grid, factor = 1) {
    const { gap: rawGap = 1.4, origin = [0, 0, 0] } = station.grid ?? {};
    const gap = rawGap * factor;

    // Reflow into as many columns as actually fit, in the authored order.
    // A `full` panel (a station heading) always takes a row of its own, so the
    // reflow can never fold it in beside the content it introduces.
    const columns = this.#columnsFor(station);
    const ordered = [...grid].sort(
      (a, b) => (a.spec.row - b.spec.row) || (a.spec.col - b.spec.col)
    );
    const rows = [];
    let current = [];
    for (const panel of ordered) {
      if (panel.spec.full) {
        if (current.length) rows.push(current);
        rows.push([panel]);
        current = [];
        continue;
      }
      current.push(panel);
      if (current.length === columns) {
        rows.push(current);
        current = [];
      }
    }
    if (current.length) rows.push(current);

    const rowHeights = rows.map((r) => Math.max(...r.map((p) => p.height)));
    const totalHeight = rowHeights.reduce((a, b) => a + b, 0) + gap * (rows.length - 1);

    let cursorY = totalHeight / 2;

    rows.forEach((panels, ri) => {
      const rowHeight = rowHeights[ri];
      const y = cursorY - rowHeight / 2;

      // Each row is centred on its own, so a short trailing row stays centred.
      const rowWidth = panels.reduce((sum, p) => sum + p.width, 0) + gap * (panels.length - 1);
      let cursorX = -rowWidth / 2;

      for (const panel of panels) {
        const x = cursorX + panel.width / 2;
        panel.localOffset.set(origin[0] * factor + x, origin[1] * factor + y, 0);
        cursorX += panel.width + gap;
      }

      cursorY -= rowHeight + gap;
    });
  }

  /**
   * Map each panel's 2D offset into the station's DOCK PLANE and derive the
   * station's centre from the same basis.
   *
   * Offsets are laid out in plane-local x/y and mapped through the dock
   * quaternion's right/up axes — not added to world x/y. A station whose
   * `view` is tilted has a tilted plane, and adding world-axis offsets to it
   * pushes side panels off-plane, so they sit at a different depth from the
   * camera and render at a different scale. That is exactly what broke 1:1 for
   * every off-centre panel.
   */
  #place(station) {
    const q = station.dockQuaternion;
    const right = new Vector3(1, 0, 0).applyQuaternion(q);
    const up = new Vector3(0, 1, 0).applyQuaternion(q);
    station.right = right;
    station.up = up;

    const { cx, cy } = station.local;

    station.center
      .copy(station.origin)
      .addScaledVector(right, cx)
      .addScaledVector(up, cy);

    for (const panel of station.panels) {
      panel.world
        .copy(station.origin)
        .addScaledVector(right, panel.localOffset.x)
        .addScaledVector(up, panel.localOffset.y);
      panel.object.position.copy(panel.world);
    }

    station.radius = Math.max(station.extent.width, station.extent.height) * 0.5;
  }

  /** Height of the fixed chrome that overlays the scene, in CSS pixels. */
  chromeInset() {
    const nav = document.querySelector('body > nav');
    const credit = document.querySelector('.world-credit');
    return {
      top: nav ? nav.offsetHeight : 0,
      bottom: credit ? credit.offsetHeight + 18 : 0,
    };
  }

  /**
   * The distance at which a docked panel renders at EXACTLY 1:1 pixel scale.
   *
   * CSS3DRenderer sets `perspective(fov px)` with
   *   fov = camera.projectionMatrix.elements[5] * heightHalf
   *       = heightHalf / tan(fovY / 2)
   * so an object at camera-space depth d renders at CSS scale fov / d, times
   * the object's own scale. Solving `PANEL_SCALE * fov / d === 1` gives one
   * distance that is the same for every station, whatever size its panels are.
   *
   * This is the whole point of the design: at this distance the type is
   * pixel-identical to a normal page instead of being resampled by the camera.
   */
  dockDistance(camera) {
    const fovPx = camera.projectionMatrix.elements[5] * (this.height / 2);
    return PANEL_SCALE * fovPx;
  }

  /**
   * Where the camera stands, and how it is oriented, to read a station.
   *
   * The orientation comes from a plain lookAt against world up, so it carries
   * no roll — 1:1 scale alone would still give crisp-but-tilted text.
   */
  dockPose(station, camera) {
    const distance = this.dockDistance(camera);
    const quaternion = station.dockQuaternion;
    // The camera sits back along the plane normal — +Z in the dock frame.
    const normal = new Vector3(0, 0, 1).applyQuaternion(quaternion);
    const position = station.center.clone().addScaledVector(normal, distance);

    // At 1:1 the viewport is exactly `height * PANEL_SCALE` world units tall,
    // so anything past that has to be panned rather than shrunk.
    const chrome = this.chromeInset();
    const usableWorld = (this.height - chrome.top - chrome.bottom) * PANEL_SCALE;
    const pan = Math.max(0, station.extent.height - usableWorld * VIEWPORT_MARGIN);

    // Centre the station in the area the fixed chrome leaves free, not in the
    // raw viewport — otherwise a station's heading sits behind the nav bar.
    const up = station.up;
    const shift = ((chrome.top - chrome.bottom) / 2) * PANEL_SCALE;
    position.addScaledVector(up, shift);

    return {
      position,
      quaternion: quaternion.clone(),
      distance,
      normal,
      up: station.up.clone(),
      pan,
      panScreens: pan / usableWorld,
    };
  }

  /**
   * Lay every panel flat in its station's dock plane.
   *
   * A CSS3DObject faces +Z, and a camera looks down its own -Z, so a panel is
   * screen-parallel exactly when its quaternion equals the camera's. Sharing
   * one quaternion across the station also means every panel sits at the same
   * depth and therefore the same scale — panels are deliberately coplanar for
   * this reason. Staggering one forward by z would render it fov/(d-z) larger,
   * which is crisp but the wrong size.
   */
  orientToDock(poses) {
    this.stations.forEach((station, i) => {
      const { quaternion } = poses[i];
      for (const panel of station.panels) {
        panel.object.quaternion.copy(quaternion);
      }
    });
  }

  update(cameraPosition, journeyIndex = 0) {
    for (const panel of this.panels) {
      // Hard cull by station first. Distance alone let a far station's panels
      // ghost through the one you are actually standing in.
      let opacity = 0;
      if (Math.abs(panel.stationIndex - journeyIndex) <= 1) {
        const distance = cameraPosition.distanceTo(panel.world);
        const t = (FADE_FAR - distance) / (FADE_FAR - FADE_NEAR);
        opacity = Math.min(Math.max(t, 0), 1);
      }

      if (opacity !== panel.lastOpacity) {
        panel.el.style.opacity = opacity.toFixed(3);
        // A faded panel must not swallow clicks meant for what is behind it,
        // and one that is fully gone should cost no layout at all.
        panel.el.style.pointerEvents = opacity > 0.25 ? 'auto' : 'none';
        panel.el.style.visibility = opacity > 0.01 ? 'visible' : 'hidden';
        panel.lastOpacity = opacity;
      }
    }
  }

  render(camera) {
    this.renderer.render(this.sceneRef, camera);
  }

  attachTo(scene) {
    this.sceneRef = scene;
    scene.add(this.group);
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height);
  }

  /** Put every element back exactly where it came from. */
  restore() {
    for (const panel of this.panels) {
      const { el, home } = panel;
      el.classList.remove('world-panel');
      el.style.cssText = home.cssText;
      if (home.parent) home.parent.insertBefore(el, home.next);
      else el.remove();
    }
    this.panels = [];
    this.renderer.domElement.remove();
  }
}
