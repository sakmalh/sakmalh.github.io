import { Quaternion, Vector3 } from 'three';

/**
 * Flies the camera between stations, and parks it exactly on a dock pose while
 * you read.
 *
 * The journey is a chain of alternating segments:
 *
 *   DOCK(0) → TRANSIT(0→1) → DOCK(1) → TRANSIT(1→2) → …
 *
 * During DOCK the camera holds the station's pose exactly — same distance,
 * same orientation — so the panels stay at 1:1. A station taller than the
 * viewport is read by translating the camera along its own up axis, which
 * never changes the distance to the panel plane and therefore never changes
 * the scale. Nothing is ever shrunk to fit.
 *
 * Orientation comes from the station's dock quaternion rather than lookAt,
 * because lookAt reintroduces roll, and roll makes docked text render rotated.
 */
const DOCK_BASE = 0.55;   // viewport-heights of dwell at a station with no pan
const TRANSIT_LEN = 1.0;  // viewport-heights of flight between two stations

function smootherstep(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this._position = new Vector3();
    this._quaternion = new Quaternion();
    this._from = new Vector3();
    this._to = new Vector3();
    this.poses = [];
    this.segments = [];
    this.total = 1;
  }

  /**
   * @param {Array<{position:Vector3, quaternion:Quaternion, up:Vector3, pan:number}>} poses
   */
  build(poses) {
    this.poses = poses;
    this.count = poses.length;
    this.segments = [];

    for (let i = 0; i < poses.length; i++) {
      // A station's dwell grows with how far the camera has to pan to read it.
      this.segments.push({ type: 'dock', i, len: DOCK_BASE + poses[i].panScreens });
      if (i < poses.length - 1) this.segments.push({ type: 'transit', i, len: TRANSIT_LEN });
    }

    this.total = this.segments.reduce((sum, seg) => sum + seg.len, 0) || 1;

    let acc = 0;
    for (const seg of this.segments) {
      seg.start = acc / this.total;
      acc += seg.len;
      seg.end = acc / this.total;
    }

    if (!this._initialised && poses.length) {
      this.camera.position.copy(this.#dockPoint(0, 0, this._position));
      this.camera.quaternion.copy(poses[0].quaternion);
      this._initialised = true;
    }
  }

  /** Progress at which station `i` is centred in its own dock segment. */
  stationProgress(i) {
    const seg = this.segments.find((s) => s.type === 'dock' && s.i === i);
    return seg ? seg.start + (seg.end - seg.start) * 0.5 : 0;
  }

  /**
   * Camera point for station `i` at pan position `t` (0 = top of the station,
   * 1 = bottom). Offsetting along the station's own up axis keeps the distance
   * to the panel plane — and therefore the 1:1 scale — untouched.
   */
  #dockPoint(i, t, out) {
    const pose = this.poses[i];
    return out.copy(pose.position).addScaledVector(pose.up, (0.5 - t) * pose.pan);
  }

  update(progress) {
    if (!this.count) return { index: 0, from: 0, blend: 0, transit: 0 };

    const p = Math.min(Math.max(progress, 0), 1);
    const seg = this.segments.find((s) => p <= s.end) ?? this.segments[this.segments.length - 1];
    const span = Math.max(seg.end - seg.start, 1e-6);
    const local = Math.min(Math.max((p - seg.start) / span, 0), 1);

    let index;
    let transit;

    let from;
    let blend;

    if (seg.type === 'dock') {
      index = seg.i;
      from = seg.i;
      blend = 0;
      transit = 0;
      this.#dockPoint(seg.i, local, this._position);
      this._quaternion.copy(this.poses[seg.i].quaternion);
    } else {
      from = seg.i;
      blend = smootherstep(local);
      // `index` is the nearest station (used for culling and accent); `from` +
      // `blend` describe the leg itself, which is what the field morphs along.
      index = blend < 0.5 ? seg.i : seg.i + 1;
      // Zero at both ends: reading is never disturbed by transit motion.
      transit = Math.sin(blend * Math.PI);

      // Leave the station from its bottom, arrive at the next one at its top.
      this.#dockPoint(seg.i, 1, this._from);
      this.#dockPoint(seg.i + 1, 0, this._to);

      this._position.copy(this._from).lerp(this._to, blend);
      this._quaternion
        .copy(this.poses[seg.i].quaternion)
        .slerp(this.poses[seg.i + 1].quaternion, blend);
    }

    // Set the pose directly — no smoothing toward it. Easing here would leave
    // the camera fractionally off the dock pose at rest, and "nearly 1:1" is
    // exactly the resampled-text problem this design exists to remove.
    this.camera.position.copy(this._position);
    this.camera.quaternion.copy(this._quaternion);

    return { index, from, blend, transit, segment: seg.type, local };
  }
}
